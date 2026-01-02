-- Fix RLS Policy for Settings Table
-- This script drops existing policies and creates a new one that allows ALL operations (Read/Write) for everyone.

-- 1. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON settings;
DROP POLICY IF EXISTS "Enable write access for all users" ON settings;
DROP POLICY IF EXISTS "Allow all access to settings" ON settings;

-- 2. Ensure RLS is enabled
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 3. Create a single, fully permissive policy for anon/public users
-- This allows SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "Allow all access to settings"
ON settings
FOR ALL
USING (true)
WITH CHECK (true);
