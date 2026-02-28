-- 12_secure_settings.sql
-- Security Hardening for Settings Table
-- Created: 2026-01-08

-- 1. Enable RLS (Ensure it is on)
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 2. Drop insecure policies
DROP POLICY IF EXISTS "Allow all access to settings" ON settings;
DROP POLICY IF EXISTS "Public read settings" ON settings;
DROP POLICY IF EXISTS "Public read safe settings" ON settings;

-- 3. Create Restricted Read Policy
-- Allow public to read ONLY non-sensitive settings (e.g. deadlines, maintenance status)
-- Deny access to keys containing 'password' or 'secret'
-- EXCEPTION: 'MAINTENANCE_BYPASS_TOKEN' is allowed (used by client-side maintenance check)
CREATE POLICY "Public read safe settings" 
ON settings FOR SELECT 
USING (
  (key NOT ILIKE '%password%') 
  AND (key NOT ILIKE '%secret%')
  -- We allow keys with 'token' only if it is the maintenance bypass token
  AND (key NOT ILIKE '%token%' OR key = 'MAINTENANCE_BYPASS_TOKEN')
);

-- 4. Service Role (GAS) Bypasses RLS automatically, so no policy needed for it.
-- Anon users cannot INSERT/UPDATE/DELETE (Default Deny).
