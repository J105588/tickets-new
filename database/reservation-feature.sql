-- 予約システム機能追加用スキーマ
-- 2025-12-26 作成 (Idempotent Version)
-- このスクリプトは何度実行しても安全なように設計されています

-- 予約（bookings）テーブル
-- ユーザーの申し込み単位を管理します
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY, -- 予約ID（数字）
  performance_id INTEGER REFERENCES performances(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL, -- 名前
  email VARCHAR(255) NOT NULL, -- メールアドレス
  grade_class VARCHAR(50), -- 所属年組 (例: 3-1)
  club_affiliation VARCHAR(100), -- 所属部活
  passcode VARCHAR(4) NOT NULL, -- 確認用パスワード（数字4桁など）
  status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'checked_in', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- タイムスタンプ
  checked_in_at TIMESTAMP WITH TIME ZONE,
  notes TEXT -- 備考
);

-- 座席テーブルにbooking_idを追加
-- どの予約に紐付いているかを明確にするため
ALTER TABLE seats ADD COLUMN IF NOT EXISTS booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL;

-- 予約IDでの検索用インデックス
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email);
CREATE INDEX IF NOT EXISTS idx_bookings_passcode ON bookings(passcode);
CREATE INDEX IF NOT EXISTS idx_seats_booking_id ON seats(booking_id);


-- ==========================================
-- RLS (Row Level Security) の設定
-- ==========================================
-- セキュリティ強化のため、bookingsとseatsテーブルにRLSを適用します

-- 1. bookingsテーブルのRLS設定
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Policy: 予約作成は誰でも可能 (INSERT)
DROP POLICY IF EXISTS "Enable insert for anon (public)" ON bookings;
CREATE POLICY "Enable insert for anon (public)" 
ON bookings FOR INSERT 
WITH CHECK (true);

-- Policy: 予約情報の閲覧は禁止 (SELECT) -> デフォルトDeny

-- Policy: 予約情報の更新・削除も禁止 (UPDATE/DELETE) -> デフォルトDeny


-- 2. seatsテーブルのRLS設定
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;

-- Policy: 座席情報の閲覧は誰でも可能 (SELECT)
DROP POLICY IF EXISTS "Enable read for anon (public)" ON seats;
CREATE POLICY "Enable read for anon (public)" 
ON seats FOR SELECT 
USING (true);

-- Policy: 座席情報の更新は禁止 (UPDATE) -> デフォルトDeny


-- 3. performancesテーブルのRLS設定
ALTER TABLE performances ENABLE ROW LEVEL SECURITY;

-- Policy: 公演情報の閲覧は誰でも可能
DROP POLICY IF EXISTS "Enable read for public" ON performances;
CREATE POLICY "Enable read for public" 
ON performances FOR SELECT 
USING (true);


-- ==========================================
-- RPC Functions (Supabase Direct Access)
-- ==========================================

-- 高速チェックイン用関数 (Client -> Supabase Direct)
-- GASを経由せず、クライアントから直接呼び出してチェックインを実行します
CREATE OR REPLACE FUNCTION check_in_reservation(p_reservation_id INT, p_passcode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- 管理者権限で実行 (RLSをバイパス)
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
BEGIN
  -- 1. 予約の検索
  SELECT * INTO v_booking FROM bookings WHERE id = p_reservation_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;

  -- 2. パスコードの照合 (p_passcodeが空でなく、一致しない場合エラー)
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
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'チェックイン完了',
    'data', jsonb_build_object('id', v_booking.id, 'name', v_booking.name)
  );
END;
$$;

-- 予約検索用関数 (Client -> Supabase Direct)
-- スキャナーでQRコードを読み取った際に、GASを経由せずに予約情報を高速取得します
CREATE OR REPLACE FUNCTION get_booking_for_scan(p_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking RECORD;
  v_seats RECORD;
BEGIN
  -- 1. 予約基本情報
  SELECT b.*, p.group_name, p.day, p.timeslot
  INTO v_booking
  FROM bookings b
  JOIN performances p ON b.performance_id = p.id
  WHERE b.id = p_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;

  -- 2. 座席情報 (集約)
  SELECT string_agg(seat_id, ', ' ORDER BY seat_id) as seat_list
  INTO v_seats
  FROM seats
  WHERE booking_id = p_id;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id', v_booking.id,
      'name', v_booking.name,
      'grade_class', v_booking.grade_class,
      'status', v_booking.status,
      'passcode', v_booking.passcode, 
      'performances', jsonb_build_object(
         'group_name', v_booking.group_name,
         'day', v_booking.day,
         'timeslot', v_booking.timeslot
      ),
      'seats', CASE WHEN v_seats.seat_list IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('seat_id', v_seats.seat_list)) END
    )
  );
END;
$$;


-- ==========================================
-- Admin RPCs (Added 2025-12-27)
-- ==========================================

-- 1. 管理者用 予約一覧取得 (フィルタリング対応)
CREATE OR REPLACE FUNCTION admin_get_reservations(
  p_group TEXT DEFAULT NULL,
  p_day INT DEFAULT NULL,
  p_timeslot TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL
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
      'performances', jsonb_build_object(
         'group_name', p.group_name,
         'day', p.day,
         'timeslot', p.timeslot
      ),
      'seats', (
         SELECT jsonb_agg(jsonb_build_object('seat_id', s.seat_id))
         FROM seats s WHERE s.booking_id = b.id
      )
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
    );

  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_results, '[]'::jsonb));
END;
$$;

