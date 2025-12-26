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
