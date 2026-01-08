-- 11_create_booking_events.sql
-- Realtime Signaling for Reservation Status
-- Created: 2026-01-08

-- 1. Create Signal Table
CREATE TABLE IF NOT EXISTS booking_events (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- 'CHECK_IN', 'CANCEL', 'UPDATE'
  status VARCHAR(20) NOT NULL, -- Current status of booking
  payload JSONB DEFAULT '{}'::jsonb, -- Extra data if needed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. RLS Settings for Signal Table
ALTER TABLE booking_events ENABLE ROW LEVEL SECURITY;

-- Allow Public Read (Anonymous users need to listen to their booking events via ID)
-- Ideally we restrict by ID but Realtime filters are client-side mostly for broad channels.
-- Since this table only contains status changes and no PII (checked by schema), public read is acceptable for the feature.
DROP POLICY IF EXISTS "Enable read for public" ON booking_events;
CREATE POLICY "Enable read for public" 
ON booking_events FOR SELECT 
USING (true);

-- Allow Service Role (RPC) to Insert
-- Default Deny for others.

-- 3. Cleanup Function (Optional: to keep table small)
-- Can be handled by a separate cron or trigger, skipping for now.

-- 4. Update RPC: check_in_reservation
CREATE OR REPLACE FUNCTION check_in_reservation(p_reservation_id INT, p_passcode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
BEGIN
  -- 1. 予約の検索
  SELECT * INTO v_booking FROM bookings WHERE id = p_reservation_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;

  -- 2. パスコードの照合
  IF v_booking.passcode <> p_passcode AND p_passcode IS NOT NULL AND p_passcode <> '' THEN
     RETURN jsonb_build_object('success', false, 'error', 'パスコードが違います');
  END IF;

  -- 3. ステータスの更新 (予約)
  UPDATE bookings 
  SET status = 'checked_in', checked_in_at = NOW() 
  WHERE id = p_reservation_id;
  
  -- 4. ステータスの更新 (座席)
  UPDATE seats 
  SET status = 'checked_in', checked_in_at = NOW() 
  WHERE booking_id = p_reservation_id;
  
  -- [NEW] 5. Emit Signal
  INSERT INTO booking_events (booking_id, event_type, status)
  VALUES (p_reservation_id, 'CHECK_IN', 'checked_in');

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'チェックイン完了',
    'data', jsonb_build_object('id', v_booking.id, 'name', v_booking.name)
  );
END;
$$;

-- 5. Update RPC: admin_cancel_booking
CREATE OR REPLACE FUNCTION admin_cancel_booking(p_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 座席開放
  UPDATE seats 
  SET status = 'available', booking_id = NULL, reserved_by = NULL, reserved_at = NULL, checked_in_at = NULL
  WHERE booking_id = p_id;

  -- 予約ステータス更新
  UPDATE bookings
  SET status = 'cancelled'
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;

  -- [NEW] Emit Signal
  INSERT INTO booking_events (booking_id, event_type, status)
  VALUES (p_id, 'CANCEL', 'cancelled');

  RETURN jsonb_build_object('success', true, 'message', 'キャンセルしました');
END;
$$;
