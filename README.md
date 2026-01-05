# 市川学園 座席管理システム v32.0.1 技術仕様書

## 1. システム概要

本システムは、大規模イベントにおける座席予約、発券、入場管理、およびリアルタイム監視を行うための統合プラットフォームである。
「**ネットワーク遮断状況下における業務継続性 (Business Continuity in Offline Environments)**」を最優先設計事項とし、PWA (Progressive Web App) 技術と高度な同期ロジックを組み合わせることで、不安定な通信環境下でもすべての主要機能（予約・発券・チェックイン）の利用を可能にしている。

---

## 2. アーキテクチャ

システムは、静的配信される **Frontend (SPA/PWA)**、サーバーレスAPIゲートウェイとしての **Google Apps Script (GAS)**、そしてリレーショナルデータベースとしての **Supabase (PostgreSQL)** からなる3層ハイブリッド・アーキテクチャを採用している。

### 2.1 構成図

```mermaid
graph TD
    User((User))
    Admin((Admin Operator))
    
    subgraph "Frontend Layer (GitHub Pages / Vercel)"
        PWA[PWA Client]
        SW[Service Worker]
        IDB[(IndexedDB)]
        Logic[Business Logic]
    end
    
    subgraph "API Gateway Layer (Google Apps Script)"
        GAS[GAS Web App]
        Router[API Router]
        Auth[Auth Middleware]
        Monitor[Capacity Monitor]
    end
    
    subgraph "Data Persistence Layer (Supabase)"
        PG[(PostgreSQL)]
        Seats[Seats Table]
        Bookings[Bookings Table]
    end

    User -->|HTTPS| PWA
    Admin -->|HTTPS| PWA

    PWA -->|Fetch/Cache| SW
    SW <-->|Assets/Data| IDB
    
    PWA -->|JSONP| GAS
    GAS --> Router
    Router --> Auth
    Auth -->|SQL| PG
    
    Logic -.->|Offline Queue| IDB
    IDB -.->|Background Sync| GAS
```

### 2.2 設計思想

1.  **オフラインファースト**: すべてのUI操作（座席選択、予約確定、チェックイン）は、まずローカルの状態（State）を更新し、非同期でサーバーとの同期を試みる「Optimistic AI」パターンを採用。
2.  **分散型負荷対策**: GASのクォータ制限（同時接続数など）を回避するため、クライアント側で複数のGASデプロイメントIDを管理し、自動的に負荷分散（ロードバランシング）とフェイルオーバーを行う `APIUrlManager` を実装。
3.  **データ整合性**: Supabase上のPostgreSQLによるACIDトランザクションを利用し、特に「座席変更（Rebooking）」や「同時予約」におけるRace Condition（競合）を防止。

---

## 3. ディレクトリ・ファイル構成詳解

各モジュールの責務と詳細を以下に示す。

### 3.1 `assets/js/` (Frontend Logic)

フロントエンドはVanilla JS (ES Modules) で構築されており、ビルドプロセスを必要としない。

#### コア・インフラストラクチャ
*   **`config.js`**: アプリケーション全体の設定ファイル。APIエンドポイント（`GAS_API_URLS`）、Supabaseキー、閾値設定などを集約。
*   **`optimized-loader.js`**: 依存関係解決機能付きのモジュールローダー。`Ordered Map` を使用し、実行順序を保証しつつ並列ダウンロードを行う。
*   **`auth.js`**: 認証モジュール。`sessionStorage` を利用した管理者セッション管理、パスワードハッシュ（簡易）、権限レベル（L0-L3）の判定。
*   **`error-handler.js`**: グローバルエラーハンドリング。未捕捉の例外（Uncaught Exception）やPromise棄却（Unhandled Rejection）を捕捉し、ユーザーフレンドリーな通知を表示。

#### 通信・データ管理
*   **`api.js`**: 基本的なGAS APIクライアント。JSONP方式によるクロスドメイン通信の実装。
*   **`optimized-api.js`**: `api.js` の拡張版。同一リクエストの重複排除（Debounce/Dedup）と、レスポンスキャッシュ機能を提供。
*   **`api-cache.js`**: APIレスポンス専用のキャッシュマネージャ。`localStorage` とメモリキャッシュの2階層構造。TTL（有効期限）管理を行う。
*   **`offline-sync-v2.js`**: **【重要】** オフライン同期エンジン v2。操作ログを `IndexedDB` にキューイングし、ネットワーク復帰時にFIFO（先入れ先出し）で同期を実行。再試行回数とエラーバックオフ制御を含む。
*   **`supabase-client.js`**: `supabase-js` SDKの薄いラッパー。主に管理者機能での直接DB参照に使用。

#### 予約・座席ロジック
*   **`seats-main.js`**: 座席予約システムのコア。Canvas/DOMを用いた座席マップのレンダリング、`AdminAPI` と連携した状態管理、座席クリックイベントのルーター。
*   **`reservation.js`**: 予約フォームのバリデーションと送信処理。
*   **`reservation-status.js`**: 既存予約の照会・キャンセルロジック。
*   **`seat-config.js`**: 座席レイアウト定義（行数、列数、通路位置）。静的定数として管理。

