-- Fix for Ambiguous RPC Call
-- The error "Could not choose the best candidate function" occurs because there are two versions of get_booking_for_scan:
-- 1. get_booking_for_scan(p_id integer)
-- 2. get_booking_for_scan(p_id integer, p_passcode text DEFAULT NULL)
--
-- Calling it with just an integer makes Postgres unsure which one to use (explicit single arg vs. second with default).
-- We need to remove the old single-argument version.

DROP FUNCTION IF EXISTS get_booking_for_scan(integer);

-- The correct version (with passcode) is defined in 06_secure_rpc.sql and should remain.
-- If it was accidentally dropped, you can re-run 06_secure_rpc.sql, but DROP only targets the specific signature.
