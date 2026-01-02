-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS (Optional but recommended)
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read access to everyone (for fetching deadline)
CREATE POLICY "Enable read access for all users" ON settings
    FOR SELECT USING (true);

-- Policy: Allow write access for all users (Required for Admin Dashboard without Auth)
-- WARNING: This allows anyone to change the deadline. Ideally, implement Supabase Auth.
CREATE POLICY "Enable write access for all users" ON settings
    FOR ALL USING (true) WITH CHECK (true);

-- Policy: Allow write access only to service_role (GAS uses service key usually or we can allow authenticated admins)
-- Assuming GAS uses Service Key which bypasses RLS, so this might not be strictly needed for GAS but good for structure.
-- If we want to allow Admin Dashboard (client-side) to save directly, we need Auth. 
-- For now, saving is done via GAS (Service Role), so RLS for write can be restrictive.
