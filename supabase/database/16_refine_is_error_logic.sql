-- 16_refine_is_error_logic.sql
-- Refine error detection logic and fix false positives from Migration 15

-- 1. Re-evaluate is_error for existing logs
-- First, reset those that look like successes but were marked as errors 
UPDATE audit_logs SET is_error = FALSE
WHERE 
    is_error = TRUE AND
    (metadata->>'success')::boolean IS TRUE AND
    LOWER(type) != 'error' AND
    LOWER(action) NOT LIKE '%error%' AND
    LOWER(action) NOT LIKE '%fail%' AND
    LOWER(action) NOT LIKE '%exception%';

-- 2. Refine the statistics RPC with better precision
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
    
    -- Error identification logic:
    -- 1. is_error = TRUE (The explicit flag)
    -- 2. OR fallback for older entries that might have missed the flag:
    --    BUT exclude those where success is explicitly TRUE
    SELECT COUNT(*) INTO v_error_count 
    FROM audit_logs 
    WHERE 
        is_error = TRUE OR
        (
            (metadata->>'success')::boolean IS NOT TRUE AND
            (
                LOWER(type) LIKE '%error%' OR
                LOWER(action) LIKE '%error%' OR
                LOWER(action) LIKE '%fail%' OR
                LOWER(action) LIKE '%exception%' OR
                LOWER(action) LIKE '%timeout%' OR
                (metadata->>'error' IS NOT NULL AND metadata->>'error' != '') OR
                (metadata->>'failed')::boolean IS TRUE OR
                (CASE WHEN (metadata->>'statusCode') IS NOT NULL AND (metadata->>'statusCode') ~ '^[0-9]+$' 
                      THEN (metadata->>'statusCode')::int >= 400 ELSE FALSE END)
            )
        );

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
