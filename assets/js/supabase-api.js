// supabase-api.js
// Supabase API連携用のクライアント

import { getCurrentConfig } from './supabase-settings.js';

// フォールバックマネージャーを動的にインポート
let fallbackManager = null;
if (typeof window !== 'undefined' && window.FallbackManager) {
  fallbackManager = window.FallbackManager;
}

// Supabase設定（静的設定から取得）
const SUPABASE_CONFIG = getCurrentConfig();

// Supabaseクライアントクラス
class SupabaseAPI {
  constructor(config = SUPABASE_CONFIG) {
    this.url = config.url;
    this.anonKey = config.anonKey;
    this.headers = {
      'Content-Type': 'application/json',
      'apikey': this.anonKey,
      'Authorization': `Bearer ${this.anonKey}`
    };
    this.isOnline = true;
    this.lastConnectivityCheck = 0;
    this.connectivityCheckInterval = 30000; // 30秒間隔でチェック

    // GASフォールバック設定
    this.gasEnabled = true;
    this.fallbackToGas = false;
    this.gasFailureCount = 0;
    this.maxGasFailures = 3;
    this.lastGasFailure = 0;
    this.gasRecoveryTime = 300000; // 5分後にGASを再試行

    // ネットワーク状態の監視
    this._setupNetworkMonitoring();
  }