#### 管理者・特殊機能
*   **`admin.js`**: 管理者ダッシュボードのメインロジック。検索、一覧表示、チェックイン、モーダル制御。
*   **`admin-scan.js`**: `html5-qrcode` ライブラリを用いたQRコードスキャンとチェックイン処理。
*   **`walkin-main.js`**: 当日券発行ロジック。座席自動割当アルゴリズム（連続席優先・前方優先）を実装。
*   **`logs-main.js`**: サーバーサイド監査ログの取得と表示。
*   **`enhanced-status-monitor.js`**: 監視エージェント。15秒間隔で全公演の残席数をポーリングし、変化を検知して通知APIをトリガーする。

#### PWA・ライフサイクル
*   **`pwa-install.js`**: A2HS (Add to Home Screen) プロンプトの制御。OS判定によるインストールガイド表示。
*   **`pwa-update.js`**: Service Workerの更新検知。更新待機状態（`waiting`）のSWがある場合、ユーザーに更新トーストを表示し、`skipWaiting` を送信してリロードを促す。

---

### 3.2 `gas/` (Backend Logic)

Google Apps Scriptは、V8ランタイム上で動作するTypeScriptライクなJavaScriptで記述されている。

#### エントリーポイント
*   **`CodeWithSupabase.gs`**: メインエントリポイント。`doGet(e)` および `doPost(e)` 関数が定義されており、リクエストパラメータ `action` に基づいて適切なAPI関数へルーティングする。

#### API モジュール
*   **`AdminAPI.gs`**: 管理者用API群。予約検索、座席一括変更（Rebook）、強制チェックイン、メール再送など、特権操作を定義。
*   **`ReservationAPI.gs`**: 一般予約用API群。新規予約作成（`createReservation`）、キャンセル（`cancelReservation`）、チェックイン（`checkInReservation`）。排他制御（ロック）を含む。
*   **`SupabaseIntegration.gs`**: Supabase連携クラス。`UrlFetchApp` を使用して Supabase REST API をコールする。Service Role Key を使用した特権アクセスもここで行う。
*   **`SupabaseSettings.gs`**: Supabase接続情報（URL, Key）の管理。スクリプトプロパティから読み込む。

---

## 4. API 仕様 (Action Reference)

クライアントは `GAS_API_URLS` に対して `GET` リクエスト（JSONP）を送信する。
共通パラメータ: `action`（必須）, `callback`（必須）。

### 4.1 一般公開 API (Public)

| Action | パラメータ | 説明 |
| :--- | :--- | :--- |
| `get_seats` | `group`, `day`, `timeslot` | 指定された公演の全座席状態（`status`）と予約ID（ハッシュ化済）を取得。 |
| `create_reservation` | `name`, `email`, `seats`(CSV), `passcode` | 新規予約を作成。座席の競合チェックを行い、成功すれば `reservation_id` を返す。 |
| `check_in` | `id` (Booking ID), `passcode` | ユーザーパスコードによるチェックイン。 |
| `cancel_reservation` | `id`, `passcode` | 予約のキャンセルと座席の即時開放。 |

### 4.2 管理者専用 API (Admin - L1+)

| Action | パラメータ | 説明 |
| :--- | :--- | :--- |
| `admin_get_reservations` | `search`, `group`, `day`, `timeslot` | 予約データの検索。`search` パラメータは、ID（数値）、予約ID（UUID）、名前、メール、**座席番号** に対して部分一致検索を行う。 |
| `admin_change_seats` | `id`, `seats` (New Seat IDs) | **座席変更（Rebook）**。指定した予約IDに紐づく現在の座席を全て「空席」に戻し、新しい座席を「予約済」として紐付けるトランザクション的処理。 |
| `admin_update_reservation` | `id`, `updates` (JSON) | 予約情報（名前、メール、備考など）の更新。 |
| `admin_resend_email` | `id` | 予約完了メールの再送処理。 |

### 4.3 API 内部ロジックとフロー (Architecture Deep Dive)

本システムのAPIは、単なるCRUDラッパーではなく、いくつかの複雑なオーケストレーションを担当している。

#### 1. リクエストフロー (Request Lifecycle)

```mermaid
sequenceDiagram
    participant Client as Frontend (PWA)
    participant GAS as GAS (doGet)
    participant Router as CodeWithSupabase.gs
    participant Logic as *API.gs
    participant DB as Supabase

    Client->>GAS: GET /exec?action=xyz&... (JSONP)
    GAS->>Router: doGet(e)
    Router->>Router: User-Agent/IP Log
    Router->>Logic: Dispatch (action)
    
    rect rgba(42, 67, 90, 1)
        note right of Logic: Business Logic
        Logic->>DB: Fetch/Update (via REST)
        DB-->>Logic: JSON Response
        Logic->>Logic: Filtering / Validation
    end
    
    Logic-->>Router: Result Object
    Router-->>GAS: ContentService.createTextOutput()
    GAS-->>Client: callback({ ... })
```

#### 2. 重要アクションのシーケンス詳細

**A. 新規予約 (`create_reservation`)**
座席の二重予約（Double Booking）を防止するため、厳密なチェックとロック機構を持つ。

