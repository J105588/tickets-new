-- 18_secure_admin_rpc_permissions.sql
-- 管理者用RPC関数の実行権限を制限する
-- PUBLIC（anon, authenticatedロールなど）からのEXECUTE権限を剥奪し、service_roleにのみ実行権限を付与します。

-- 1. admin_get_reservations
REVOKE EXECUTE ON FUNCTION admin_get_reservations(TEXT, INT, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_get_reservations(TEXT, INT, TEXT, TEXT, TEXT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_get_reservations(TEXT, INT, TEXT, TEXT, TEXT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_get_reservations(TEXT, INT, TEXT, TEXT, TEXT, INT) TO service_role;

-- 2. admin_update_booking
REVOKE EXECUTE ON FUNCTION admin_update_booking(INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_update_booking(INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_update_booking(INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_update_booking(INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 3. admin_cancel_booking
REVOKE EXECUTE ON FUNCTION admin_cancel_booking(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_cancel_booking(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_cancel_booking(INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_cancel_booking(INT) TO service_role;

-- 4. admin_swap_seats
REVOKE EXECUTE ON FUNCTION admin_swap_seats(INT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_swap_seats(INT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_swap_seats(INT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_swap_seats(INT, TEXT) TO service_role;

-- 5. admin_manage_master
REVOKE EXECUTE ON FUNCTION admin_manage_master(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_manage_master(TEXT, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_manage_master(TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_manage_master(TEXT, TEXT, JSONB) TO service_role;
