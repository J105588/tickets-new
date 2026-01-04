-- Secure get_booking_for_scan to prevent enumeration
-- Requires passcode verification

CREATE OR REPLACE FUNCTION get_booking_for_scan(p_id INT, p_passcode TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking RECORD;
  v_seats RECORD;
BEGIN
  SELECT b.*, p.group_name, p.day, p.timeslot
  INTO v_booking
  FROM bookings b
  JOIN performances p ON b.performance_id = p.id
  WHERE b.id = p_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;

  -- Security Check: Passcode must match (unless p_passcode is NULL/Empty, which implies manual ID-only input??)
  -- Wait, if we want to prevent enumeration, we MUST require passcode or strict verification.
  -- admin-scan.js sends passcode if available (QR scan). 
  -- If manual input (ID only), we might be stuck. 
  -- BUT the original `admin-scan.js` allows ID-only manual input logic: "id = decodedText; pass = null;"
  -- If we enforce passcode, manual ID entry without passcode will fail.
  -- However, for SECURITY, we should require it, OR the admin must be authenticated.
  -- Since this is an RPC called by anon, we MUST require a passcode or a shared secret.
  -- User's QR code has passcode. Manual entry... usually doesn't have passcode handy?
  -- Let's enforce passcode check IF p_passcode IS PROVIDED. 
  -- If p_passcode is NULL, we should probably DENY unless we want to allow enumeration.
  -- Let's strictly require passcode matching. 
  
  -- Logic: If the booking has a passcode, the input MUST match it.
  IF v_booking.passcode IS DISTINCT FROM p_passcode THEN
     RETURN jsonb_build_object('success', false, 'error', 'パスコードが一致しません');
  END IF;

  SELECT string_agg(seat_id, ', ' ORDER BY seat_id) as seat_list
  INTO v_seats
  FROM seats WHERE booking_id = p_id;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id', v_booking.id,
      'name', v_booking.name,
      'grade_class', v_booking.grade_class,
      'status', v_booking.status,
      'passcode', v_booking.passcode, 
      'performances', jsonb_build_object('group_name', v_booking.group_name, 'day', v_booking.day, 'timeslot', v_booking.timeslot),
      'seats', CASE WHEN v_seats.seat_list IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('seat_id', v_seats.seat_list)) END
    )
  );
END;
$$;
