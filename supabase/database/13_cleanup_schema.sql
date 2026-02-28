-- 13_cleanup_schema.sql
-- Remove legacy/conflicting tables to ensure system consistency
-- Active tables are 'bookings' and 'settings'
-- Deprecated tables are 'reservations' and 'system_settings'

-- 1. Drop Legacy Reservations Table
DROP TABLE IF EXISTS reservations CASCADE;

-- 2. Drop Legacy Settings Table
DROP TABLE IF EXISTS system_settings CASCADE;

-- 3. Cleanup Legacy Sequences if any (Optional, typically dropped with table)
DROP SEQUENCE IF EXISTS reservations_id_seq;
DROP SEQUENCE IF EXISTS system_settings_id_seq;
