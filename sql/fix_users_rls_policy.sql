-- Fix RLS policies for users table to allow backend operations
-- Run this in Supabase SQL editor

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
DROP POLICY IF EXISTS "Users can insert own data" ON public.users;  
DROP POLICY IF EXISTS "Users can update own data" ON public.users;

-- Create more permissive policy for backend operations
-- This allows the backend (using anon key) to manage users
CREATE POLICY "Allow backend user management" ON public.users
  FOR ALL 
  USING (true)
  WITH CHECK (true);

-- Optional: If you want more security later, you can use these policies instead:
-- CREATE POLICY "Users can view own data" ON public.users
--   FOR SELECT USING (
--     clerk_user_id = auth.jwt() ->> 'sub' 
--     OR auth.role() = 'service_role'
--     OR auth.role() = 'anon'
--   );

-- CREATE POLICY "Users can insert own data" ON public.users
--   FOR INSERT WITH CHECK (
--     clerk_user_id = auth.jwt() ->> 'sub' 
--     OR auth.role() = 'service_role'
--     OR auth.role() = 'anon'
--   );

-- CREATE POLICY "Users can update own data" ON public.users
--   FOR UPDATE USING (
--     clerk_user_id = auth.jwt() ->> 'sub' 
--     OR auth.role() = 'service_role'
--     OR auth.role() = 'anon'
--   );

-- Grant additional permissions to anon role
GRANT SELECT, INSERT, UPDATE ON public.users TO anon;