```mermaid
sequenceDiagram
    Client->>GAS: create_reservation(seats="A-1,A-2")
    GAS->>DB: SELECT * FROM seats WHERE id IN (...)
    
    alt 一つでも予約済み(booking_id != null)がある
        GAS-->>Client: Error: "一部の座席が既に予約されています"
    else 全て空席
        GAS->>DB: INSERT INTO bookings
        DB-->>GAS: New Booking ID
        GAS->>DB: UPDATE seats SET booking_id = ...
        GAS-->>Client: Success (reservation_id)
    end
```

**B. チェックイン (`check_in`)**
QRスキャンまたは手動入力により実行される。

1.  **Lookup**: `bookings` テーブルを `id` (Short ID) で検索。
2.  **Verify**: 入力された `passcode` と DB上のパスコードを照合。
3.  **Update**:
    *   `bookings` テーブルの `status` を `'checked_in'` に更新。
    *   紐づく `seats` レコードの `status` も `'checked_in'` に更新（冗長化による参照高速化）。
4.  **Audit**: 監査ログに「チェックイン成功」を記録。

**C. 管理者検索 (`admin_get_reservations`)**
前述の通り、GAS側でのインメモリフィルタリングを行うが、パフォーマンス最適化のために以下の工夫がなされている。

1.  **Prefetch**: 検索ワードが空の場合、直近の予約50件のみを取得。
2.  **Smart Filter**:
    *   数字のみの検索 (`123`): ID検索とみなし、数値型変換して比較。
    *   UUID形式 (`...-....`): Reservation ID検索とみなす。
    *   座席形式 (`A-1`): 座席ID検索とみなす。
3.  **Cross-Join**: 予約者が特定できたら、その予約IDを持つ座席レコードを別クエリで一括取得 (`WHERE booking_id IN (...)`) し、結果に統合する。

#### 4.4 フロントエンド依存関係 (System Dependency)
本システムの構成要素と依存関係の全体像。

```mermaid
%%{init: {
  'theme': 'dark', 
  'themeVariables': { 
    'lineColor': '#aaa',
    'fontSize': '15px',
    'fontFamily': 'monospace'
  }
}}%%
flowchart LR
    %% スタイル定義 (黒背景用ハイコントラスト)
    classDef js fill:#0d1117,stroke:#58a6ff,stroke-width:2px,color:#fff;
    classDef html fill:#0d1117,stroke:#d29922,stroke-width:2px,color:#fff;
    classDef css fill:#0d1117,stroke:#8b949e,stroke-width:1px,stroke-dasharray: 5 5,color:#ccc;
    classDef gas fill:#04260f,stroke:#3fb950,stroke-width:2px,color:#fff;
    classDef db fill:#181029,stroke:#a371f7,stroke-width:2px,color:#fff;
    classDef infra fill:#290d0d,stroke:#ff7b72,stroke-width:2px,color:#fff;

    subgraph Frontend [Frontend Application]
        direction TB
        
        subgraph Core [Core & Optimization]
            direction LR
            OPT_LOADER([optimized-loader.js]):::js
            OPT_API([optimized-api.js]):::js
            OPT_CACHE([api-cache.js]):::js
            CFG_MAIN([config.js]):::js
        end

        subgraph Offline [Offline & PWA]
            direction LR
            OFF_SYNC([offline-sync-v2.js]):::js
            SERV_WORK{{sw.js}}:::infra
            CONN_REC([connection-recovery.js]):::js
        end

        subgraph Pages [Views & Controllers]
            direction TB
            
            subgraph Public
                PG_IDX([index-main.js]):::js --- P_IDX[index.html]:::html
                PG_SEAT([seats-main.js]):::js --- P_SEAT[seats.html]:::html
                PG_RES([reservation.js]):::js --- P_RES[reservation.html]:::html
            end
            
            subgraph Admin
                PG_ADM([admin.js]):::js --- P_ADM[admin.html]:::html
                PG_LOG([logs-main.js]):::js --- P_LOG[logs.html]:::html
                PG_MON([monitor.js]):::js --- P_MON[dashboard.html]:::html
            end
        end
        
        CSS_MAIN{styles.css}:::css
    end

    subgraph Integration [Integration Layer]
        SUPA_CLI([supabase-client.js]):::js
        SUPA_API([supabase-api.js]):::js
    end

    subgraph Backend [Google Apps Script]
        direction TB
        GAS_CODE[[CodeWithSupabase.gs]]:::gas
        GAS_ADMIN[[AdminAPI.gs]]:::gas
        GAS_USER[[ReservationAPI.gs]]:::gas
        GAS_MST[[MasterDataAPI.gs]]:::gas
        GAS_SUPA[[SupabaseIntegration.gs]]:::gas
    end

    subgraph Database [Supabase DB]
        direction TB
        DB_SEATS[(seats)]:::db
        DB_BOOK[(bookings)]:::db
        DB_LOGS[(audit_logs)]:::db
        DB_VIEW[(admin_view)]:::db
    end

    %% --- 接続定義 ---

    %% 1. フロントエンド初期化フロー
    OPT_LOADER --> OPT_API
    OPT_API --> OPT_CACHE
    CFG_MAIN --> OPT_API
    
    %% 2. API通信 (JSONP)
    OPT_API == JSONP ==> GAS_CODE

    %% 3. バックエンドロジック
    GAS_CODE --> GAS_ADMIN
    GAS_CODE --> GAS_USER
    GAS_CODE --> GAS_MST
    GAS_CODE --> GAS_SUPA
    
    %% 4. サーバーサイドDB接続
    GAS_SUPA -.-> DB_SEATS
    GAS_SUPA -.-> DB_BOOK

    %% 5. クライアント直接接続 (Supabase)
    PG_ADM -.-> SUPA_CLI
    PG_LOG -.-> SUPA_CLI
    PG_MON -.-> SUPA_CLI
    
    SUPA_CLI == REST/Realtime ==> DB_VIEW
    SUPA_CLI --> DB_LOGS

    %% 6. PWA/オフライン機能
    OFF_SYNC -.-> SERV_WORK
    SERV_WORK -.-> P_IDX
    SERV_WORK -.-> P_SEAT

    %% 7. スタイル適用
    CSS_MAIN -.-> P_IDX
```

