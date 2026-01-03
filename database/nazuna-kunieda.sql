-- ===============================================================
-- nazuna-kunieda.sql
-- Complete Database Schema for Tickets System
-- Generated on 2025-12-28 (Updated 2026-01-04)
-- Refined to match AdminAPI.gs usage (settings table)
-- ===============================================================

-- 1. Master Data Tables (Refactored)
-- ===============================================================

CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_dates (
  id SERIAL PRIMARY KEY,
  date_label VARCHAR(50) NOT NULL, -- e.g. "1日目", "2024/07/20"
  event_date DATE, -- Optional: actual date
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_slots (
  id SERIAL PRIMARY KEY,
  slot_code VARCHAR(10) NOT NULL UNIQUE, -- "A", "B", etc.
  start_time VARCHAR(5), -- "09:00"
  end_time VARCHAR(5),   -- "10:00"
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Data for Master Tables
INSERT INTO groups (name, display_order) VALUES
('演劇部', 10),
('吹奏楽部', 20),
('オーケストラ部', 30),
('音楽部', 40),
('マーチング', 50)
ON CONFLICT (name) DO NOTHING;

INSERT INTO event_dates (date_label, display_order) VALUES
('1日目', 1),
('2日目', 2)
ON CONFLICT DO NOTHING;

INSERT INTO time_slots (slot_code, start_time, end_time, display_order) VALUES
('A', '09:00', '10:00', 10),
('B', '11:00', '12:00', 20),
('C', '13:00', '14:00', 30),
('D', '15:00', '16:00', 40),
('E', '17:00', '18:00', 50)
ON CONFLICT (slot_code) DO NOTHING;


-- 2. Core Tables
-- ===============================================================

-- Performances Table
CREATE TABLE IF NOT EXISTS performances (
  id SERIAL PRIMARY KEY,
  group_name VARCHAR(50) NOT NULL,
  day INTEGER NOT NULL, -- Logical Day ID (1 or 2)
  timeslot VARCHAR(10) NOT NULL, -- A, B, C...
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_name, day, timeslot)
);

-- Bookings Table (Replaces old 'reservations')
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY, -- Numeric ID
  performance_id INTEGER REFERENCES performances(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  grade_class VARCHAR(50), -- e.g. "3-1"
  club_affiliation VARCHAR(100),
  passcode VARCHAR(4) NOT NULL,
  status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'checked_in', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  checked_in_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

-- Seats Table
CREATE TABLE IF NOT EXISTS seats (
  id SERIAL PRIMARY KEY,
  performance_id INTEGER REFERENCES performances(id) ON DELETE CASCADE,
  seat_id VARCHAR(10) NOT NULL, -- e.g. A1, B2
  row_letter VARCHAR(1) NOT NULL, -- A-S
  seat_number INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'checked_in', 'walkin', 'blocked')),
  
  -- Reservation Info
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  reserved_by VARCHAR(100),
  reserved_at TIMESTAMP WITH TIME ZONE,
  checked_in_at TIMESTAMP WITH TIME ZONE,
  walkin_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(performance_id, seat_id)
);

-- Settings Table (Correct name for AdminAPI.gs)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);


-- 3. Indexes
-- ===============================================================
CREATE INDEX IF NOT EXISTS idx_seats_performance_id ON seats(performance_id);
CREATE INDEX IF NOT EXISTS idx_seats_status ON seats(status);
CREATE INDEX IF NOT EXISTS idx_seats_seat_id ON seats(seat_id);
CREATE INDEX IF NOT EXISTS idx_seats_booking_id ON seats(booking_id);

CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email);
CREATE INDEX IF NOT EXISTS idx_bookings_passcode ON bookings(passcode);
CREATE INDEX IF NOT EXISTS idx_reservations_performance_id ON bookings(performance_id); 


-- 4. Row Level Security (RLS)
-- ===============================================================

-- Enable RLS
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Master Data Policies (Public Read)
CREATE POLICY "Public read groups" ON groups FOR SELECT USING (true);
CREATE POLICY "Public read event_dates" ON event_dates FOR SELECT USING (true);
CREATE POLICY "Public read time_slots" ON time_slots FOR SELECT USING (true);

-- Performances Policy (Public Read)
DROP POLICY IF EXISTS "Enable read for public" ON performances;
CREATE POLICY "Enable read for public" ON performances FOR SELECT USING (true);

-- Bookings Policies
-- Allow Anonymous Insert (Create Reservation)
DROP POLICY IF EXISTS "Enable insert for anon (public)" ON bookings;
CREATE POLICY "Enable insert for anon (public)" ON bookings FOR INSERT WITH CHECK (true);
-- Select/Update/Delete are DENIED by default for anon (requires Security Definer functions)

