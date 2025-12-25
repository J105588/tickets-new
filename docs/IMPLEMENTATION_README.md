# GAS + Supabase ハイブリッド座席管理システム 実装ガイド

## 📋 概要

このシステムは、Google Apps Script (GAS) をAPI層として維持しつつ、データストアをSupabase PostgreSQLに移行した座席管理システムです。

### 🏗️ アーキテクチャ

```
フロントエンド (HTML/JS)
    ↓ (既存のAPI呼び出し)
GAS API (CodeWithSupabase.gs)
    ↓ (新しいデータアクセス)
Supabase PostgreSQL (データストア)
```

## 📁 ファイル構成

### 新規作成ファイル

1. **`SupabaseIntegration.gs`** - GASからSupabaseへの接続クラス
2. **`CodeWithSupabase.gs`** - 既存API関数のSupabase対応版
3. **`SupabaseSettings.gs`** - Supabase設定管理
4. **`IMPLEMENTATION_README.md`** - この実装ガイド

### 既存ファイル（変更不要）

- `index.html`, `seats.html`, `timeslot.html`, `walkin.html` - フロントエンド
- `api.js`, `optimized-api.js` - API呼び出し層
- `config.js`, `seat-config.js` - 設定ファイル

## 🚀 セットアップ手順

### Step 1: Supabaseプロジェクトの準備

1. **Supabaseプロジェクトを作成**
   - [Supabase Dashboard](https://supabase.com/dashboard) にアクセス
   - 新しいプロジェクトを作成
   - プロジェクトURLとAPIキーをメモ

2. **データベーススキーマの実行**
   ```sql
   -- supabase-schema.sql の内容をSupabase SQL Editorで実行
   ```

### Step 2: GAS設定の更新

1. **GASエディタで新しいファイルを追加**
   - `SupabaseIntegration.gs`
   - `CodeWithSupabase.gs`
   - `SupabaseSettings.gs`

2. **Supabase設定の初期化**
   ```javascript
   // GASエディタで実行
   setupSupabaseSettings();
   ```

3. **設定値の更新**
   ```javascript
   // 実際のSupabase設定に更新
   updateSupabaseSettings(
     'https://your-project.supabase.co',
     'your-anon-key',
     'your-service-role-key'
   );
   ```

### Step 3: 接続テスト

```javascript
// GASエディタで実行
testSupabaseConnection();
```

### Step 4: データベース初期化

```javascript
// GASエディタで実行
initializeSupabaseDatabase();
```

## 🔧 主要機能

### 1. 座席管理機能

- **座席データ取得**: `getSeatDataSupabase()`
- **座席予約**: `reserveSeatsSupabase()`
- **チェックイン**: `checkInSeatSupabase()`
- **当日券発行**: `assignWalkInSeatSupabase()`

### 2. データ管理機能

- **公演管理**: 自動的な公演作成と座席生成
- **座席統計**: リアルタイム座席状況の取得
- **一括操作**: 複数座席の同時更新

### 3. システム管理機能

- **接続テスト**: Supabase接続の確認
- **データベース初期化**: 初期データの作成
- **状態確認**: データベースの健全性チェック

## 📊 データベーススキーマ

### テーブル構成

1. **`performances`** - 公演情報
   - `id`: 公演ID
   - `group_name`: 団体名
   - `day`: 日付
   - `timeslot`: 時間帯

2. **`seats`** - 座席情報
   - `id`: 座席ID
   - `performance_id`: 公演ID
   - `seat_id`: 座席識別子（例: A1, B2）
   - `row_letter`: 行文字
   - `seat_number`: 座席番号
   - `status`: 座席状態
   - `reserved_by`: 予約者名
   - `reserved_at`: 予約日時
   - `checked_in_at`: チェックイン日時

## 🔄 移行手順

### Phase 1: 準備段階

1. **Supabaseプロジェクト作成**
2. **データベーススキーマ実行**
3. **GAS設定の更新**

### Phase 2: 実装段階

1. **新規ファイルの追加**
2. **接続テストの実行**
3. **データベース初期化**

### Phase 3: テスト段階

1. **機能テストの実行**
2. **データ整合性の確認**
3. **パフォーマンステスト**

### Phase 4: 本番移行

1. **既存システムのバックアップ**
2. **段階的な切り替え**
3. **監視とロールバック準備**

## 🛠️ トラブルシューティング

### よくある問題

1. **接続エラー**
   - Supabase設定の確認
   - APIキーの有効性チェック
   - ネットワーク接続の確認

2. **データ取得エラー**
   - データベーススキーマの確認
   - 権限設定の確認
   - ログの確認

3. **パフォーマンス問題**
   - インデックスの確認
   - クエリの最適化
   - キャッシュの活用

### ログ確認

```javascript
// GASエディタで実行
checkDatabaseStatus();
```

## 📈 パフォーマンス最適化

### 推奨設定

1. **データベースインデックス**
   - `performances` テーブルの複合インデックス
   - `seats` テーブルの `performance_id` インデックス

2. **キャッシュ戦略**
   - 座席データのキャッシュ
   - 公演情報のキャッシュ

3. **バッチ処理**
   - 複数座席の一括更新
   - 非同期処理の活用

## 🔒 セキュリティ

### 認証・認可

1. **Supabase RLS (Row Level Security)**
   - テーブルレベルでのアクセス制御
   - ユーザー別データ分離

2. **API キー管理**
   - 環境変数での管理
   - 定期的なキーローテーション

### データ保護

1. **バックアップ**
   - 定期的なデータベースバックアップ
   - ポイントインタイムリカバリ

2. **監査ログ**
   - 操作履歴の記録
   - セキュリティイベントの監視

## 📞 サポート

### 開発者向け情報

- **API仕様**: 既存のGAS API仕様を維持
- **データ形式**: 既存のフロントエンドとの互換性を保持
- **エラーハンドリング**: 既存のエラー形式を維持

### 運用情報

- **監視**: Supabase Dashboardでの監視
- **ログ**: GAS LoggerとSupabase Logs
- **アラート**: システム異常時の通知設定

## 🎯 今後の拡張

### 予定機能

1. **リアルタイム機能**
   - WebSocket接続
   - リアルタイム座席状況更新

2. **分析機能**
   - 座席利用率の分析
   - パフォーマンス統計

3. **モバイル対応**
   - PWA機能の強化
   - オフライン同期の改善

---

## 📝 更新履歴

- **v1.0.0** (2024-01-XX): 初回実装
  - GAS + Supabase ハイブリッド構成の実装
  - 既存APIとの互換性維持
  - 座席管理機能の完全移行

---

**注意**: この実装は既存のフロントエンドとの互換性を維持しながら、データストアをSupabaseに移行する設計です。既存のAPI呼び出し方法は変更されません。