---

## 5. データベース設計 (Supabase Schema)

データストアには PostgreSQL を使用し、正規化されたリレーショナルモデルを採用している。

### 5.1 テーブル定義

#### `performances` (公演マスタ)
公演を定義する。
*   `id` (Int, PK): 内部ID
*   `group_name` (Text): 団体名（例: "Orchestra"）
*   `day` (Int): 日程（1 or 2）
*   `timeslot` (Text): 時間帯ID（例: "A"）

#### `bookings` (予約情報)
予約者情報を管理する。
*   `id` (Int, PK): 内部ID（検索に使用）
*   `reservation_id` (UUID): 外部公開用ID
*   `name` (Text): 予約者名
*   `email` (Text): アドレス
*   `passcode` (Text): キャンセル/チェックイン用パスコード
*   `status` (Text): `'confirmed'`, `'checked_in'`, `'cancelled'`
*   `created_at` (Timestamptz)

#### `seats` (座席情報)
**システムの中心となるテーブル**。すべての座席の状態を管理する。
*   `seat_id` (Text, PK): 座席番号（例: "A-1"） + `performance_id` の複合主キー的役割（実際にはサロゲートキーまたは複合ユニーク制約）。
*   `performance_id` (Int, FK): 公演ID
*   `booking_id` (Int, FK, Nullable): **予約IDへの参照。これが NULL なら「空席」、値があれば「予約済」と判定される。**
*   `status` (Text): `'available'`, `'reserved'`, `'secured'` (確保), `'checked_in'`。
    *   ※ `booking_id` がある場合、`status` は補完的な情報となるが、検索速度向上のために維持される。

### 5.2 インデックス戦略
*   `seats(performance_id)`: 座席マップ取得の高速化。
*   `seats(booking_id)`: 予約IDからの座席逆引き（キャンセル/変更時）の高速化。
*   `bookings(reservation_id)`: UUID検索の高速化。
*   `bookings(email)`: 管理者検索の高速化。

---

## 6. 重要ロジック詳解

### 6.1 管理者検索ロジック (In-Memory Filtering)
Supabase (PostgreSQL) は、UUID型カラムに対して数値や不適切な文字列での検索を行うとエラー（Type Error）を返す厳格な仕様がある。
これを回避し、かつ「座席番号（DB上は別テーブル）」も含めた横断検索を実現するため、以下の戦略を採用している。

1.  **Scope Fetch**: GASはまず、指定された公演（Group/Day/Timeslot）に該当する予約データをDBからフェッチする（必要最小限のフィルタリング）。
2.  **Join Strategy**: 予約データ (`bookings`) と 座席データ (`seats`) をアプリケーションレベル（JS）で結合する。
3.  **In-Memory Search**: 結合されたデータ配列に対して、検索キーワードを用いたフィルタリングを行う。
    *   キーワードが数値のみ → `id` と比較。
    *   キーワードが "A-1" のような形式 → `seats.seat_id` と比較。
    *   それ以外 → `name`, `email`, `reservation_id` (String cast) と比較。
これにより、柔軟かつエラーのない検索体験を実現している。

### 6.2 リブッキング（座席変更）ロジック
「座席変更」は単純な UPDATE ではなく、以下の手順で行われる。
1.  **Validation**: 新しい座席が本当に「空席」であることを確認。
2.  **Release**: 対象予約ID (`booking_id`) に紐づく現在の座席すべての `booking_id` を `NULL` に、ステータスを `'available'` に更新（開放）。
3.  **Reserve**: 新しい座席リストの `booking_id` を対象予約IDに設定し、ステータスを `'reserved'` に更新。
これを（擬似的な）アトミック操作として実行することで、座席の二重割り当てや「幽霊予約（データだけ残る現象）」を防ぐ。

### 6.3 PWA アップデートフロー
ユーザーに常に最新のアプリケーションを提供するため、以下のフローを実装している。
1.  **Service Worker Registration**: `sw.js` が登録される。
2.  **Update Detection**: ブラウザが `sw.js` のバイト単位の変更を検知すると、新しい SW をインストールし、`waiting` 状態にする。
3.  **UI Notification**: `pwa-update.js` が `updatefound` イベントおよび `statechange` を監視。新しい SW が `waiting` になった時点で、画面下部に更新トーストを表示する。
4.  **Activation**: ユーザーが「更新」ボタンを押すと、`message` 経由で `SKIP_WAITING` シグナルを SW に送信。SW は直ちに `activate` され、ページはリロードされて最新版となる。

