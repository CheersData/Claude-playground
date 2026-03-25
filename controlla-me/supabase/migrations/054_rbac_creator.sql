-- ============================================================================
-- 054_rbac_creator.sql — RBAC Creator Role (L1)
--
-- Adds 'creator' role between 'admin' and 'operator' in the hierarchy.
-- Creator L1 can CRUD everything EXCEPT DELETE/UPDATE on protected resources.
-- Boss can deactivate creators via toggle_creator_active().
--
-- Depends on: 046 (app_role enum, role_permissions), 047 (role-protected update)
-- ============================================================================

-- 1. Add 'creator' value to app_role enum (between admin and operator)
-- PostgreSQL enums are ordered by creation order, but our hierarchy is enforced
-- in application code (ROLE_HIERARCHY array), not by enum ordering.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'creator' AND enumtypid = 'app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'creator';
  END IF;
END
$$;

-- 2. Add 'active' column to profiles (for deactivating creators)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'active'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN active boolean NOT NULL DEFAULT true;
  END IF;
END
$$;

-- 3. Add 'deactivated_at' column to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'deactivated_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN deactivated_at timestamptz;
  END IF;
END
$$;

-- 4. Seed creator permissions (idempotent via ON CONFLICT)
INSERT INTO public.role_permissions (role, permission) VALUES
  ('creator', 'console.access'),
  ('creator', 'api.analyze.unlimited'),
  ('creator', 'departments.create'),
  ('creator', 'departments.update_own'),
  ('creator', 'departments.delete_own')
ON CONFLICT (role, permission) DO NOTHING;

-- 5. Index on active column for fast lookups of deactivated users
CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles(active) WHERE NOT active;

-- 6. RPC: toggle_creator_active — only boss can call this
CREATE OR REPLACE FUNCTION public.toggle_creator_active(
  target_user_id uuid,
  set_active boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role app_role;
  target_role app_role;
BEGIN
  -- Get caller's role
  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  -- Only boss can toggle creator active status
  IF caller_role IS NULL OR caller_role != 'boss' THEN
    RAISE EXCEPTION 'Unauthorized: only boss can toggle creator active status';
  END IF;

  -- Get target's role
  SELECT role INTO target_role
  FROM public.profiles
  WHERE id = target_user_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Can only toggle creators (not boss, admin, operator, user)
  IF target_role != 'creator' THEN
    RAISE EXCEPTION 'Can only toggle active status for creator role, target has role: %', target_role;
  END IF;

  -- Update active status and deactivated_at timestamp
  UPDATE public.profiles
  SET
    active = set_active,
    deactivated_at = CASE WHEN set_active THEN NULL ELSE now() END
  WHERE id = target_user_id;
END;
$$;

-- 7. Update update_user_role to handle creator role properly
-- Admin can assign creator role (it's below admin). Boss can assign anything.
CREATE OR REPLACE FUNCTION public.update_user_role(
  target_user_id uuid,
  new_role app_role
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role app_role;
BEGIN
  -- Get caller's role from their profile
  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  -- Only boss and admin can change roles
  IF caller_role IS NULL OR caller_role NOT IN ('boss', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only boss or admin can modify roles';
  END IF;

  -- Admin cannot promote to boss or admin (only boss can)
  IF caller_role = 'admin' AND new_role IN ('boss', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only boss can assign boss or admin roles';
  END IF;

  -- Boss cannot be demoted (safety)
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND role = 'boss') THEN
    IF new_role != 'boss' THEN
      RAISE EXCEPTION 'Cannot demote boss role';
    END IF;
  END IF;

  UPDATE public.profiles SET role = new_role WHERE id = target_user_id;
END;
$$;
