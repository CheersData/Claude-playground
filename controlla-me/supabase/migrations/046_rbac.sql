-- ============================================================================
-- 044_rbac.sql — Role-Based Access Control (RBAC)
--
-- Adds multi-level roles to profiles and a role_permissions mapping table.
-- Roles: boss > admin > operator > user
-- Boss has unrestricted access ('*'). Regular Supabase Auth users default to 'user'.
-- ============================================================================

-- 1. Create the role enum type (IF NOT EXISTS via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM ('boss', 'admin', 'operator', 'user');
  END IF;
END
$$;

-- 2. Add role column to profiles (default 'user' for existing and new users)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role app_role NOT NULL DEFAULT 'user';
  END IF;
END
$$;

-- 3. Create role_permissions table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (role, permission)
);

-- 4. Seed default permissions (idempotent via ON CONFLICT)
INSERT INTO public.role_permissions (role, permission) VALUES
  -- Boss: wildcard (everything)
  ('boss', '*'),
  -- Admin: console + company + trading + unlimited analyses
  ('admin', 'console.access'),
  ('admin', 'console.company'),
  ('admin', 'console.trading'),
  ('admin', 'api.analyze.unlimited'),
  -- Operator: console access + unlimited analyses
  ('operator', 'console.access'),
  ('operator', 'api.analyze.unlimited'),
  -- User: basic app usage
  ('user', 'api.analyze.basic')
ON CONFLICT (role, permission) DO NOTHING;

-- 5. Index for fast permission lookups
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 6. RLS on role_permissions
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Everyone can read permissions (needed for client-side checks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'role_permissions' AND policyname = 'role_permissions_select_all'
  ) THEN
    CREATE POLICY role_permissions_select_all ON public.role_permissions
      FOR SELECT USING (true);
  END IF;
END
$$;

-- Only service_role can modify permissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'role_permissions' AND policyname = 'role_permissions_modify_service'
  ) THEN
    CREATE POLICY role_permissions_modify_service ON public.role_permissions
      FOR ALL USING (
        (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
      );
  END IF;
END
$$;

-- 7. RLS on profiles.role: users can read their own role, only service_role can UPDATE role
-- Note: profiles already has RLS enabled from 001_initial.sql.
-- We add a specific policy for role updates.

-- Users can read their own profile (should already exist, but ensure)
-- The existing SELECT policy from 001 covers this.

-- Only service_role can update the role column.
-- We use a function + trigger approach since column-level RLS isn't supported directly.
-- Instead, we create an RPC function for role updates.

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

-- 8. Helper function: get permissions for a role (includes wildcard check)
CREATE OR REPLACE FUNCTION public.get_role_permissions(target_role app_role)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(permission), ARRAY[]::text[])
  FROM public.role_permissions
  WHERE role = target_role;
$$;

-- 9. Helper function: check if a role has a specific permission
CREATE OR REPLACE FUNCTION public.role_has_permission(target_role app_role, required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role = target_role
    AND (permission = required_permission OR permission = '*')
  );
$$;
