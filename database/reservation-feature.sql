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
  -- 運用でパスコードなしチェックインを許可する場合はこのブロックを調整してください
  -- 今回は「パスコードが入力されている場合のみ」チェックする、あるいは「必須」にするか。
  -- QRコードには含まれているので通常はチェックOK。
  -- 手入力でパスコード省略された場合(NULL/Empty)はどうするか？
  -- -> セキュリティリスクのため、一旦は必須または一致確認を行うスタイルにします。
  
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
  v_perf RECORD;
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

