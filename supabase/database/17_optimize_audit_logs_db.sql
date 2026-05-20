-- 17_optimize_audit_logs_db.sql
-- Optimize audit_logs table and stats retrieval query for better performance

-- 1. Backfill NULL values in is_error to FALSE (guarantees no NULLs remain)
UPDATE audit_logs SET is_error = FALSE WHERE is_error IS NULL;

-- 2. Alter column to set NOT NULL and default
ALTER TABLE audit_logs ALTER COLUMN is_error SET DEFAULT FALSE;
ALTER TABLE audit_logs ALTER COLUMN is_error SET NOT NULL;

-- 3. Create index for is_error column
CREATE INDEX IF NOT EXISTS idx_audit_logs_is_error ON audit_logs(is_error);

-- 4. Optimize the get_audit_stats RPC to count directly by is_error column
-- This avoids parsing complex JSONB metadata or performing string operations on every query.
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
    -- Fast counts utilizing indices
    SELECT COUNT(*) INTO v_total_ops FROM audit_logs;
    SELECT COUNT(*) INTO v_error_count FROM audit_logs WHERE is_error = TRUE;
    
    v_success_count := v_total_ops - v_error_count;

    -- Aggregate breakdown (limited to top types/actions)
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