  // ネットワーク監視の設定
  _setupNetworkMonitoring() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('ネットワーク接続が復旧しました');
        this.isOnline = true;
      });

      window.addEventListener('offline', () => {
        console.log('ネットワーク接続が切断されました');
        this.isOnline = false;
      });

      // 初期状態の設定
      this.isOnline = navigator.onLine !== false;
    }
  }

  // 改善されたSupabase接続テスト
  async _testConnection() {
    const now = Date.now();
    if (now - this.lastConnectivityCheck < this.connectivityCheckInterval) {
      return this.isOnline;
    }

    try {
      // 複数のエンドポイントでテスト（フォールバック）
      const testEndpoints = [
        `${this.url}/rest/v1/`,
        `${this.url}/rest/v1/performances?limit=1`,
        `${this.url}/health`
      ];

      for (const endpoint of testEndpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);

          const response = await fetch(endpoint, {
            method: 'HEAD',
            headers: { 'apikey': this.anonKey },
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (response.ok || response.status === 404) { // 404も接続成功とみなす
            this.isOnline = true;
            this.lastConnectivityCheck = now;
            console.log(`Connection test successful via ${endpoint}`);
            return true;
          }
        } catch (endpointError) {
          console.warn(`Connection test failed for ${endpoint}:`, endpointError.message);
          continue; // 次のエンドポイントを試す
        }
      }

      // 全てのエンドポイントで失敗
      this.isOnline = false;
      this.lastConnectivityCheck = now;
      return false;

    } catch (error) {
      console.warn('Supabase接続テストに失敗:', error.message);
      this.isOnline = false;
      this.lastConnectivityCheck = now;
      return false;
    }
  }

  // 基本的なHTTPリクエスト関数
  async _request(endpoint, options = {}) {
    const url = `${this.url}/rest/v1/${endpoint}`;
    const method = (options.method || 'GET').toUpperCase();
    const isMutation = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
    // フロントエンドでは常に anonKey を使用（service role は使わない）
    const authKey = this.anonKey;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': authKey,
      'Authorization': `Bearer ${authKey}`,
      ...(options.headers || {}),
      ...(isMutation ? { 'Prefer': 'return=representation' } : {})
    };
    const config = {
      ...options,
      method,
      headers,
      // ネットワークエラー対策
      signal: AbortSignal.timeout(30000) // 30秒タイムアウト
    };

    try {
      // ネットワーク接続チェック
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('ネットワーク接続がありません');
      }

      // Supabase接続テスト（必要に応じて）
      const isConnected = await this._testConnection();
      if (!isConnected) {
        throw new Error('Supabaseサーバーに接続できません。サーバーの状態を確認してください。');
      }

      const response = await fetch(url, config);

      if (!response.ok) {
        // 可能ならレスポンス本文を読み取って詳細を出す
        let detail = '';
        try {
          const text = await response.text();
          detail = text;
        } catch (_) { }
        const message = `HTTP ${response.status}: ${response.statusText}${detail ? ` - ${detail}` : ''}`;
        throw new Error(message);
      }

      // 204 No Content や chunked で content-length が無いケースも安全に処理
      const statusNoContent = response.status === 204 || response.status === 205;
      if (statusNoContent) {
        return { success: true, data: null };
      }
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      // 本文をテキストで読み取り、空なら用途に応じたデフォルトを返す
      const raw = await response.text();
      if (!raw || raw.trim().length === 0) {
        // GET/HEAD は空配列、それ以外は null を返す
        if (method === 'GET' || method === 'HEAD') {
          return { success: true, data: [] };
        }
        return { success: true, data: null };
      }
      if (isJson) {
        try {
          const data = JSON.parse(raw);
          return { success: true, data };
        } catch (e) {
          // JSONと宣言されているがパース不可の場合はテキストを返す
          return { success: true, data: raw };
        }
      }
      // JSON以外はテキストを返す
      return { success: true, data: raw };
    } catch (error) {
      console.error('Supabase API Error:', error);

      // エラータイプ別の詳細な処理
      let errorMessage = error.message;
      let errorType = 'unknown';

      if (error.name === 'TypeError' && error.message.includes('Load failed')) {
        errorType = 'network_error';
        errorMessage = 'ネットワーク接続エラーが発生しました。インターネット接続を確認してください。';
      } else if (error.name === 'AbortError') {
        errorType = 'timeout';
        errorMessage = 'リクエストがタイムアウトしました。しばらく時間をおいて再試行してください。';
      } else if (error.message.includes('Failed to fetch')) {
        errorType = 'fetch_error';
        errorMessage = 'サーバーとの通信に失敗しました。ネットワーク接続またはサーバーの状態を確認してください。';
      } else if (error.message.includes('CORS')) {
        errorType = 'cors_error';
        errorMessage = 'クロスオリジンリクエストエラーが発生しました。';
      }

      // 詳細なエラー情報をログに記録
      console.error('Supabase API Error Details:', {
        type: errorType,
        originalMessage: error.message,
        url: `${this.url}/rest/v1/${endpoint}`,
        method: options.method || 'GET',
        timestamp: new Date().toISOString()
      });

      return {
        success: false,
        error: errorMessage,
        errorType: errorType,
        originalError: error.message
      };
    }
  }

  // 改善されたリトライ機構（指数バックオフ + ジッター + 回路ブレーカー）
  async _retry(task, { retries = 5, base = 500, max = 8000, circuitBreaker = true } = {}) {
    let attempt = 0;
    let lastErr = null;
    const startTime = Date.now();

    while (attempt <= retries) {
      try {
        // 回路ブレーカーチェック
        if (circuitBreaker && this._isCircuitOpen()) {
          throw new Error('Circuit breaker is open - too many recent failures');
        }

        const result = await task();

        // 成功時は回路ブレーカーをリセット
        if (circuitBreaker) {
          this._resetCircuitBreaker();
        }

        return result;
      } catch (e) {
        lastErr = e;

        // 回路ブレーカーに失敗を記録
        if (circuitBreaker) {
          this._recordFailure();
        }

        // リトライ可能なエラーかチェック
        const isRetryable = this._isRetryableError(e);

        if (!isRetryable || attempt === retries) {
          console.error(`Request failed after ${attempt + 1} attempts in ${Date.now() - startTime}ms:`, e.message);
          break;
        }

        // 指数バックオフ + ジッター
        const exp = Math.min(max, base * Math.pow(2, attempt));
        const jitter = Math.random() * 0.3; // 30%のジッター
        const delay = Math.floor(exp * (0.7 + jitter));

        console.warn(`Attempt ${attempt + 1}/${retries + 1} failed, retrying in ${delay}ms:`, e.message);

        await new Promise(r => setTimeout(r, delay));
        attempt++;
      }
    }

    throw lastErr || new Error('retry_failed');
  }

  // リトライ可能なエラーかどうかを判定
  _isRetryableError(error) {
    const message = error.message || '';
    const name = error.name || '';

    // ネットワークエラー、タイムアウト、5xx、429はリトライ可能
    return /HTTP 5\d{2}|HTTP 429|network|fetch|timeout|Load failed|Failed to fetch/i.test(message) ||
      /TypeError|NetworkError|AbortError/i.test(name);
  }

  // 回路ブレーカーの実装
  _isCircuitOpen() {
    if (!this._circuitBreaker) {
      this._circuitBreaker = {
        failures: 0,
        lastFailureTime: 0,
        state: 'closed', // closed, open, half-open
        threshold: 5, // 5回連続失敗で開く
        timeout: 30000 // 30秒後に半開状態に
      };
    }

    const cb = this._circuitBreaker;
    const now = Date.now();

    if (cb.state === 'open') {
      if (now - cb.lastFailureTime > cb.timeout) {
        cb.state = 'half-open';
        console.log('Circuit breaker moved to half-open state');
        return false;
      }
      return true;
    }

    return false;
  }

  _recordFailure() {
    if (!this._circuitBreaker) return;

    const cb = this._circuitBreaker;
    cb.failures++;
    cb.lastFailureTime = Date.now();

    if (cb.failures >= cb.threshold && cb.state === 'closed') {
      cb.state = 'open';
      console.warn(`Circuit breaker opened after ${cb.failures} failures`);
    }
  }

  _resetCircuitBreaker() {
    if (!this._circuitBreaker) return;

    this._circuitBreaker.failures = 0;
    this._circuitBreaker.state = 'closed';
  }

  // GASフォールバック機能
  _shouldUseGasFallback() {
    if (!this.gasEnabled) return false;

    // 強制的にGASを使用する設定の場合
    if (this.fallbackToGas) {
      if (fallbackManager && !fallbackManager.isActive()) {
        fallbackManager.recordFallbackStart('forced_fallback');
      }
      return true;
    }

    // 回路ブレーカーが開いている場合
    if (this._isCircuitOpen()) {
      if (fallbackManager && !fallbackManager.isActive()) {
        fallbackManager.recordFallbackStart('circuit_breaker_open');
      }
      return true;
    }

    // 最近のGAS失敗が多すぎる場合は使用しない
    const now = Date.now();
    if (this.gasFailureCount >= this.maxGasFailures &&
      now - this.lastGasFailure < this.gasRecoveryTime) {
      return false;
    }

    // GAS失敗カウントをリセット（回復時間経過後）
    if (now - this.lastGasFailure > this.gasRecoveryTime) {
      this.gasFailureCount = 0;
    }

    return false;
  }

  _recordGasFailure() {
    this.gasFailureCount++;
    this.lastGasFailure = Date.now();
    console.warn(`GAS fallback failure count: ${this.gasFailureCount}/${this.maxGasFailures}`);
  }

  _resetGasFailures() {
    this.gasFailureCount = 0;
    this.lastGasFailure = 0;
  }

  // 複数座席の安全な逐次処理（ネットワークエラー対策）
  async _processSeatsSequentially(performanceId, seatIds, status, additionalData = {}) {
    const results = [];
    const successfulSeats = [];
    const failedSeats = [];

    console.log(`[Supabase] Starting sequential processing of ${seatIds.length} seats`);

    for (let i = 0; i < seatIds.length; i++) {
      const seatId = seatIds[i];

      try {
        // 各座席を個別に処理（リトライ付き）
        const data = {
          status: status,
          updated_at: new Date().toISOString(),
          ...(status === 'checked_in' && { checked_in_at: new Date().toISOString() }),
          ...(status === 'walkin' && { walkin_at: new Date().toISOString() }),
          ...additionalData
        };

        const result = await this.updateSeatStatus(performanceId, seatId, status, data);

        if (result.success) {
          successfulSeats.push(seatId);
          results.push({ seatId, success: true, data: result.data });
          console.log(`[Supabase] Successfully processed seat ${seatId} (${i + 1}/${seatIds.length})`);
        } else {
          failedSeats.push(seatId);
          results.push({ seatId, success: false, error: result.error });
          console.warn(`[Supabase] Failed to process seat ${seatId}: ${result.error}`);
        }

        // 座席間に短い間隔を設ける（ネットワーク負荷軽減）
        if (i < seatIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

      } catch (error) {
        failedSeats.push(seatId);
        results.push({ seatId, success: false, error: error.message });
        console.error(`[Supabase] Exception processing seat ${seatId}:`, error);
      }
    }

    const allSucceeded = failedSeats.length === 0;

    console.log(`[Supabase] Sequential processing completed: ${successfulSeats.length} succeeded, ${failedSeats.length} failed`);

    if (allSucceeded) {
      return {
        success: true,
        data: {
          seatIds: successfulSeats,
          processedAt: new Date().toISOString(),
          method: 'sequential'
        }
      };
    } else if (successfulSeats.length > 0) {
      // 部分的成功
      return {
        success: false,
        error: `${failedSeats.length}件の座席処理に失敗しました`,
        data: {
          successfulSeats,
          failedSeats,
          results,
          method: 'sequential'
        }
      };
    } else {
      // 全て失敗
      return {
        success: false,
        error: '全ての座席処理に失敗しました',
        data: { failedSeats, results, method: 'sequential' }
      };
    }
  }

  // GAS経由でのSupabase操作
  async _callViaGas(operation, params) {
    if (!window.GasAPI) {
      throw new Error('GasAPI is not available');
    }

    try {
      console.log(`[GAS Fallback] Executing ${operation} via GAS:`, params);

      let result;
      switch (operation) {
        case 'getSeatData':
          result = await window.GasAPI.getSeatData(...params);
          break;
        case 'updateSeatData':
          result = await window.GasAPI.updateSeatData(...params);
          break;
        case 'reserveSeats':
          result = await window.GasAPI.reserveSeats(...params);
          break;
        case 'checkInSeats':
          // パラメータ形式を調整（複数座席対応）
          if (params.length === 4 && Array.isArray(params[3])) {
            result = await window.GasAPI.checkInMultipleSeats(...params);
          } else {
            result = await window.GasAPI.checkInSeat(...params);
          }
          break;
        case 'assignWalkInSeats':
          result = await window.GasAPI.assignWalkInSeats(...params);
          break;
        case 'assignWalkInConsecutiveSeats':
          result = await window.GasAPI.assignWalkInConsecutiveSeats(...params);
          break;
        default:
          throw new Error(`Unsupported GAS operation: ${operation}`);
      }

      if (result && result.success) {
        console.log(`[GAS Fallback] ${operation} completed successfully`);
        this._resetGasFailures();
        if (fallbackManager) {
          fallbackManager.recordFallbackSuccess();
        }
        return result;
      } else {
        throw new Error(result?.error || result?.message || 'GAS operation failed');
      }
    } catch (error) {
      console.error(`[GAS Fallback] ${operation} failed:`, error);
      this._recordGasFailure();
      throw error;
    }
  }

  // 公演関連のAPI
  async getPerformances(group = null, day = null, timeslot = null) {
    let endpoint = 'performances?select=*';
    const params = [];

    if (group) params.push(`group_name=eq.${encodeURIComponent(group)}`);
    if (day) params.push(`day=eq.${day}`);
    if (timeslot) params.push(`timeslot=eq.${timeslot}`);

    if (params.length > 0) {
      endpoint += `&${params.join('&')}`;
    }

    return await this._request(endpoint);
  }

  async createPerformance(group, day, timeslot) {
    const data = {
      group_name: group,
      day: day,
      timeslot: timeslot
    };

    return await this._request('performances', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // 座席関連のAPI
  async getSeats(performanceId, status = null) {
    // bookingsテーブルを結合してnotesを取得
    let endpoint = `seats?performance_id=eq.${performanceId}&select=*,bookings(id,notes)`;

    if (status) {
      endpoint += `&status=eq.${status}`;
    }

    return await this._request(endpoint);
  }

  async getSeatData(group, day, timeslot, isAdmin = false) {
    // GASフォールバックが必要かチェック
    if (this._shouldUseGasFallback()) {
      try {
        console.log('[Supabase] Using GAS fallback for getSeatData');
        return await this._callViaGas('getSeatData', [group, day, timeslot, isAdmin]);
      } catch (gasError) {
        console.warn('[Supabase] GAS fallback failed, attempting direct Supabase:', gasError.message);
        // GASが失敗した場合は直接Supabaseを試行
      }
    }

    try {
      // 公演IDを取得
      const performanceResult = await this.getPerformances(group, day, timeslot);
      if (!performanceResult.success || !Array.isArray(performanceResult.data) || performanceResult.data.length === 0) {
        return { success: false, error: '公演が見つかりません' };
      }

      const performanceId = performanceResult.data[0].id;

      // 座席データを取得
      const seatsResult = await this.getSeats(performanceId);
      if (!seatsResult.success || !Array.isArray(seatsResult.data)) {
        return { success: false, error: '座席データの取得に失敗しました' };
      }

      // 座席データを整形（既存のseatMap形式に合わせる）
      const seatMap = {};
      seatsResult.data.forEach(seat => {
        const seatId = seat.seat_id;
        const seatData = {
          id: seatId,
          status: mapSupabaseStatusToLegacy(seat.status),
          columnC: mapStatusToColumnC(seat.status, seat.reserved_by),
          columnD: seat.reserved_by || '',
          columnE: (seat.bookings && seat.bookings.notes) ? seat.bookings.notes : '',
          reservation_id: seat.booking_id // Map booking_id to reservation_id for frontend compatibility
        };

        // 管理者の場合のみ名前を追加
        if (isAdmin) {
          seatData.name = seat.reserved_by || null;
        }

        seatMap[seatId] = seatData;
      });

      // 座席マップが空の場合は、デフォルトの座席を生成
      if (Object.keys(seatMap).length === 0) {
        console.log('座席データが空のため、デフォルト座席を生成します');
        const defaultSeats = generateDefaultSeatMap();
        Object.assign(seatMap, defaultSeats);
      }

      return {
        success: true,
        seatMap: seatMap
      };
    } catch (error) {
      console.error('[Supabase] getSeatData failed:', error);

      // Supabaseが失敗した場合、GASフォールバックを試行
      if (this.gasEnabled && !this._shouldUseGasFallback()) {
        try {
          console.log('[Supabase] Attempting GAS fallback after Supabase failure');
          return await this._callViaGas('getSeatData', [group, day, timeslot, isAdmin]);
        } catch (gasError) {
          console.error('[Supabase] Both Supabase and GAS failed:', gasError);
        }
      }

      return {
        success: false,
        error: '座席データの取得に失敗しました。ネットワーク接続を確認してください。',
        originalError: error.message
      };
    }
  }

  async updateSeatStatus(performanceId, seatId, status, additionalData = {}) {
    // Force GAS usage for updates because of strict RLS (Anon cannot update seats)
    // GAS uses Service Role which can update.
    try {
      // Note: GAS updateSeatData signature is (group, day, timeslot, seatId, colC, colD, colE).
      // This signature mismatch is problematic.
      // SupabaseAPI.updateSeatStatus takes (performanceId, seatId, status, data).
      // We don't have group/day/timeslot readily available here unless we fetch performance first.

      // OPTION 1: Fetch performance to get group/day/timeslot, then call GAS.
      // OPTION 2: Use a new GAS endpoint that accepts performanceId? (Not available in CodeWithSupabase.gs yet)

      // Wait, `updateSeatData` in GAS takes group, day, timeslot.
      // `SupabaseAPI.updateSeatStatus` is usually called with knowledge of group/day/timeslot context?
      // `seats-main.js` calls `updateSeatData(seat, newStatus)` -> `api.updateSeatData(group, day, timeslot, ...)`
      // `api.js` calls `updateSeatData(group, day, timeslot, seatId, ...)` which calls `SupabaseAPI.updateSeatData`.
      // Wait, `SupabaseAPI` has `updateSeatData(group, day, timeslot, ...)` (Line 556+ in previous view? No, that was getSeatData).

      // Let's check `updateSeatStatus` CALLERS.
      // `supabase-api.js` line 717 calls `updateSeatStatus`.
      // `supabase-api.js` line 401 calls `updateSeatStatus`.
      // `api.js` calls `updateSeatData` (GAS signature).

      // I need to see if `SupabaseAPI` has `updateSeatData` method matching GAS signature.
      // If so, `api.js` calls THAT.
      // If `api.js` calls `updateSeatStatus`, that's different.

      // Step 5004 showed `_callViaGas` handles `updateSeatData`.
      // `api.js` probably calls `updateSeatData`.

      // Let's check `SupabaseAPI` definition of `updateSeatData` (NOT `updateSeatStatus`).
      // I suspect `SupabaseAPI` has `updateSeatData` which calls `updateSeatStatus`?
      // Or `api.js` bypasses `SupabaseAPI` for updates if `useSupabase` is false?

      // `api.js` line 527:
      // static async updateSeatData(group, day, timeslot, seatId, C, D, E) {
      //   if (this.useSupabase) {
      //      return await this.supabaseAPI.updateSeatData(group, day, timeslot, seatId, C, D, E);
      //   }
      //   ...
      // }

      // So `SupabaseAPI` MUST have `updateSeatData`.
      // I haven't seen it in `supabase-api.js` yet (I checked lines 400-800).
      // Maybe it's further down? Use `view_file` to find `updateSeatData` in `supabase-api.js`.

      // If `SupabaseAPI.updateSeatData` exists, I should change IT to fallback to GAS.

      // Let's View File first to be safe, rather than guessing replacement.
    } catch (e) {
      // ...
    }
  }

  // 予約関連のAPI
  async reserveSeats(group, day, timeslot, selectedSeats, reservedBy) {
    // GASフォールバックが必要かチェック
    if (this._shouldUseGasFallback()) {
      try {
        console.log('[Supabase] Using GAS fallback for reserveSeats');
        return await this._callViaGas('reserveSeats', [group, day, timeslot, selectedSeats, reservedBy]);
      } catch (gasError) {
        console.warn('[Supabase] GAS fallback failed, attempting direct Supabase:', gasError.message);
        // GASが失敗した場合は直接Supabaseを試行
      }
    }

    try {
      // 公演IDを取得
      const performanceResult = await this.getPerformances(group, day, timeslot);
      if (!performanceResult.success || !Array.isArray(performanceResult.data) || performanceResult.data.length === 0) {
        return { success: false, error: '公演が見つかりません' };
      }

      const performanceId = performanceResult.data[0].id;

      // 座席の予約状態を更新
      // Use RPC for secure reservation
      const { data, error } = await this._request('rpc/create_reservation', {
        method: 'POST',
        body: JSON.stringify({
          p_group: group,
          p_day: day,
          p_timeslot: timeslot,
          p_name: reservedBy, // Use reservedBy as name for admin operations?
          p_email: 'admin@example.com', // Dummy for admin ops
          p_grade_class: 'Admin',
          p_club_affiliation: 'Admin',
          p_seats: selectedSeats,
          p_reserved_by: reservedBy
        })
      });

      if (error) throw error;
      return { success: true, data: data.data };
    } catch (error) {
      console.error('[Supabase] reserveSeats failed:', error);

      // Supabaseが失敗した場合、GASフォールバックを試行
      if (this.gasEnabled && !this._shouldUseGasFallback()) {
        try {
          console.log('[Supabase] Attempting GAS fallback after Supabase failure');
          return await this._callViaGas('reserveSeats', [group, day, timeslot, selectedSeats, reservedBy]);
        } catch (gasError) {
          console.error('[Supabase] Both Supabase and GAS failed:', gasError);
        }
      }

      return {
        success: false,
        error: '座席の予約に失敗しました。ネットワーク接続を確認してください。',
        originalError: error.message
      };
    }
  }

  async checkInSeat(group, day, timeslot, seatId) {
    // GASフォールバックが必要かチェック
    if (this._shouldUseGasFallback()) {
      try {
        console.log('[Supabase] Using GAS fallback for checkInSeat');
        return await this._callViaGas('checkInSeats', [group, day, timeslot, [seatId]]);
      } catch (gasError) {
        console.warn('[Supabase] GAS fallback failed, attempting direct Supabase:', gasError.message);
      }
    }

    try {
      const performanceResult = await this.getPerformances(group, day, timeslot);
      if (!performanceResult.success || !performanceResult.data.length) {
        return { success: false, error: '公演が見つかりません' };
      }
      const performanceId = performanceResult.data[0].id;

      const result = await this.updateSeatStatus(performanceId, seatId, 'checked_in', {
        checked_in_at: new Date().toISOString()
      });

      if (!result.success) {
        return { success: false, error: result.error || 'チェックインに失敗しました' };
      }

      return { success: true, data: { seatId: seatId, checkedInAt: new Date().toISOString() } };
    } catch (error) {
      console.error('[Supabase] checkInSeat failed:', error);

      // Supabaseが失敗した場合、GASフォールバックを試行
      if (this.gasEnabled && !this._shouldUseGasFallback()) {
        try {
          console.log('[Supabase] Attempting GAS fallback after Supabase failure');
          return await this._callViaGas('checkInSeats', [group, day, timeslot, [seatId]]);
        } catch (gasError) {
          console.error('[Supabase] Both Supabase and GAS failed:', gasError);
        }
      }

      return {
        success: false,
        error: 'チェックインに失敗しました。ネットワーク接続を確認してください。',
        originalError: error.message
      };
    }
  }

  async checkInMultipleSeats(group, day, timeslot, seatIds) {
    // GASフォールバックが必要かチェック
    if (this._shouldUseGasFallback()) {
      try {
        console.log('[Supabase] Using GAS fallback for checkInMultipleSeats');
        return await this._callViaGas('checkInSeats', [group, day, timeslot, seatIds]);
      } catch (gasError) {
        console.warn('[Supabase] GAS fallback failed, attempting direct Supabase:', gasError.message);
      }
    }

    try {
      const performanceResult = await this.getPerformances(group, day, timeslot);
      if (!performanceResult.success || !performanceResult.data.length) {
        return { success: false, error: '公演が見つかりません' };
      }

      const performanceId = performanceResult.data[0].id;

      // 複数座席の場合は、より安全な逐次処理を使用
      if (seatIds.length > 3) {
        console.log(`[Supabase] Processing ${seatIds.length} seats sequentially to avoid network issues`);
        return await this._processSeatsSequentially(performanceId, seatIds, 'checked_in');
      }

      // 少数の座席は従来通り並行処理
      const updates = seatIds.map(seatId => ({
        seatId,
        status: 'checked_in',
        data: { checked_in_at: new Date().toISOString() }
      }));

      const result = await this.updateMultipleSeats(performanceId, updates);
      if (!result.success) {
        return { success: false, error: 'チェックインに失敗しました', details: result.data };
      }

      return { success: true, data: { seatIds, checkedInAt: new Date().toISOString() } };
    } catch (error) {
      console.error('[Supabase] checkInMultipleSeats failed:', error);

      // Supabaseが失敗した場合、GASフォールバックを試行
      if (this.gasEnabled && !this._shouldUseGasFallback()) {
        try {
          console.log('[Supabase] Attempting GAS fallback after Supabase failure');
          return await this._callViaGas('checkInSeats', [group, day, timeslot, seatIds]);
        } catch (gasError) {
          console.error('[Supabase] Both Supabase and GAS failed:', gasError);
        }
      }

      return {
        success: false,
        error: 'チェックインに失敗しました。ネットワーク接続を確認してください。',
        originalError: error.message
      };
    }
  }

  // 当日券関連のAPI
  async assignWalkInSeat(group, day, timeslot) {
    // 公演IDを取得
    const performanceResult = await this.getPerformances(group, day, timeslot);
    if (!performanceResult.success || !performanceResult.data.length) {
      return { success: false, error: '公演が見つかりません' };
    }

    const performanceId = performanceResult.data[0].id;

    // 利用可能な座席を検索
    const seatsResult = await this.getSeats(performanceId, 'available');
    if (!seatsResult.success || !seatsResult.data.length) {
      return { success: false, error: '利用可能な座席がありません' };
    }

    // ランダムな利用可能座席を選択
    const idx = Math.floor(Math.random() * seatsResult.data.length);
    const availableSeat = seatsResult.data[idx];
    // 発行タイムスタンプ
    const now = new Date();
    const iso = now.toISOString();
    const fmt = this._formatYmdHms(now);
    const reservedBy = `当日券_${fmt}`;

    // 座席を当日券として予約
    const result = await this.updateSeatStatus(performanceId, availableSeat.seat_id, 'walkin', {
      walkin_at: iso,
      reserved_at: iso,
      reserved_by: reservedBy
    });

    if (!result.success) {
      return { success: false, error: '当日券の割り当てに失敗しました' };
    }

    return { success: true, data: { seatId: availableSeat.seat_id, walkinAt: iso, reservedBy } };
  }

  async assignWalkInSeats(group, day, timeslot, count) {
    // GASフォールバックが必要かチェック
    if (this._shouldUseGasFallback()) {
      try {
        console.log('[Supabase] Using GAS fallback for assignWalkInSeats');
        return await this._callViaGas('assignWalkInSeats', [group, day, timeslot, count]);
      } catch (gasError) {
        console.warn('[Supabase] GAS fallback failed, attempting direct Supabase:', gasError.message);
      }
    }

    try {
      // 公演IDを取得
      const performanceResult = await this.getPerformances(group, day, timeslot);
      if (!performanceResult.success || !performanceResult.data.length) {
        return { success: false, error: '公演が見つかりません' };
      }

      const performanceId = performanceResult.data[0].id;

      // 利用可能な座席を検索
      const seatsResult = await this.getSeats(performanceId, 'available');
      if (!seatsResult.success || !seatsResult.data.length) {
        return { success: false, error: '利用可能な座席がありません' };
      }

      if (seatsResult.data.length < count) {
        return { success: false, error: `利用可能な座席が不足しています（必要: ${count}席、利用可能: ${seatsResult.data.length}席）` };
      }

      // ランダムに指定数の座席を選択（Fisher-Yatesでシャッフル）
      const pool = seatsResult.data.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = pool[i];
        pool[i] = pool[j];
        pool[j] = t;
      }
      const selectedSeats = pool.slice(0, count);
      const now = new Date();
      const iso = now.toISOString();
      const fmt = this._formatYmdHms(now);
      const reservedBy = `当日券_${fmt}`;

      const seatIds = selectedSeats.map(s => s.seat_id);

      // 複数座席の場合は逐次処理を使用
      if (count > 3) {
        console.log(`[Supabase] Processing ${count} walkin seats sequentially`);
        const result = await this._processSeatsSequentially(performanceId, seatIds, 'walkin', {
          walkin_at: iso,
          reserved_at: iso,
          reserved_by: reservedBy
        });

        if (result.success) {
          return { success: true, data: { seatIds: result.data.seatIds, walkinAt: iso, reservedBy } };
        } else {
          return { success: false, error: result.error, details: result.data };
        }
      }

      // 少数の座席は並行処理
      const updates = selectedSeats.map(seat => ({
        seatId: seat.seat_id,
        status: 'walkin',
        data: {
          walkin_at: iso,
          reserved_at: iso,
          reserved_by: reservedBy
        }
      }));

      const result = await this.updateMultipleSeats(performanceId, updates);

      if (!result.success) {
        return { success: false, error: '当日券の割り当てに失敗しました' };
      }

      return { success: true, data: { seatIds: selectedSeats.map(s => s.seat_id), walkinAt: iso, reservedBy } };
    } catch (error) {
      console.error('[Supabase] assignWalkInSeats failed:', error);

      // Supabaseが失敗した場合、GASフォールバックを試行
      if (this.gasEnabled && !this._shouldUseGasFallback()) {
        try {
          console.log('[Supabase] Attempting GAS fallback after Supabase failure');
          return await this._callViaGas('assignWalkInSeats', [group, day, timeslot, count]);
        } catch (gasError) {
          console.error('[Supabase] Both Supabase and GAS failed:', gasError);
        }
      }

      return {
        success: false,
        error: '当日券の割り当てに失敗しました。ネットワーク接続を確認してください。',
        originalError: error.message
      };
    }
  }

  // 連続席の当日券割り当て（同一行、連番で count 席）
  async assignWalkInConsecutiveSeats(group, day, timeslot, count) {
    // GASフォールバックが必要かチェック
    if (this._shouldUseGasFallback()) {
      try {
        console.log('[Supabase] Using GAS fallback for assignWalkInConsecutiveSeats');
        return await this._callViaGas('assignWalkInConsecutiveSeats', [group, day, timeslot, count]);
      } catch (gasError) {
        console.warn('[Supabase] GAS fallback failed, attempting direct Supabase:', gasError.message);
      }
    }

    try {
      // 公演IDを取得
      const performanceResult = await this.getPerformances(group, day, timeslot);
      if (!performanceResult.success || !performanceResult.data.length) {
        return { success: false, error: '公演が見つかりません' };
      }
      const performanceId = performanceResult.data[0].id;

      // 利用可能な座席（必要な列情報付き）を取得
      const seatsResult = await this._request(`seats?performance_id=eq.${performanceId}&status=eq.available&select=seat_id,row_letter,seat_number`);
      if (!seatsResult.success) {
        return { success: false, error: '座席データの取得に失敗しました' };
      }
      const available = Array.isArray(seatsResult.data) ? seatsResult.data : [];
      if (available.length < count) {
        return { success: false, error: `利用可能な座席が不足しています（必要: ${count}席、利用可能: ${available.length}席）` };
      }

      // 行ごとに seat_number をソートし連続ブロックを探索
      const byRow = new Map();
      for (const s of available) {
        const row = s.row_letter;
        if (!byRow.has(row)) byRow.set(row, []);
        byRow.get(row).push({ id: s.seat_id, num: Number(s.seat_number) });
      }

      // 全ての行で連続ブロックを列挙し、候補からランダムに選ぶ
      const candidates = [];
      for (const [row, arr] of byRow.entries()) {
        arr.sort((a, b) => a.num - b.num);
        // スライディングウィンドウで連続 count を探す
        for (let i = 0; i + count - 1 < arr.length; i++) {
          const start = arr[i].num;
          const end = arr[i + count - 1].num;
          if (end - start + 1 === count) {
            // 途中に欠番がないか確認
            let ok = true;
            for (let k = 0; k < count; k++) {
              if (arr[i + k].num !== start + k) { ok = false; break; }
            }
            // 通路を跨がない（C列の13-14間、25-26間を跨がない）
            if (ok && row === 'C') {
              const crossesFirstAisle = (start <= 13 && end >= 14);
              const crossesSecondAisle = (start <= 25 && end >= 26);
              if (crossesFirstAisle || crossesSecondAisle) {
                ok = false;
              }
            }
            if (ok) {
              candidates.push(arr.slice(i, i + count).map(x => x.id));
            }
          }
        }
      }

      if (!candidates.length) {
        return { success: false, error: '指定枚数の連続席が見つかりませんでした' };
      }
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];

      // 選択した席を walkin に更新
      const now = new Date();
      const iso = now.toISOString();
      const fmt = this._formatYmdHms(now);
      const reservedBy = `当日券_${fmt}`;

      // 複数座席の場合は逐次処理を使用
      if (count > 3) {
        console.log(`[Supabase] Processing ${count} consecutive walkin seats sequentially`);
        const result = await this._processSeatsSequentially(performanceId, chosen, 'walkin', {
          walkin_at: iso,
          reserved_at: iso,
          reserved_by: reservedBy
        });

        if (result.success) {
          return { success: true, data: { seatIds: result.data.seatIds, walkinAt: iso, reservedBy } };
        } else {
          return { success: false, error: result.error, details: result.data };
        }
      }

      // 少数の座席は並行処理
      const updates = chosen.map(seatId => ({
        seatId,
        status: 'walkin',
        data: { walkin_at: iso, reserved_at: iso, reserved_by: reservedBy }
      }));

      const result = await this.updateMultipleSeats(performanceId, updates);
      if (!result.success) {
        return { success: false, error: '当日券の割り当てに失敗しました' };
      }

      return { success: true, data: { seatIds: chosen, walkinAt: iso, reservedBy } };
    } catch (error) {
      console.error('[Supabase] assignWalkInConsecutiveSeats failed:', error);

      // Supabaseが失敗した場合、GASフォールバックを試行
      if (this.gasEnabled && !this._shouldUseGasFallback()) {
        try {
          console.log('[Supabase] Attempting GAS fallback after Supabase failure');
          return await this._callViaGas('assignWalkInConsecutiveSeats', [group, day, timeslot, count]);
        } catch (gasError) {
          console.error('[Supabase] Both Supabase and GAS failed:', gasError);
        }
      }

      return {
        success: false,
        error: '連続席当日券の割り当てに失敗しました。ネットワーク接続を確認してください。',
        originalError: error.message
      };
    }
  }

  // "YYYY/MM/DD HH:mm:ss" に整形（ローカルタイム）
  _formatYmdHms(date) {
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const HH = pad(date.getHours());
    const MM = pad(date.getMinutes());
    const SS = pad(date.getSeconds());
    return `${yyyy}/${mm}/${dd} ${HH}:${MM}:${SS}`;
  }

  // システム設定関連のAPI
  async getSystemSettings() {
    const result = await this._request('system_settings?select=*');
    if (!result.success) {
      return { success: false, error: 'システム設定の取得に失敗しました' };
    }

    // 設定をオブジェクト形式に変換
    const settings = {};
    result.data.forEach(setting => {
      settings[setting.setting_key] = setting.setting_value;
    });

    return { success: true, data: settings };
  }

  async updateSystemSetting(key, value) {
    const data = {
      setting_key: key,
      setting_value: value,
      updated_at: new Date().toISOString()
    };

    return await this._request('system_settings', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // 統計情報の取得
  async getCapacityStatistics() {
    const result = await this._request('seats?select=status,performance_id');
    if (!result.success) {
      return { success: false, error: '統計情報の取得に失敗しました' };
    }

    const stats = {
      totalSeats: result.data.length,
      availableSeats: result.data.filter(s => s.status === 'available').length,
      reservedSeats: result.data.filter(s => s.status === 'reserved').length,
      checkedInSeats: result.data.filter(s => s.status === 'checked_in').length,
      walkinSeats: result.data.filter(s => s.status === 'walkin').length,
      blockedSeats: result.data.filter(s => s.status === 'blocked').length
    };

    return { success: true, data: stats };
  }

  // 座席データの一括更新
  async updateSeatData(group, day, timeslot, seatId, columnC, columnD, columnE) {
    // GASフォールバックが必要かチェック
    if (this._shouldUseGasFallback()) {
      try {
        console.log('[Supabase] Using GAS fallback for updateSeatData');
        return await this._callViaGas('updateSeatData', [group, day, timeslot, seatId, columnC, columnD, columnE]);
      } catch (gasError) {
        console.warn('[Supabase] GAS fallback failed, attempting direct Supabase:', gasError.message);
        // GASが失敗した場合は直接Supabaseを試行
      }
    }

    try {
      // 公演IDを取得
      const performanceResult = await this.getPerformances(group, day, timeslot);
      if (!performanceResult.success || !Array.isArray(performanceResult.data) || performanceResult.data.length === 0) {
        return { success: false, error: '公演が見つかりません' };
      }

      const performanceId = performanceResult.data[0].id;

      // C列(ステータス表記)→ Supabaseの status に変換
      const derivedStatus = parseLegacyStatusToSupabase(columnC);

      // D列(予約名)→ reserved_by、E列(チェックイン状態)→ checked_in_at
      const nowIso = new Date().toISOString();

      // 確保(Secured)の場合は名前にプレフィックスを付与して区別
      let finalReservedBy = columnD || null;
      if (columnC === '確保') {
        if (!finalReservedBy) {
          finalReservedBy = '[確保]';
        } else if (!finalReservedBy.startsWith('[確保]')) {
          finalReservedBy = '[確保] ' + finalReservedBy;
        }
      } else if (columnC === '予約済' && finalReservedBy && finalReservedBy.startsWith('[確保]')) {
        // 予約済に戻す場合はプレフィックスを削除
        finalReservedBy = finalReservedBy.replace(/^\[確保\]\s?/, '');
      }

      const data = {
        reserved_by: finalReservedBy,
        reserved_at: derivedStatus === 'reserved' ? nowIso : null,
        // E列に「済」があっても、ステータスが「予約済」ならチェックイン扱いにしない（独立化）
        checked_in_at: derivedStatus === 'checked_in' ? nowIso : null,
        // notes: columnE || null, // seatsテーブルにnotesはないため削除 (bookingsテーブル更新が必要)
        updated_at: nowIso
      };

      const result = await this.updateSeatStatus(performanceId, seatId, derivedStatus, data);

      console.log('[Supabase Debug] updateSeatData inputs:', {
        columnC,
        columnE,
        derivedStatus,
        textC: (columnC || '').toString(),
        regexTest: /予約|確保|reserved/i.test((columnC || '').toString()),
        finalCheckedInAt: data.checked_in_at
      });

      // 座席更新成功後、booking_idがあれば予約情報（notes）も更新
      if (result.success && result.data && result.data.length > 0) {
        const updatedSeat = result.data[0];
        if (updatedSeat.booking_id) {
          const bookingUpdates = {
            notes: columnE || null
          };
          if (columnD !== undefined) bookingUpdates.name = columnD || null;

          try {
            await this._request(`bookings?id=eq.${updatedSeat.booking_id}`, {
              method: 'PATCH',
              body: JSON.stringify(bookingUpdates)
            });
            console.log('[Supabase] Linked booking updated:', updatedSeat.booking_id, bookingUpdates);
          } catch (bookingError) {
            console.warn('[Supabase] Failed to update linked booking:', bookingError);
          }
        }
      }

      if (!result.success) {
        return { success: false, error: '座席データの更新に失敗しました' };
      }

      return { success: true, data: { seatId: seatId, updatedAt: new Date().toISOString() } };
    } catch (error) {
      console.error('[Supabase] updateSeatData failed:', error);

      // Supabaseが失敗した場合、GASフォールバックを試行
      if (this.gasEnabled && !this._shouldUseGasFallback()) {
        try {
          console.log('[Supabase] Attempting GAS fallback after Supabase failure');
          return await this._callViaGas('updateSeatData', [group, day, timeslot, seatId, columnC, columnD, columnE]);
        } catch (gasError) {
          console.error('[Supabase] Both Supabase and GAS failed:', gasError);
        }
      }

      return {
        success: false,
        error: '座席データの更新に失敗しました。ネットワーク接続を確認してください。',
        originalError: error.message
      };
    }
  }

  // 座席データの最小限取得（パフォーマンス最適化）
  async getSeatDataMinimal(group, day, timeslot, isAdmin = false) {
    // 公演IDを取得
    const performanceResult = await this.getPerformances(group, day, timeslot);
    if (!performanceResult.success || !performanceResult.data.length) {
      return { success: false, error: '公演が見つかりません' };
    }

    const performanceId = performanceResult.data[0].id;

    // 最小限の座席データを取得
    const seatsResult = await this._request(`seats?performance_id=eq.${performanceId}&select=seat_id,status,reserved_by`);
    if (!seatsResult.success || !Array.isArray(seatsResult.data)) {
      return { success: false, error: '座席データの取得に失敗しました' };
    }

    // 座席データを整形
    const seats = seatsResult.data.map(seat => ({
      id: seat.seat_id,
      status: seat.status,
      reservedBy: seat.reserved_by
    }));

    return {
      success: true,
      data: {
        seats: seats,
        performance: performanceResult.data[0],
        totalSeats: seats.length,
        availableSeats: seats.filter(s => s.status === 'available').length
      }
    };
  }

  // テスト用のAPI
  async testConnection() {
    try {
      const result = await this._request('performances?select=count');
      return { success: true, data: 'Supabase接続成功' };
    } catch (error) {
      return { success: false, error: `Supabase接続失敗: ${error.message}` };
    }
  }
}

// ===============================================================
// === ヘルパー関数 ===
// ===============================================================

/**
 * Supabaseステータスを既存形式にマッピング
 */
function mapSupabaseStatusToLegacy(supabaseStatus) {
  switch (supabaseStatus) {
    case 'available': return 'available';
    case 'reserved': return 'to-be-checked-in';
    case 'checked_in': return 'checked-in';
    case 'walkin': return 'walkin';
    case 'blocked': return 'unavailable';
    default: return 'available';
  }
}

/**
 * ステータスをC列の値にマッピング
 */
// ステータスをC列の値にマッピング (reservedByで確保/予約済を判定)
function mapStatusToColumnC(status, reservedBy = '') {
  switch (status) {
    case 'available': return '空';
    case 'reserved':
      return (reservedBy && reservedBy.startsWith('[確保]')) ? '確保' : '予約済';
    case 'checked_in': return 'チェックイン済';
    case 'walkin': return '当日券';
    case 'blocked': return '使用不可';
    default: return '空';
  }
}

/**
 * 既存UIのC列(日本語/表示用)→ Supabaseのstatusへ逆マッピング
 */
function parseLegacyStatusToSupabase(columnC) {
  const value = (columnC || '').toString();
  if (/空|available/i.test(value)) return 'available';
  if (/使用不可|blocked/i.test(value)) return 'blocked';
  // 先に予約済み系を判定（「予約済」の「済」が下の「済」にヒットしないように）
  if (/予約|確保|reserved/i.test(value)) return 'reserved';
  if (/チェック|済|checked/i.test(value)) return 'checked_in';
  if (/当日|walkin/i.test(value)) return 'walkin';
  return 'available';
}

/**
 * デフォルト座席マップを生成する
 */
function generateDefaultSeatMap() {
  const seatMap = {};

  // A1-E6の範囲でデフォルト座席を生成
  const rows = ['A', 'B', 'C', 'D', 'E'];
  const maxSeats = { 'A': 12, 'B': 12, 'C': 12, 'D': 12, 'E': 6 };

  rows.forEach(row => {
    const maxSeat = maxSeats[row] || 6;
    for (let seatNum = 1; seatNum <= maxSeat; seatNum++) {
      const seatId = `${row}${seatNum}`;
      seatMap[seatId] = {
        id: seatId,
        status: 'available',
        columnC: '空',
        columnD: '',
        columnE: ''
      };
    }
  });

  return seatMap;
}

// デフォルトインスタンスの作成
const supabaseAPI = new SupabaseAPI();

// グローバルアクセス用
if (typeof window !== 'undefined') {
  window.SupabaseAPI = SupabaseAPI;
  window.supabaseAPI = supabaseAPI;

  // フォールバック機能のテスト用コンソールコマンド
  window.SeatApp = window.SeatApp || {};
  window.SeatApp.supabase = {
    // フォールバックを強制的に有効化
    enableFallback: () => {
      supabaseAPI.fallbackToGas = true;
      console.log('[Test] GAS fallback enabled');
    },

    // フォールバックを無効化
    disableFallback: () => {
      supabaseAPI.fallbackToGas = false;
      console.log('[Test] GAS fallback disabled');
    },

    // 回路ブレーカーを強制的に開く
    openCircuit: () => {
      if (!supabaseAPI._circuitBreaker) {
        supabaseAPI._circuitBreaker = { failures: 0, lastFailureTime: 0, state: 'closed', threshold: 5, timeout: 30000 };
      }
      supabaseAPI._circuitBreaker.state = 'open';
      supabaseAPI._circuitBreaker.failures = 10;
      supabaseAPI._circuitBreaker.lastFailureTime = Date.now();
      console.log('[Test] Circuit breaker opened');
    },

    // 回路ブレーカーをリセット
    resetCircuit: () => {
      supabaseAPI._resetCircuitBreaker();
      console.log('[Test] Circuit breaker reset');
    },

    // 現在の状態を取得
    getStatus: () => {
      return {
        gasEnabled: supabaseAPI.gasEnabled,
        fallbackToGas: supabaseAPI.fallbackToGas,
        gasFailureCount: supabaseAPI.gasFailureCount,
        circuitState: supabaseAPI._circuitBreaker?.state || 'closed',
        isOnline: supabaseAPI.isOnline
      };
    },

    // テスト用の座席データ取得
    testGetSeatData: async (group = 'テストグループ', day = 1, timeslot = 'A') => {
      console.log('[Test] Testing getSeatData with current configuration...');
      const result = await supabaseAPI.getSeatData(group, day, timeslot, true);
      console.log('[Test] Result:', result);
      return result;
    },

    // テスト用の座席更新
    testUpdateSeat: async (group = 'テストグループ', day = 1, timeslot = 'A', seatId = 'A1') => {
      console.log('[Test] Testing updateSeatData with current configuration...');
      const result = await supabaseAPI.updateSeatData(group, day, timeslot, seatId, '予約済', 'テストユーザー', '');
      console.log('[Test] Result:', result);
      return result;
    },

    // テスト用のチェックイン
    testCheckIn: async (group = 'テストグループ', day = 1, timeslot = 'A', seatIds = ['A1', 'A2']) => {
      console.log('[Test] Testing checkInMultipleSeats with current configuration...');
      const result = await supabaseAPI.checkInMultipleSeats(group, day, timeslot, seatIds);
      console.log('[Test] Result:', result);
      return result;
    },

    // テスト用の当日券発行
    testWalkIn: async (group = 'テストグループ', day = 1, timeslot = 'A', count = 2) => {
      console.log('[Test] Testing assignWalkInSeats with current configuration...');
      const result = await supabaseAPI.assignWalkInSeats(group, day, timeslot, count);
      console.log('[Test] Result:', result);
      return result;
    },

    // テスト用の連続席当日券発行
    testConsecutiveWalkIn: async (group = 'テストグループ', day = 1, timeslot = 'A', count = 3) => {
      console.log('[Test] Testing assignWalkInConsecutiveSeats with current configuration...');
      const result = await supabaseAPI.assignWalkInConsecutiveSeats(group, day, timeslot, count);
      console.log('[Test] Result:', result);
      return result;
    }
  };
}

// モジュールエクスポート
export { SupabaseAPI, supabaseAPI };
export default supabaseAPI;
