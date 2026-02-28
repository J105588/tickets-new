-- ===============================================================
-- 20260228000000_delete_s14_s25_seats.sql (kept name for migration versioning purposes)
-- Description: Re-inserts seats S14 through S25 if they were deleted
-- and sets their status to 'blocked'.
-- ===============================================================

BEGIN;

-- 1. If any of S14-S25 are somehow booked, cancel those bookings first to free up the references
UPDATE bookings
SET status = 'cancelled'
WHERE id IN (
    SELECT booking_id 
    FROM seats 
    WHERE row_letter = 'S' 
      AND seat_number >= 14 
      AND seat_number <= 25
      AND booking_id IS NOT NULL
);

-- 2. Insert the missing S14~S25 seats for ALL EXISTING performances
--    This ensures that the frontend can load them and render them as invisible spaces.
DO $$
DECLARE
    rec RECORD;
    seat_num INT;
BEGIN
    FOR rec IN SELECT id FROM performances LOOP
        FOR seat_num IN 14..25 LOOP
            INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
            VALUES (rec.id, 'S' || seat_num, 'S', seat_num, 'blocked')
            ON CONFLICT (performance_id, seat_id) 
            DO UPDATE SET 
                status = 'blocked',
                booking_id = NULL,
                reserved_by = NULL,
                reserved_at = NULL,
                checked_in_at = NULL,
                walkin_at = NULL,
                updated_at = NOW();
        END LOOP;
    END LOOP;
END
$$;

COMMIT;