---

## 7. セットアップ手順

開発環境および本番環境の構築手順。

### 7.1 前提条件
*   Node.js (開発用ツール使用の場合)
*   Google Account (GASデプロイ用)
*   Supabase Account

### 7.2 バックエンド (GAS & Supabase) 構築
1.  **Database**:
    *   Supabase プロジェクトを作成。
    *   `database/supabase-schema.sql` を SQL Editor で実行。
2.  **GAS**:
    *   Google Drive で新規 GAS プロジェクト作成。
    *   `gas/` ディレクトリ内の全ファイルをコピー＆ペースト。
    *   **スクリプトプロパティ** を設定:
        *   `SUPABASE_URL`: (Supabase URL)
        *   `SUPABASE_ANON_KEY`: (Anon Key)
        *   `SUPABASE_SERVICE_ROLE_KEY`: (Service Role Key - Admin機能に必須)
        *   `ADMIN_PASSWORD`: (管理者ログイントークン)
        *   `SUPERADMIN_PASSWORD`: (特権管理者トークン)
    *   ウェブアプリとしてデプロイ（アクセス権: 全員）。デプロイURLを控える。

### 7.3 フロントエンド設定
1.  `assets/js/config.js` を開く。
2.  `GAS_API_URLS` 配列に、取得した GAS のウェブアプリ URL を文字列として設定する。
    ```javascript
    const GAS_API_URLS = [
      "https://script.google.com/macros/s/AKfycbx.../exec"
    ];
    ```
    (※ 負荷分散のため、同一スクリプトの別デプロイIDを複数設定することも可能)

### 7.4 デプロイ
GitHub Pages, Vercel, Firebase Hosting などの静的ホスティングサービスに、プロジェクトルート以下のファイルをアップロードする。
特殊なビルドコマンドは不要。

---

---

## 8. 画面別技術詳解 (Screen Technical Reference)

本章では、各画面の初期化フロー、API依存関係、内部状態遷移について詳細記述を行う。各画面は独立したSPAモジュールとして動作し、共通の `config.js` および `api.js` を介してバックエンドと通信する。

### 8.1 公演選択画面 (`pages/timeslot.html`)

ユーザーが最初に訪れる（`index.html` から遷移する）実質的なエントリーポイント。動的なスケジュール生成を担う。

*   **Module**: `assets/js/timeslot-main.js`
*   **Dependencies**: `optimized-api.js`, `supabase-client.js`

#### A. 初期化プロセス (Initialization Flow)
1.  **URL Parameter Parsing**: `?group=[GroupName]` を解析。デモモード時は `config.js` の設定に従い強制リライト。
2.  **Master Data Fetch**:
    *   **Primary**: `fetchMasterDataFromSupabase()` および `fetchPerformancesFromSupabase(group)` を並列実行。
    *   **Fallback**: 失敗時、GAS API (`get_master_data`, `get_all_schedules`) へフォールバック。
    *   **Data Structure**:
        *   `DateMaster`: 日程定義（ID, ラベル）。
        *   `TimeslotMaster`: 時間帯定義（コード, 開始・終了時刻）。
        *   `Performances`: 特定団体の公演スケジュール（DayID, TimeslotCode）。

```mermaid
graph TD
    A[index.html] -->|Link| B["timeslot.html?group=1組"]
    B -->|Parse URL| C{Demo Mode?}
    C -- Yes --> D["Rewrite Group to '見本演劇'"]
    C -- No --> E["Use '1組'"]
    E --> F["Fetch Data (Supabase/GAS)"]
    F --> G[Render Buttons]
    G -->|Click| H["seats.html?group=...&day=...&time=..."]
```

#### B. レンダリングロジック
取得した `Performances` を `DateMaster` の順序（Day ID順）でグルーピングし、さらに `TimeslotMaster` の開始時刻順でソートしてボタンを生成する。
*   **Dynamic Link**: 各ボタンは `seats.html?group=...&day=...&timeslot=...` へのリンクとなる。
*   **Validation**: 過去の公演や「無効」フラグのついた公演はフィルタリングされる（管理者モードを除く）。

---

### 8.2 座席選択画面 (`pages/seats.html`)

本システムの中核的UI。HTML5 Canvasを用いない、DOMベースの高パフォーマンス座席マップ。

*   **Module**: `assets/js/seats-main.js`
*   **Dependencies**: `optimized-api.js`, `ui-optimizer.js`, `auth.js`

#### A. ライフサイクル
1.  **Boot**: `urlParams` から `group`, `day`, `timeslot` を取得。
2.  **Data Fetch**:
    *   **API**: `GasAPI.getSeatData(group, day, timeslot)`
    *   **Request**: `GET ?action=get_seats&group=...`
    *   **Response Schema**:
        ```json
        {
          "success": true,
          "seatMap": {
            "A1": { "id": "A1", "status": "available", "name": "", ... },
            "A2": { "id": "A2", "status": "reserved", "name": "UserX", ... }
          },
          "rev": "v123" // Cache revision
        }
        ```