-- 2. 管理者用 予約更新 (名前, メモ, Status, etc)
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
      status = COALESCE(p_status, status) -- p_statusが指定されていれば更新
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;

  -- Statusがcancelledになった場合、座席も開放する処理を入れるべきか？
  -- UI側で「キャンセル」ボタンは別にあるので、ここはステータス表記の修正のみとするか、
  -- あるいは整合性を保つために logic を入れるか。
  -- ユーザーの要望は「ステータスも編集できるように」なので、
  -- 手動で checked_in に戻したり confirmed に戻したりが主眼と推測。
  -- cancelled への変更は admin_cancel_booking を使うべきだが、こちらでも座席連動させるのが安全。
  
  IF p_status = 'cancelled' THEN
     UPDATE seats 
     SET status = 'available', booking_id = NULL, reserved_by = NULL, reserved_at = NULL, checked_in_at = NULL
     WHERE booking_id = p_id;
  ELSIF p_status = 'checked_in' THEN
     UPDATE seats
     SET status = 'checked_in', checked_in_at = NOW()
     WHERE booking_id = p_id;
  ELSIF p_status = 'confirmed' THEN
     -- 座席ステータスも戻す (checked_in -> reserved)
     UPDATE seats
     SET status = 'reserved', checked_in_at = NULL
     WHERE booking_id = p_id AND status = 'checked_in';
  END IF;

  RETURN jsonb_build_object('success', true, 'message', '更新しました');
END;
$$;

-- 3. 管理者用 強制キャンセル
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

  RETURN jsonb_build_object('success', true, 'message', 'キャンセルしました');
END;
$$;

-- 4. 管理者用 座席変更 (トランザクション)
-- 現在の座席を開放し、新しい座席を指定IDで確保する
-- new_seat_ids_str: "A1,A2" 形式のカンマ区切り文字列
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
  -- 予約取得
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '予約が見つかりません');
  END IF;
  
  v_perf_id := v_booking.performance_id;
  v_seat_arr := string_to_array(p_new_seat_ids_str, ',');

  -- 新しい座席の空き確認 (自分自身が持っている座席は除外したいが、
  -- Swapなので「今の座席」と「新しい座席」が被ることはUI側で制御するか、
  -- ここでは単純に「booking_id IS NOT NULL AND booking_id != p_booking_id」をチェック)
  SELECT COUNT(*) INTO v_count
  FROM seats 
  WHERE performance_id = v_perf_id 
    AND seat_id = ANY(v_seat_arr)
    AND status <> 'available'
    AND booking_id IS DISTINCT FROM p_booking_id;
    
  IF v_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '選択された座席の一部は既に埋まっています');
  END IF;

  -- 1. 旧座席の開放
  UPDATE seats 
  SET status = 'available', booking_id = NULL, reserved_by = NULL, reserved_at = NULL
  WHERE booking_id = p_booking_id;

  -- 2. 新座席の確保
  UPDATE seats
  SET status = 'reserved', 
      booking_id = p_booking_id, 
      reserved_by = v_booking.name, 
      reserved_at = NOW()
  WHERE performance_id = v_perf_id
    AND seat_id = ANY(v_seat_arr);

  RETURN jsonb_build_object('success', true, 'message', '座席を変更しました');
END;
$$;


-- 5. マスタデータ管理 (Groups/Dates/Slots)
-- table_name: 'groups', 'event_dates', 'time_slots'
-- operation: 'add', 'update', 'delete', 'toggle_active'
CREATE OR REPLACE FUNCTION admin_manage_master(
  p_table TEXT,
  p_op TEXT,
  p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id INT;
BEGIN
  -- GROUPS
  IF p_table = 'groups' THEN
    IF p_op = 'add' THEN
      INSERT INTO groups (name, display_order, is_active)
      VALUES (p_data->>'name', (p_data->>'display_order')::INT, (p_data->>'is_active')::BOOLEAN);
    ELSIF p_op = 'update' THEN
      UPDATE groups SET name = p_data->>'name', display_order = (p_data->>'display_order')::INT, is_active = (p_data->>'is_active')::BOOLEAN
      WHERE id = (p_data->>'id')::INT;
    ELSIF p_op = 'delete' THEN
      DELETE FROM groups WHERE id = (p_data->>'id')::INT;
    END IF;

  -- EVENT DATES
  ELSIF p_table = 'event_dates' THEN
    IF p_op = 'add' THEN
      INSERT INTO event_dates (date_label, display_order, is_active)
      VALUES (p_data->>'date_label', (p_data->>'display_order')::INT, (p_data->>'is_active')::BOOLEAN);
    ELSIF p_op = 'update' THEN
      UPDATE event_dates SET date_label = p_data->>'date_label', display_order = (p_data->>'display_order')::INT, is_active = (p_data->>'is_active')::BOOLEAN
      WHERE id = (p_data->>'id')::INT;
    ELSIF p_op = 'delete' THEN
      DELETE FROM event_dates WHERE id = (p_data->>'id')::INT;
    END IF;

  -- TIME SLOTS
  ELSIF p_table = 'time_slots' THEN
    IF p_op = 'add' THEN
      INSERT INTO time_slots (slot_code, start_time, end_time, display_order)
      VALUES (p_data->>'slot_code', p_data->>'start_time', p_data->>'end_time', (p_data->>'display_order')::INT);
    ELSIF p_op = 'update' THEN
      UPDATE time_slots SET slot_code = p_data->>'slot_code', start_time = p_data->>'start_time', end_time = p_data->>'end_time', display_order = (p_data->>'display_order')::INT
      WHERE id = (p_data->>'id')::INT;
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
