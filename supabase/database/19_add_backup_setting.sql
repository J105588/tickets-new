-- Migration 19: Add default backup setting
-- Key: BACKUP_AUTO_ENABLED
-- Value: 'true' (default enabled)

INSERT INTO settings (key, value, description, updated_at)
VALUES (
    'BACKUP_AUTO_ENABLED', 
    'true', 
    '自動定期バックアップを有効にするかどうかの設定 (true/false)', 
    NOW()
)
ON CONFLICT (key) DO NOTHING;