3.  **Rendering**:
    *   レスポンシブ対応のため、行（Div Row）と列（Div Seat）のグリッドレイアウトを動的生成。
    *   **Zoom Logic**: CSS Variable `--seat-scale` を操作し、GPUアクセラレーションを効かせたズームを実現。

```mermaid
sequenceDiagram
    participant P as Page
    participant API as GasAPI
    participant DOM as DOM Builder
    
    P->>API: getSeatData(group, day, time)
    API-->>P: { success:true, seatMap: {...} }
    P->>DOM: extractSeatLayout()
    loop Every Row
        DOM->>DOM: Create Row Div
        loop Every Seat
            DOM->>DOM: Create Seat Div
            DOM->>DOM: Apply Status Class
        end
    end
    DOM-->>P: Rendered
```

#### B. 状態遷移と操作権限

| Action | User | Admin | Super Admin |
| :--- | :--- | :--- | :--- |
| **Available Click** | 選択トグル (Max 5) | 選択トグル (Unlimited) | 編集ドロワーOpen |
| **Reserved Click** | `Error: Already Reserved` | **選択トグル (Check-in)** | **編集ドロワーOpen** |
| **Check-in Logic** | N/A | `checkInSelected()` 実行<br>→ API `check_in_multiple` 呼出 | `updateSeatData()` 実行<br>→ ステータス直接書き換え |

#### C. ポーリングと同期
*   `autoRefreshInterval` (通常30秒) で差分更新を試行。
*   **Optimistic UI**: ユーザーが操作（選択など）を行っている間はポーリングを一時停止し、操作競合を防ぐ。

---

### 8.3 予約入力・確定画面 (`pages/reservation.html`)

予約トランザクションの境界。

*   **Module**: `assets/js/reservation.js`
*   **Transaction Scope**: `Step 1 (Validate)` → `Step 2 (Input)` → `Step 3 (Commit)`

#### A. API リクエスト詳細 (`create_reservation`)
ユーザーが「予約確定」を押すと、以下のJSONPリクエストが発行される。

*   **Method**: `GET (JSONP)`
*   **Endpoint**: `/exec?action=create_reservation`
*   **Payload**:
    ```javascript
    {
      "group": "1組",
      "day": "1",
      "timeslot": "A",
      "seats": "A-1,A-2", // CSV
      "name": "山田太郎",
      "email": "yamada@example.com", // Optional
      "passcode": "1234",
      "grade_class": "1年1組"
    }
    ```

```mermaid
sequenceDiagram
    participant User
    participant Page as reservation.html
    participant Lock as GAS LockService
    participant DB as Supabase
    
    User->>Page: Submit
    Page->>Page: Validate Input
    Page->>Lock: Request Lock (30s)
    
    rect rgba(46, 52, 79, 1)
    Lock->>DB: Check Availability
    alt Occupied
        DB-->>Lock: Error
        Lock-->>Page: "Double Booking Error"
    else Available
        Lock->>DB: INSERT into bookings
        Lock->>DB: UPDATE seats (link booking_id)
        DB-->>Lock: Success
    end
    end
    
    Lock-->>Page: Reservation ID
    Page->>User: Show Success
```

#### B. バックエンド処理 (GAS Flow)
1.  **Mutex Lock**: GASの `LockService` を取得（最大30秒待機）。
2.  **Double Booking Check**: 指定された座席IDが `seats` テーブルで `booking_id IS NULL` であることを確認。1つでも埋まっていれば即座にエラー返却。
3.  **Insert**: `bookings` テーブルにレコード作成。
4.  **Update**: `seats` テーブルの対象レコードを更新し、`booking_id` を紐付け。
5.  **Commit**: ロック解除。
6.  **Response**: `reservation_id` (UUID) を返却。

---

### 8.4 管理画面 (`pages/admin.html`)

SPAとして実装された統合管理ダッシュボード。

*   **Module**: `assets/js/admin.js`
*   **Dependencies**: `supabase-client.js` (Direct DB Access)

#### A. データ取得戦略
GASを経由せず、Supabase JS Client (`@supabase/supabase-js`) を用いて直接DBを参照する（Read Replica参照的な動作）。
*   **View**: `admin_reservations_view` (Security Definer View) を通じて、結合済みのリッチな予約データを取得。
*   **Realtime**: Admin画面でのポーリング負荷を避けるため、一定間隔での手動/自動リロード設計（WebSocket接続はあえて未使用）。

#### B. 検索アルゴリズム (Client-Side)
取得した全件データ（または直近N件）に対し、フロントエンドで以下の検索を行う。
*   **Fuzzy Logic**:
    *   数字4桁 → パスコード検索? or ID検索? (ID優先)
    *   UUID形式 → `reservation_id` 完全一致。
    *   かな・漢字 → `name` 部分一致。
    *   英数字 ("A-1") → `seat_id` 検索（`bookings` に紐づく `seats` 情報を検索）。

