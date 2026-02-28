-- Secure Reservation RPC
-- Handles Booking Insertion + Seat Updates Transactionally
-- Bypasses RLS restrictions via SECURITY DEFINER

CREATE OR REPLACE FUNCTION create_reservation(
  p_group TEXT,
  p_day INT,
  p_timeslot TEXT,
  p_name TEXT,
  p_email TEXT,
  p_grade_class TEXT,
  p_club_affiliation TEXT,
  p_seats TEXT[], -- Array of Seat IDs e.g. ['A1', 'A2']
  p_reserved_by TEXT DEFAULT '予約者'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_perf_id INT;
  v_booking_id INT;
  v_seat_count INT;
  v_passcode TEXT;
BEGIN
  -- 1. Get Performance ID
  SELECT id INTO v_perf_id
  FROM performances
  WHERE group_name = p_group AND day = p_day AND timeslot = p_timeslot;

  IF v_perf_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '指定された公演が見つかりません');
  END IF;

  -- 2. Check Seat Availability (Must be 'available')
  SELECT COUNT(*) INTO v_seat_count
  FROM seats
  WHERE performance_id = v_perf_id
    AND seat_id = ANY(p_seats)
    AND status <> 'available';

  IF v_seat_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '選択された座席の一部は既に予約されています');
  END IF;

  -- 3. Generate Passcode (4 digits)
  v_passcode := lpad(floor(random() * 10000)::text, 4, '0');

  -- 4. Insert Booking
  INSERT INTO bookings (
    performance_id, name, email, grade_class, club_affiliation, passcode, status, created_at
  ) VALUES (
    v_perf_id, p_name, p_email, p_grade_class, p_club_affiliation, v_passcode, 'confirmed', NOW()
  ) RETURNING id INTO v_booking_id;

  -- 5. Update Seats
  UPDATE seats
  SET status = 'reserved',
      booking_id = v_booking_id,
      reserved_by = p_reserved_by,
      reserved_at = NOW()
  WHERE performance_id = v_perf_id
    AND seat_id = ANY(p_seats);

  -- 6. Return Result
  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'booking_id', v_booking_id,
      'passcode', v_passcode,
      'reserved_seats', p_seats
    )
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
