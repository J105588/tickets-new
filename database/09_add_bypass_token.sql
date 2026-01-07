-- Add Maintenance Bypass Token to settings
INSERT INTO settings (key, value, description)
VALUES (
    'MAINTENANCE_BYPASS_TOKEN',
    '9f8e7d6c5b4a3f2e1', 
    'Token for bypassing maintenance mode. Usage: ?maintenance_bypass=9f8e7d6c5b4a3f2e1'
)
ON CONFLICT (key) DO UPDATE 
SET value = '9f8e7d6c5b4a3f2e1';