```mermaid
graph TD
    A["Supabase 'admin_reservations_view'"] -->|Fetch| B[Client Memory]
    C[User Input] -->|Event| D{Input Type}
    D -- "1234" --> E[Filter by ID/Pass]
    D -- "UUID" --> F[Filter by BookingID]
    D -- "山田" --> G[Filter by Name]
    B --> E
    B --> F
    B --> G
    E & F & G --> H[Update DOM List]
```

---

### 8.5 当日券発行画面 (`pages/walkin.html`)

Admin権限専用の高速発券インターフェース。

*   **Module**: `assets/js/walkin-main.js`
*   **Algorithm**: "Best Seat Allocation"
    1.  **Inputs**: 枚数（例: 2枚）。
    2.  **Search**: 現在の公演の空席データから、`seat_number` が連続する空席ペアを探索。
    3.  **Priority**: 前方・中央（行ごとの重み付け）を優先して提案。
    4.  **Issue**: 確認なしで即座に `create_reservation` API (Walk-in Flag付) を叩き、QRコードを表示。
    *   これにより、窓口での発券時間を数秒に短縮している。

```mermaid
graph LR
    A[Admin Input: 2 tickets] --> B[Get Available Seats]
    B --> C["Loop Rows (A -> Z)"]
    C --> D{Find 2 Continuous?}
    D -- Yes --> E[Select Seats]
    D -- No --> F[Next Row]
    E --> G["Create Reservation (Walkin)"]
    G --> H["Print Ticket/QR"]
```

---

### 8.6 予約完了・チケット画面 (`pages/reservation-status.html`)

予約情報の永続的な表示とQRコード生成を担う。

*   **Module**: `assets/js/reservation-status.js`
*   **External Lib**: `qrcode.js` (Client-side QR Generation)

#### A. データ復元ロジック
*   **Initial Check**: URLパラメータ `?id=...&pass=...` を確認。
*   **Auth**: サーバーに対して `action=get_booking_details` を発行し、予約が存在しパスコードが一致する場合のみ詳細情報をJSONで受け取る。
*   **Realtime**: WebSocket (Supabase Realtime) を購読し、予約ステータス（チェックイン済/キャンセル）の変更を即座に画面反映する。

#### B. QRコード生成仕様
セキュリティと利便性を両立するため、以下のフォーマットでQRコードを生成する。
*   **Format**: `TICKET:{booking_id}:{passcode}` (例: `TICKET:123:ABCD`)
*   **Logic**: 
    1.  `reservation-status` 画面では、サーバーから受け取った正規のデータに基づいてクライアントサイドでQR描画を行う。
    2.  画像ではなく `Canvas`/`SVG` として描画されるため、ネットワーク負荷が軽い。

```mermaid
sequenceDiagram
    participant C as Client (Browser)
    participant S as Supabase Realtime
    
    C->>S: Subscribe (booking_id)
    loop Connection
        S-->>C: UPDATE (status='checked_in')
        C->>C: Change UI (Green)
        C->>C: Play Sound / Vibrate
    end
```

---

### 8.7 入場管理・スキャン画面 (`pages/admin-scan.html`)

入場ゲートで使用する高速チェッカー。

*   **Module**: `assets/js/admin-scan.js`
*   **External Lib**: `html5-qrcode`

#### A. スキャンプロセス
1.  **Camera Access**: `html5-qrcode` ライブラリを使用し、デバイスの背面カメラを起動。
2.  **Decode**: QRコードの内容を解析。`TICKET:` プレフィックスを検証。
3.  **Fast Action**:
    *   スキャン成功と同時に `checkInReservation()` をバックグラウンド実行。
    *   **Optimistic UI**: サーバー応答を待たずに「チェックイン成功」音と画面表示を行う（失敗時は即座にロールバック警告）。
    *   **Validation**: 既にチェックイン済みの場合は「警告: 既に入場済みです」と表示し、二重入場を防止。

```mermaid
graph TD
    A[Camera] -->|Stream| B[Scan Logic]
    B -->|Decode| C{Valid Ticket?}
    C -- No --> B
    C -- Yes --> D[Extract ID]
    D --> E["Call API check_in"]
    E -->|Async| F[Server DB Update]
    E -->|Optimistic| G[Play Sound / Show Success]
    F -- Error? --> H[Show Alert & Rollback]
```

---

### 8.8 モニタリング・ログ画面 (`pages/monitoring-dashboard.html`, `pages/logs.html`)

システムの健全性と稼働状況を監視する管理ツール。

*   **Module**: `assets/js/enhanced-status-monitor.js` (Monitoring), `assets/js/audit-logger.js` (Logs)

#### A. リアルタイムモニタリング
*   **Polling**: 30秒ごとに `check_seat_status` アクションを実行し、全公演の「予約済」「確保」「空席」数を集計する。
*   **Threshold Alerts**:
    *   残席数が閾値（例: 20席以下）を下回ると、ダッシュボード上で警告色（赤/黄）を表示。
    *   テスト用公演（"見本演劇"など）は自動的に集計から除外されるロジックを持つ。

#### B. 監査ログ (Audit Logs)
*   **Trigger**: 予約作成、キャンセル、チェックイン、座席変更など、システム上の重要な変更はすべて `Server-Side` でログテーブルに記録される。
*   **Viewer**: `logs.html` は単純な時系列リストとしてこれを表示し、管理者による不正操作やトラブルシューティングの追跡を可能にする。

