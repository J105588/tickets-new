-- Secure Settings Table RLS
-- Restrict Public Write Access

-- 1. Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all access to settings" ON settings;

-- 2. Create Public Read-Only Policy
CREATE POLICY "Public read settings" ON settings FOR SELECT USING (true);

-- 3. Deny Anon Write (Implicit by default denial, but ensure no other policies allow it)
-- Only Service Role (GAS) should be able to write now.

-- NOTE: The frontend (admin.js) currently uses anon key to write via 'adminDeadlineSettings'.
-- This will break unless we switch to an RPC or GAS endpoint.
-- Based on the audit, we will rely on GAS or a new Secure RPC for updates.
