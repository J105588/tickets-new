-- Optimization for Scan Performance
-- The RPC "get_booking_for_scan" filters "seats" by "booking_id".
-- Adding an index on this column will significantly speed up the lookup, especially as the number of seats grows.

CREATE INDEX IF NOT EXISTS idx_seats_booking_id ON seats(booking_id);

-- Also ensure bookings(id) is indexed (it is PK, so yes).
-- Ensure bookings(performance_id) is indexed (likely yes via FK, but explicit index helps JOIN).
CREATE INDEX IF NOT EXISTS idx_bookings_performance_id ON bookings(performance_id);