```mermaid
graph TD
    A["Timer (30s)"] --> B["API: check_seat_status"]
    B --> C[Compute Empty Count]
    C --> D{Count < Threshold?}
    D -- Yes --> E[Alert: Change Color]
    D -- No --> F[Normal Display]
    E & F --> G[Wait 30s] --> A
        
    H["Action (Reserve/Cancel)"] -->|Log| I[audit_logs table]
    I -->|Read| J[logs.html]
```

---

## 9. オフライン動作と同期アーキテクチャ (Offline & Sync Architecture)

本システムは、ネットワーク接続が不安定な環境や完全なオフライン環境でも主要な業務を継続できるよう、堅牢なオフライン同期機構 (`offline-sync-v2.js`) を備えている。

### 9.1 アーキテクチャ概要

*   **PWA Cache (Service Worker)**: `sw.js` により、アプリケーションシェル（HTML, CSS, JS）および最新のマスターデータをキャッシュし、オフライン起動を保証。
*   **Offline Queue (IndexedDB/LocalStorage)**: オフライン時に発生したデータ更新操作（予約、チェックイン、座席変更など）をキューに蓄積。
*   **Background Sync**: オンライン復帰時、またはバックグラウンドで接続が確立された瞬間に、キュー内の操作を順次サーバーへ送信。

### 9.2 同期メカニズム (`OfflineSync v2`)

#### A. 操作キューリング
オフライン時にユーザーが行った操作は、以下のメタデータと共に `OfflineQueue` にシリアライズして保存される。

*   **Operation ID**: 一意な識別子
*   **Type**: `RESERVE_SEATS`, `CHECK_IN`, `UPDATE_SEAT` など
*   **Payload**: APIリクエストに必要な全パラメータ
*   **Timestamp**: 操作発生時刻（競合解決に使用）
*   **Priority**: 操作の優先度（予約作成 > チェックイン > 座席メモ編集）

#### B. 競合解決 (Conflict Resolution)
オンライン復帰時の同期において、サーバー上の状態とローカル操作が競合した場合（例：オフライン中に別の管理者が同じ席を予約していた）、以下の戦略で解決を図る。

1.  **Strict Mode (予約作成)**:
    *   サーバー上の座席が既に埋まっている場合、その操作は **失敗 (Error)** として扱い、ユーザーに通知する（二重予約の絶対防止）。
2.  **Merge Mode (座席情報編集)**:
    *   サーバー上の `updated_at` とローカル操作のタイムスタンプを比較し、より新しい変更を優先する（Last-Write-Wins）、あるいはフィールド単位でマージを行う。

#### C. バックグラウンド同期フロー
1.  **Detection**: `window.ononline` イベントまたは定期的な Ping (`checkConnectionStatus`) によりオンライン復帰を検知。
2.  **Lock Acquisition**: 複数のタブが開かれている場合、`BroadcastChannel` と `LocalStorage Lock` を用いて、1つのタブのみが同期マスター（Sync Coordinator）となる。
3.  **Batch Processing**: キューから優先度順に操作を取り出し、バッチ処理でAPIを実行。
4.  **Feedback**: 同期完了後、成功数・失敗数をユーザーに通知（Toast Notification）し、最新のデータを再取得して画面をリフレッシュする。


---
## 10. システム管理機能 (System Management)

### 10.1 システムバックアップと復元 (Backup & Restore)

データ保全のため、Supabase上の全データをGoogle Sheetsにバックアップし、必要時にそこから復元する機能を実装している。

#### A. バックアップ機能
*   **Trigger**: 管理画面からの手動実行、または GAS の Time-Driven Trigger による自動実行。
*   **Storage**: Google Drive のルートディレクトリに `Tickets_Backup` フォルダを自動生成し、その中に日時ごとのスプレッドシート (`Backup_YYYYMMDD_HHMMSS`) を保存する。
*   **Scope**: `bookings`, `seats`, `performances`, `groups`, `event_dates`, `time_slots`, `settings` の全テーブル。

#### B. 復元 (Restore) 機能
*   **Security**: 破壊的な操作であるため、二重のセキュリティチェックを行う。
    1.  **UI確認**: ユーザーによる確認ダイアログと、キーワード `RESTORE` の手動入力。
    2.  **Restore Key**: スクリプトプロパティ `RESTORE_KEY` に設定されたパスワードの入力（サーバーサイド検証）。
*   **Process**:
    1.  すべてのテーブルデータを削除 (`TRUNCATE` / `DELETE`).
    2.  スプレッドシートからデータを読み込み。
    3.  依存関係を考慮した順序でデータを再挿入（Bulk Insert）。

#### C. 自動ローテーション
*   定期実行スクリプト (`runPeriodicBackup`) により、古いバックアップ（デフォルトで最新30件保持）を自動的にゴミ箱へ移動し、Drive容量を節約する。

---

**市川学園 座席管理システム v32.0.1**
Technical Documentation
Commit: `v32.0.1`

Copyright (c) 2025 Junxiang Jin. All rights reserved.
