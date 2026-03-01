-- ===============================================================
-- 20260301000000_cleanup_orphaned_seats.sql
-- Description: 公演(performances)が削除されたことにより、
-- performance_id が NULL になって残存している座席(seats)および予約(bookings)データを一掃します。
-- ===============================================================

BEGIN;

-- 1. 孤立した座席データの削除
DELETE FROM seats 
WHERE performance_id IS NULL;

-- 2. 孤立した予約データの削除
DELETE FROM bookings
WHERE performance_id IS NULL;

-- ※ 今後の削除処理については、バックエンド(MasterDataAPI.gs)側で
-- 削除時に連動して performance_id IS NULL のデータをクリーニングする
-- 仕組みと、関連公演があるマスタデータの削除ブロック機能（セーフガード）
-- が実装されたため、今後は自動的に整合性が保たれます。

COMMIT;

COMMIT;
