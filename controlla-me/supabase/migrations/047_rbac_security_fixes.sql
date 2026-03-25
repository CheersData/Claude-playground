-- ============================================================================
-- 047_rbac_security_fixes.sql — Fix CRITICAL/HIGH RBAC security findings
--
-- C1: Users can self-promote via unrestricted UPDATE policy on profiles
-- Fix: Drop old policy, create restricted one + trigger preventing role changes
--
-- Depends on: 001 (profiles RLS), 046 (app_role type, role column)
-- ============================================================================

-- ─── C1: Prevent role self-promotion via RLS UPDATE policy ───

-- 1. Drop the old unrestricted UPDATE policy from 001_initial.sql
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- 2. Create a new UPDATE policy that allows users to update their own profile.
--    The trigger below prevents them from changing the `role` column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
    AND policyname = 'Users can update own profile (role-protected)'
  ) THEN
    CREATE POLICY "Users can update own profile (role-protected)" ON public.profiles
      FOR UPDATE USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END
$$;

-- 3. Create a BEFORE UPDATE trigger that blocks role column modification
--    unless the caller is service_role (used by admin RPC functions).
CREATE OR REPLACE FUNCTION public.prevent_role_self_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Allow service_role (admin operations via RPC like update_user_role)
    IF COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Role modification not allowed: use update_user_role() RPC'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$;

-- Drop and recreate to ensure latest version
DROP TRIGGER IF EXISTS trg_prevent_role_self_update ON public.profiles;

CREATE TRIGGER trg_prevent_role_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_update();