-- Seats Policies
-- Public Read
DROP POLICY IF EXISTS "Enable read for anon (public)" ON seats;
CREATE POLICY "Enable read for anon (public)" ON seats FOR SELECT USING (true);

-- Settings Policies (Permissive)
DROP POLICY IF EXISTS "Allow all access to settings" ON settings;
CREATE POLICY "Allow all access to settings" ON settings FOR ALL USING (true) WITH CHECK (true);


-- 5. RPC Functions
-- ===============================================================

-- 5.1 Server Time
CREATE OR REPLACE FUNCTION get_server_time() 
RETURNS TIMESTAMPTZ 
LANGUAGE sql 
AS $$
  SELECT now();
$$;

-- 5.2 Seat Generation Function
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
  -- G-S列: 各38席
  FOR row_letter IN   SELECT unnest(ARRAY['G','H','I','J','K','L','M','N','O','P','Q','R','S']) LOOP
      FOR seat_num IN 1..38 LOOP
        INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
        VALUES (p_performance_id, row_letter || seat_num, row_letter, seat_num, 'available');
      END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 5.3 Initialize Performances (Seed Data)
CREATE OR REPLACE FUNCTION initialize_performances()
RETURNS VOID AS $$
DECLARE
  group_name VARCHAR(50);
  day_num INTEGER;
  timeslot_name VARCHAR(10);
  perf_id INTEGER;
BEGIN
  -- NOTE: This loops through a fixed array. Since we have master tables now, 
  -- future logic should likely perform dynamic initialization.
  -- Keeping this for backward compatibility/initial setup.
  FOR group_name IN SELECT unnest(ARRAY['オーケストラ部', '吹奏楽部', 'マーチング', '音楽部', '演劇部', '見本演劇']) LOOP
    FOR day_num IN 1..2 LOOP
      FOR timeslot_name IN SELECT unnest(ARRAY['A']) LOOP
        -- Upsert performance
        INSERT INTO performances (group_name, day, timeslot)
        VALUES (group_name, day_num, timeslot_name)
        ON CONFLICT (group_name, day, timeslot) DO UPDATE SET updated_at = NOW()
        RETURNING id INTO perf_id;
        
        -- Check if seats exist, if not generate
        IF NOT EXISTS (SELECT 1 FROM seats WHERE performance_id = perf_id LIMIT 1) THEN
             PERFORM generate_seats_for_performance(perf_id);
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 5.4 Check-in Reservation
CREATE OR REPLACE FUNCTION check_in_reservation(p_reservation_id INT, p_passcode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;

  IF v_booking.passcode <> p_passcode AND p_passcode IS NOT NULL AND p_passcode <> '' THEN
     RETURN jsonb_build_object('success', false, 'error', 'パスコードが違います');
  END IF;

  UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE id = p_reservation_id;
  UPDATE seats SET status = 'checked_in', checked_in_at = NOW() WHERE booking_id = p_reservation_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'チェックイン完了', 'data', jsonb_build_object('id', v_booking.id, 'name', v_booking.name));
END;
$$;

-- 5.5 Get Booking for Scan
CREATE OR REPLACE FUNCTION get_booking_for_scan(p_id INT)
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

-- 5.6 Admin: Get Reservations
CREATE OR REPLACE FUNCTION admin_get_reservations(
  p_group TEXT DEFAULT NULL,
  p_day INT DEFAULT NULL,
  p_timeslot TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_year INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_results JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'email', b.email,
      'grade_class', b.grade_class,
      'club_affiliation', b.club_affiliation,
      'passcode', b.passcode,
      'status', b.status,
      'created_at', b.created_at,
      'notes', b.notes,
      'performances', jsonb_build_object('group_name', p.group_name,'day', p.day,'timeslot', p.timeslot),
      'seats', (SELECT jsonb_agg(jsonb_build_object('seat_id', s.seat_id)) FROM seats s WHERE s.booking_id = b.id)
    ) ORDER BY b.created_at DESC
  ) INTO v_results
  FROM bookings b
  JOIN performances p ON b.performance_id = p.id
  WHERE 
    (p_group IS NULL OR p.group_name = p_group)
    AND (p_day IS NULL OR p.day = p_day)
    AND (p_timeslot IS NULL OR p.timeslot = p_timeslot)
    AND (p_status IS NULL OR b.status = p_status)
    AND (
       p_search IS NULL OR 
       b.name ILIKE '%' || p_search || '%' OR 
       b.email ILIKE '%' || p_search || '%' OR
       b.id::TEXT = p_search
    )
    AND (
       p_year IS NULL OR 
       b.grade_class LIKE p_year || '-%' OR 
       b.grade_class LIKE p_year || '年%' 
    );

  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_results, '[]'::jsonb));
