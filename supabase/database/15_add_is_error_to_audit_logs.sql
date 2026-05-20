-- 15_add_is_error_to_audit_logs.sql
-- Add is_error column to audit_logs for more reliable error tracking

-- 1. Add the column
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS is_error BOOLEAN DEFAULT FALSE;

-- 2. Backfill existing data (Optional but recommended)
UPDATE audit_logs SET is_error = TRUE 
WHERE 
    LOWER(type) LIKE '%error%' OR
    LOWER(action) LIKE '%error%' OR
    (metadata->>'success')::boolean IS FALSE OR
    metadata ? 'error' OR
    (CASE WHEN (metadata->>'statusCode') IS NOT NULL AND (metadata->>'statusCode') ~ '^[0-9]+$' 
          THEN (metadata->>'statusCode')::int >= 400 ELSE FALSE END);

-- 3. Update the statistics RPC to use the new column
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
    
    -- Now simply count based on is_error column
    SELECT COUNT(*) INTO v_error_count FROM audit_logs WHERE is_error = TRUE;
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
