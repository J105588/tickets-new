-- Master Data Refactoring
-- Groups, Event Dates, and Time Slots tables

-- 1. Groups Table
CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Event Dates Table
CREATE TABLE IF NOT EXISTS event_dates (
  id SERIAL PRIMARY KEY,
  date_label VARCHAR(50) NOT NULL, -- e.g. "1日目", "2024/07/20"
  event_date DATE, -- Optional: actual date
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Time Slots Table
CREATE TABLE IF NOT EXISTS time_slots (
  id SERIAL PRIMARY KEY,
  slot_code VARCHAR(10) NOT NULL UNIQUE, -- "A", "B", etc.
  start_time VARCHAR(5), -- "09:00"
  end_time VARCHAR(5),   -- "10:00"
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Public Read Access
CREATE POLICY "Public read groups" ON groups FOR SELECT USING (true);
CREATE POLICY "Public read event_dates" ON event_dates FOR SELECT USING (true);
CREATE POLICY "Public read time_slots" ON time_slots FOR SELECT USING (true);

-- Admin Write Access (using service_role in GAS, but defined here for completeness)
-- Ideally we restrict INSERT/UPDATE/DELETE to authenticated admin users only.
-- For now, if we use service_role for admin actions, we don't strictly *need* policies for them if we bypass RLS,
-- but good practice to allow authenticated users if we switch to auth later.
-- Assuming service_role bypasses RLS, so these are just for robustness.

-- 6. Initial Seed Data (Migration)
INSERT INTO groups (name, display_order) VALUES
('演劇部', 10),
('吹奏楽部', 20),
('オーケストラ部', 30),
('音楽部', 40),
('マーチング', 50),
('見本演劇', 99)
ON CONFLICT (name) DO NOTHING;

INSERT INTO event_dates (date_label, display_order) VALUES
('1日目', 1),
('2日目', 2)
ON CONFLICT DO NOTHING; -- No unique constraint on label, but check manually or logic handled by app

INSERT INTO time_slots (slot_code, start_time, end_time, display_order) VALUES
('A', '09:00', '10:00', 10),
('B', '11:00', '12:00', 20),
('C', '13:00', '14:00', 30),
('D', '15:00', '16:00', 40),
('E', '17:00', '18:00', 50)
ON CONFLICT (slot_code) DO NOTHING;