END;
$$;

-- 5.7 Admin: Update Booking
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

  IF p_status = 'cancelled' THEN
     UPDATE seats SET status = 'available', booking_id = NULL, reserved_by = NULL, reserved_at = NULL, checked_in_at = NULL WHERE booking_id = p_id;
  ELSIF p_status = 'checked_in' THEN
     UPDATE seats SET status = 'checked_in', checked_in_at = NOW() WHERE booking_id = p_id;
  ELSIF p_status = 'confirmed' THEN
     UPDATE seats SET status = 'reserved', checked_in_at = NULL WHERE booking_id = p_id AND status = 'checked_in';
  END IF;

  RETURN jsonb_build_object('success', true, 'message', '更新しました');
END;
$$;

-- 5.8 Admin: Cancel Booking
CREATE OR REPLACE FUNCTION admin_cancel_booking(p_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE seats SET status = 'available', booking_id = NULL, reserved_by = NULL, reserved_at = NULL, checked_in_at = NULL WHERE booking_id = p_id;
  UPDATE bookings SET status = 'cancelled' WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;
  RETURN jsonb_build_object('success', true, 'message', 'キャンセルしました');
END;
$$;

-- 5.9 Admin: Swap Seats
CREATE OR REPLACE FUNCTION admin_swap_seats(p_booking_id INT, p_new_seat_ids_str TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking RECORD;
  v_perf_id INT;
  v_seat_arr TEXT[];
  v_count INT;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;
  
  v_perf_id := v_booking.performance_id;
  v_seat_arr := string_to_array(p_new_seat_ids_str, ',');

  SELECT COUNT(*) INTO v_count
  FROM seats 
  WHERE performance_id = v_perf_id 
    AND seat_id = ANY(v_seat_arr)
    AND status <> 'available'
    AND booking_id IS DISTINCT FROM p_booking_id;
    
  IF v_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '選択された座席の一部は既に埋まっています');
  END IF;

  UPDATE seats SET status = 'available', booking_id = NULL, reserved_by = NULL, reserved_at = NULL WHERE booking_id = p_booking_id;
  
  UPDATE seats
  SET status = 'reserved', booking_id = p_booking_id, reserved_by = v_booking.name, reserved_at = NOW()
  WHERE performance_id = v_perf_id AND seat_id = ANY(v_seat_arr);

  RETURN jsonb_build_object('success', true, 'message', '座席を変更しました');
END;
$$;

-- 5.10 Admin: Manage Master
CREATE OR REPLACE FUNCTION admin_manage_master(p_table TEXT, p_op TEXT, p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_table = 'groups' THEN
    IF p_op = 'add' THEN
      INSERT INTO groups (name, display_order, is_active) VALUES (p_data->>'name', (p_data->>'display_order')::INT, (p_data->>'is_active')::BOOLEAN);
    ELSIF p_op = 'update' THEN
      UPDATE groups SET name = p_data->>'name', display_order = (p_data->>'display_order')::INT, is_active = (p_data->>'is_active')::BOOLEAN WHERE id = (p_data->>'id')::INT;
    ELSIF p_op = 'delete' THEN
      DELETE FROM groups WHERE id = (p_data->>'id')::INT;
    END IF;
  ELSIF p_table = 'event_dates' THEN
    IF p_op = 'add' THEN
      INSERT INTO event_dates (date_label, display_order, is_active) VALUES (p_data->>'date_label', (p_data->>'display_order')::INT, (p_data->>'is_active')::BOOLEAN);
    ELSIF p_op = 'update' THEN
      UPDATE event_dates SET date_label = p_data->>'date_label', display_order = (p_data->>'display_order')::INT, is_active = (p_data->>'is_active')::BOOLEAN WHERE id = (p_data->>'id')::INT;
    ELSIF p_op = 'delete' THEN
      DELETE FROM event_dates WHERE id = (p_data->>'id')::INT;
    END IF;
  ELSIF p_table = 'time_slots' THEN
    IF p_op = 'add' THEN
      INSERT INTO time_slots (slot_code, start_time, end_time, display_order) VALUES (p_data->>'slot_code', p_data->>'start_time', p_data->>'end_time', (p_data->>'display_order')::INT);
    ELSIF p_op = 'update' THEN
      UPDATE time_slots SET slot_code = p_data->>'slot_code', start_time = p_data->>'start_time', end_time = p_data->>'end_time', display_order = (p_data->>'display_order')::INT WHERE id = (p_data->>'id')::INT;
    ELSIF p_op = 'delete' THEN
      DELETE FROM time_slots WHERE id = (p_data->>'id')::INT;
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid table name');
  END IF;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- 6. Initialization (Uncomment to execute if fresh db)
-- ===============================================================
-- SELECT initialize_performances();
