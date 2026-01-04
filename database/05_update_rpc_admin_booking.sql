-- update_rpc_admin_booking.sql
-- Function to ensure seat statuses are synchronized when booking status changes via Admin UI.
-- Specifically handles:
-- 1. Checked-in -> Confirmed (Reverts seats to reserved, clears checked_in_at)
-- 2. Confirmed -> Checked-in (Updates seats to checked_in, sets checked_in_at)
-- 3. * -> Cancelled (Releases seats)

CREATE OR REPLACE FUNCTION admin_update_booking(
  p_id INT,
  p_name TEXT,
  p_email TEXT,
  p_grade_class TEXT,
  p_club_affiliation TEXT,
  p_notes TEXT,
  p_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Update Booking
  UPDATE bookings
  SET name = p_name,
      email = p_email,
      grade_class = p_grade_class,
      club_affiliation = p_club_affiliation,
      notes = p_notes,
      status = COALESCE(p_status, status)
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;

  -- 2. Sync Seats based on Status
  IF p_status = 'cancelled' THEN
     -- Release seats
     UPDATE seats 
     SET status = 'available', 
         booking_id = NULL, 
         reserved_by = NULL, 
         reserved_at = NULL, 
         checked_in_at = NULL 
     WHERE booking_id = p_id;

  ELSIF p_status = 'checked_in' THEN
     -- Mark seats as checked_in
     UPDATE seats 
     SET status = 'checked_in', 
         checked_in_at = NOW() 
     WHERE booking_id = p_id;

  ELSIF p_status = 'confirmed' THEN
     -- Revert to reserved (only if currently checked_in, to avoid touching other states)
     UPDATE seats 
     SET status = 'reserved', 
         checked_in_at = NULL 
     WHERE booking_id = p_id AND status = 'checked_in';
  END IF;

  RETURN jsonb_build_object('success', true, 'message', '更新しました');
END;
$$;
