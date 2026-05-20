-- 14_create_audit_logs.sql
-- Create audit_logs table to store system and client-side events

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type TEXT NOT NULL, -- e.g., 'ui', 'api', 'error', 'system'
    action TEXT NOT NULL, -- e.g., 'click', 'create_reservation', 'error_window'
    metadata JSONB DEFAULT '{}'::JSONB,
    session_id TEXT,
    user_id TEXT,
    ip_address TEXT,
    user_agent TEXT
);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Note: GAS uses Service Role which bypasses RLS. 
-- No public access policies added for security.

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id);

-- RPC for server-side audit statistics
CREATE OR REPLACE FUNCTION get_audit_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_ops INT;
    v_success_count INT;
    v_error_count INT;
    v_by_type JSONB;
    v_by_action JSONB;
BEGIN
    SELECT COUNT(*) INTO v_total_ops FROM audit_logs;
    
    SELECT COUNT(*) INTO v_error_count 
    FROM audit_logs 
    WHERE 
        LOWER(type) LIKE '%error%' OR
        LOWER(action) LIKE '%error%' OR
        LOWER(action) LIKE '%fail%' OR
        LOWER(action) LIKE '%exception%' OR
        LOWER(action) LIKE '%timeout%' OR
        (metadata->>'success')::boolean IS FALSE OR
        metadata ? 'error' OR
        metadata ? 'failed' OR
        metadata ? 'errorMessage' OR
        metadata ? 'errorMsg' OR
        (CASE WHEN (metadata->>'statusCode') IS NOT NULL AND (metadata->>'statusCode') ~ '^[0-9]+$' 
              THEN (metadata->>'statusCode')::int >= 400 ELSE FALSE END);

    v_success_count := v_total_ops - v_error_count;

    SELECT jsonb_object_agg(type, count) INTO v_by_type
    FROM (SELECT type, COUNT(*) as count FROM audit_logs GROUP BY type LIMIT 50) t;

    SELECT jsonb_object_agg(action, count) INTO v_by_action
    FROM (SELECT action, COUNT(*) as count FROM audit_logs GROUP BY action LIMIT 100) a;

    RETURN jsonb_build_object(
        'totalOperations', v_total_ops,
        'successCount', v_success_count,
        'errorCount', v_error_count,
        'byType', COALESCE(v_by_type, '{}'::JSONB),
        'byAction', COALESCE(v_by_action, '{}'::JSONB)
    );
END;
$$;
