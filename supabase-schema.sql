-- Supabase用データベーススキーマ
-- 座席管理システム用テーブル定義

-- 公演テーブル
CREATE TABLE performances (
  id SERIAL PRIMARY KEY,
  group_name VARCHAR(50) NOT NULL,
  day INTEGER NOT NULL CHECK (day IN (1, 2)),
  timeslot VARCHAR(10) NOT NULL CHECK (timeslot IN ('A', 'B', 'C', 'D', 'E')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_name, day, timeslot)
);

-- 座席テーブル
CREATE TABLE seats (
  id SERIAL PRIMARY KEY,
  performance_id INTEGER REFERENCES performances(id) ON DELETE CASCADE,
  seat_id VARCHAR(10) NOT NULL, -- A1, A2, B1, B2, etc.
  row_letter VARCHAR(1) NOT NULL, -- A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S
  seat_number INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'checked_in', 'walkin', 'blocked')),
  reserved_by VARCHAR(100), -- 予約者名
  reserved_at TIMESTAMP WITH TIME ZONE,
  checked_in_at TIMESTAMP WITH TIME ZONE,
  walkin_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(performance_id, seat_id)
);

-- 予約履歴テーブル
CREATE TABLE reservations (
  id SERIAL PRIMARY KEY,
  performance_id INTEGER REFERENCES performances(id) ON DELETE CASCADE,
  seat_id VARCHAR(10) NOT NULL,
  reserved_by VARCHAR(100) NOT NULL,
  reserved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  checked_in_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  is_walkin BOOLEAN DEFAULT FALSE
);

-- システム設定テーブル
CREATE TABLE system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_seats_performance_id ON seats(performance_id);
CREATE INDEX idx_seats_status ON seats(status);
CREATE INDEX idx_seats_seat_id ON seats(seat_id);
CREATE INDEX idx_reservations_performance_id ON reservations(performance_id);
CREATE INDEX idx_reservations_seat_id ON reservations(seat_id);

-- 座席生成用の関数
CREATE OR REPLACE FUNCTION generate_seats_for_performance(p_performance_id INTEGER)
RETURNS VOID AS $$
DECLARE
  row_letter CHAR(1);
  seat_num INTEGER;
  seat_id_str VARCHAR(10);
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
  
  -- G-S列: 各38席（13列 × 38席 = 494席）
  -- G列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'G' || seat_num, 'G', seat_num, 'available');
  END LOOP;
  
  -- H列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'H' || seat_num, 'H', seat_num, 'available');
  END LOOP;
  
  -- I列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'I' || seat_num, 'I', seat_num, 'available');
  END LOOP;
  
  -- J列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'J' || seat_num, 'J', seat_num, 'available');
  END LOOP;
  
  -- K列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'K' || seat_num, 'K', seat_num, 'available');
  END LOOP;
  
  -- L列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'L' || seat_num, 'L', seat_num, 'available');
  END LOOP;
  
  -- M列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'M' || seat_num, 'M', seat_num, 'available');
  END LOOP;
  
  -- N列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'N' || seat_num, 'N', seat_num, 'available');
  END LOOP;
  
  -- O列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'O' || seat_num, 'O', seat_num, 'available');
  END LOOP;
  
  -- P列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'P' || seat_num, 'P', seat_num, 'available');
  END LOOP;
  
  -- Q列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'Q' || seat_num, 'Q', seat_num, 'available');
  END LOOP;
  
  -- R列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'R' || seat_num, 'R', seat_num, 'available');
  END LOOP;
  
  -- S列: 1-38番（38席）
  FOR seat_num IN 1..38 LOOP
    INSERT INTO seats (performance_id, seat_id, row_letter, seat_number, status)
    VALUES (p_performance_id, 'S' || seat_num, 'S', seat_num, 'available');
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 初期データ挿入用の関数（新しい公演構成）
CREATE OR REPLACE FUNCTION initialize_performances()
RETURNS VOID AS $$
DECLARE
  group_name VARCHAR(50);
  day_num INTEGER;
  timeslot_name VARCHAR(10);
  perf_id INTEGER;
BEGIN
  -- 各公演（オーケストラ部、吹奏楽部、マーチング、音楽部、演劇部）の各日・各時間帯の公演を作成
  FOR group_name IN SELECT unnest(ARRAY['オーケストラ部', '吹奏楽部', 'マーチング', '音楽部', '演劇部', '見本演劇']) LOOP
    FOR day_num IN 1..2 LOOP
      FOR timeslot_name IN SELECT unnest(ARRAY['A']) LOOP
        -- 公演を作成
        INSERT INTO performances (group_name, day, timeslot)
        VALUES (group_name, day_num, timeslot_name)
        RETURNING id INTO perf_id;
        
        -- 座席を生成
        PERFORM generate_seats_for_performance(perf_id);
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 初期データの挿入（新しい公演構成）
SELECT initialize_performances();

-- システム設定の初期値
INSERT INTO system_settings (setting_key, setting_value) VALUES
('system_locked', 'false'),
('admin_password', ''),
('superadmin_password', ''),
('notification_emails', '[]'),
('max_seats_per_reservation', '10'),
('walkin_enabled', 'true'),
('checkin_enabled', 'true');
