# 座席管理システム Supabase移行ガイド

## 概要

このドキュメントは、現在のGoogle Spreadsheetベースの座席管理システムをSupabase（PostgreSQL）に移行する手順を説明します。

## 移行のメリット

### Supabaseの利点
- **十分な無料枠**: 最大500MBのデータベース容量
- **リレーショナルデータベース**: PostgreSQLベースで信頼性が高い
- **自動API生成**: テーブル作成時にAPIが自動生成
- **拡張性**: 将来的な機能拡張に対応
- **リアルタイム機能**: 座席状態のリアルタイム更新

### 公演構成の変更
- **公演**: オーケストラ部、吹奏楽部、マーチング、音楽部、演劇部
- **日程**: 2日間、各日1公演（計10公演）
- **座席数**: 680席（A-S列）
- **座席配置**: 
  - A列: 6-33番（28席）
  - B列: 5-34番（30席）
  - C列: 4-35番（32席）
  - D列: 3-36番（34席）
  - E列: 2-37番（36席）
  - F列: 1-38番（38席）
  - G-S列: 各38席（13列 × 38席 = 494席）

## 移行手順

### 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com)にアクセス
2. 新しいプロジェクトを作成
3. プロジェクトのURLとAPIキーを取得

### 2. データベーススキーマの作成

```sql
-- supabase-schema.sqlファイルの内容をSupabaseのSQLエディタで実行
```

### 3. 環境設定

```javascript
// supabase-settings.jsを更新
const SUPABASE_SETTINGS = {
  production: {
    url: 'https://your-production-project.supabase.co',
    anonKey: 'your-production-anon-key',
    serviceRoleKey: 'your-production-service-role-key'
  },
  development: {
    url: 'https://your-dev-project.supabase.co',
    anonKey: 'your-dev-anon-key',
    serviceRoleKey: 'your-dev-service-role-key'
  }
};
```

### 4. 座席設定の更新

```javascript
// seat-config.jsで座席設定を確認
// 680席（A-S列）の設定が含まれています
```

### 5. APIの切り替え

```javascript
// api.jsでデータベースモードを切り替え
GasAPI.setDatabaseMode(true); // Supabase使用
```

### 6. データ移行の実行

```javascript
// migration-script.jsを使用してデータを移行
import { runMigration } from './migration-script.js';
await runMigration();
```

## ファイル構成

### 新規作成ファイル
- `supabase-schema.sql` - データベーススキーマ
- `supabase-api.js` - Supabase API連携
- `supabase-settings.js` - Supabase静的設定
- `seat-config.js` - 座席設定（680席対応）
- `migration-script.js` - データ移行スクリプト

### 更新ファイル
- `api.js` - Supabase対応のAPI切り替え機能を追加

## 座席配置の詳細

### 座席数計算
- A列: 28席（6-33番）
- B列: 30席（5-34番）
- C列: 32席（4-35番）
- D列: 34席（3-36番）
- E列: 36席（2-37番）
- F列: 38席（1-38番）
- G-S列: 494席（13列 × 38席）
- **合計**: 680席

### 通路位置
- C列13番と14番の間
- C列25番と26番の間

## 機能の互換性

### 既存機能の保持
- 公演選択（オーケストラ部、吹奏楽部、マーチング、音楽部、演劇部）
- 公演日時選択（2日間、各日1公演）
- 座席予約・チェックイン・当日券発行
- 管理者機能
- オフライン同期機能

### 新機能
- リアルタイム座席状態更新
- より高速なデータベースアクセス
- スケーラブルな座席管理

## トラブルシューティング

### よくある問題

1. **Supabase接続エラー**
   - URLとAPIキーが正しく設定されているか確認
   - ネットワーク接続を確認

2. **座席データの不整合**
   - 移行スクリプトを再実行
   - データベースの整合性をチェック

3. **API呼び出しエラー**
   - データベースモードの設定を確認
   - ログを確認してエラー詳細を特定

### ログの確認

```javascript
// 移行ログの確認
const migration = new DataMigration(supabaseAPI);
console.log(migration.getMigrationLog());
```

## パフォーマンス最適化

### 推奨設定
- データベースインデックスの活用
- 座席データの最小限取得
- リアルタイム更新の最適化

### 監視項目
- データベース接続数
- クエリ実行時間
- メモリ使用量

## セキュリティ

### 認証・認可
- SupabaseのRow Level Security (RLS)を活用
- APIキーの適切な管理
- アクセス権限の設定

### データ保護
- データベースのバックアップ
- 暗号化された通信
- 監査ログの記録

## 今後の拡張

### 予定されている機能
- モバイルアプリ対応
- 高度な分析機能
- 自動化された通知システム

### スケーラビリティ
- 複数会場対応
- 大規模イベント対応
- クラウドネイティブな設計

## サポート

### 技術サポート
- 移行に関する質問は開発チームまで
- ドキュメントの更新は継続的に実施

### 緊急時の対応
- 既存のGAS APIへのフォールバック機能
- データの復旧手順
- 緊急連絡先の設定

---

**注意**: 移行前に必ずデータのバックアップを取得し、テスト環境での動作確認を行ってください。
