-- ===============================================================
-- 20260315000000_fix_s_seats_rpc_and_data.sql
-- Description: Updates the generate_seats_for_performance RPC so 
-- S14~S25 are created as 'blocked', and restores missing seats
-- for existing performances.
-- ===============================================================

BEGIN;

-- 1. Restore missing S14~S25 seats for ALL EXISTING performances
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

-- 2. Update the seat generation RPC to properly handle S14~S25
CREATE OR REPLACE FUNCTION generate_seats_for_performance(p_performance_id INTEGER)
RETURNS VOID AS $$
DECLARE
  row_letter CHAR(1);
  seat_num INTEGER;
BEGIN
  -- A列: 6-33番（28席）
  FOR seat_num IN 6..33 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'A' || seat_num, 'A', seat_num, 'available');
  END LOOP;
  -- B列: 5-34番（30席）
  FOR seat_num IN 5..34 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'B' || seat_num, 'B', seat_num, 'available');
  END LOOP;
  -- C列: 4-35番（32席）
  FOR seat_num IN 4..35 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'C' || seat_num, 'C', seat_num, 'available');
  END LOOP;
  -- D列: 3-36番（34席）
  FOR seat_num IN 3..36 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'D' || seat_num, 'D', seat_num, 'available');
  END LOOP;
  -- E列: 2-37番（36席）
  FOR seat_num IN 2..37 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'E' || seat_num, 'E', seat_num, 'available');
  END LOOP;
  -- F列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'F' || seat_num, 'F', seat_num, 'available');
  END LOOP;
  -- G-R列: 各38席
  FOR row_letter IN   SELECT unnest(ARRAY['G','H','I','J','K','L','M','N','O','P','Q','R']) LOOP
      FOR seat_num IN 1..38 LOOP
        INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
        VALUES (p_performance_id, row_letter || seat_num, row_letter, seat_num, 'available');
      END LOOP;
  END LOOP;
  -- S列: 38席 (14~25はblockedに)
  FOR seat_num IN 1..38 LOOP
    IF seat_num BETWEEN 14 AND 25 THEN
        INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
        VALUES (p_performance_id, 'S' || seat_num, 'S', seat_num, 'blocked');
    ELSE
        INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
        VALUES (p_performance_id, 'S' || seat_num, 'S', seat_num, 'available');
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMIT;
