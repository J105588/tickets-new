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
        } catch (_) {}
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
          result = await window.GasAPI.checkInSeats(...params);
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
    let endpoint = `seats?performance_id=eq.${performanceId}&select=*`;
    
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
          columnC: mapStatusToColumnC(seat.status),
          columnD: seat.reserved_by || '',
          columnE: seat.checked_in_at ? '済' : ''
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
    const data = {
      status: status,
      updated_at: new Date().toISOString(),
      ...additionalData
    };
    
    // 座席更新専用のタスク関数（追加の検証付き）
    const task = async () => {
      // 事前チェック：座席が存在するか確認
      try {
        const checkResult = await this._request(`seats?performance_id=eq.${performanceId}&seat_id=eq.${seatId}&select=id`, {
          method: 'GET'
        });
        
        if (!checkResult.success || !checkResult.data || checkResult.data.length === 0) {
          throw new Error(`Seat ${seatId} not found for performance ${performanceId}`);
        }
      } catch (checkError) {
        console.warn('Seat existence check failed, proceeding with update:', checkError.message);
        // 存在チェックが失敗しても更新は試行する
      }
      
      // 実際の更新リクエスト
      return this._request(`seats?performance_id=eq.${performanceId}&seat_id=eq.${seatId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        headers: {
          'Prefer': 'return=representation'
        }
      });
    };
    
    try {
      const result = await this._retry(task, { 
        retries: 5, 
        base: 500, 
        max: 3000,
        circuitBreaker: true 
      });
      
      // 成功時のログ
      if (result.success) {
        console.log(`Successfully updated seat ${seatId} to status ${status}`);
      }
      
      return result;
    } catch (error) {
      // 最終的な失敗時の詳細ログ
      console.error(`Failed to update seat ${seatId} after all retries:`, {
        performanceId,
        seatId,
        status,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      // ユーザーフレンドリーなエラーメッセージを返す
      return {
        success: false,
        error: `座席 ${seatId} の更新に失敗しました。ネットワーク接続を確認して再試行してください。`,
        originalError: error.message,
        errorType: 'update_failed'
      };
    }
  }

  async updateMultipleSeats(performanceId, updates) {
    const results = [];
    let allSucceeded = true;
    // 並列し過ぎると429になりやすいので小さなバッチで逐次
    const batchSize = 5;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      for (const update of batch) {
        try {
          const result = await this.updateSeatStatus(performanceId, update.seatId, update.status, update.data);
          const entry = {
            seatId: update.seatId,
            success: !!(result && result.success),
            data: result ? result.data : null,
            error: result && !result.success ? (result.error || 'unknown error') : null
          };
          if (!entry.success) allSucceeded = false;
          results.push(entry);
        } catch (e) {
          allSucceeded = false;
          results.push({ seatId: update.seatId, success: false, error: e && e.message });
        }
      }
      // 軽い待機でスロットリング回避
      if (i + batchSize < updates.length) {
        await new Promise(r => setTimeout(r, 120));
      }
    }
    return { success: allSucceeded, data: results };
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
      const updates = selectedSeats.map(seatId => ({
        seatId: seatId,
        status: 'reserved',
        data: {
          reserved_by: reservedBy,
          reserved_at: new Date().toISOString()
        }
      }));
      
      const updateResult = await this.updateMultipleSeats(performanceId, updates);
      
      if (!updateResult.success) {
        return { success: false, error: '座席の予約に失敗しました' };
      }
      
      // 予約履歴を記録
      const reservations = selectedSeats.map(seatId => ({
        performance_id: performanceId,
        seat_id: seatId,
        reserved_by: reservedBy,
        reserved_at: new Date().toISOString()
      }));
      
      const reservationResult = await this._request('reservations', {
        method: 'POST',
        body: JSON.stringify(reservations)
      });
      
      return {
        success: true,
        data: {
          reservedSeats: selectedSeats,
          performanceId: performanceId,
          reservedBy: reservedBy
        }
      };
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
  }

  async checkInMultipleSeats(group, day, timeslot, seatIds) {
    const performanceResult = await this.getPerformances(group, day, timeslot);
    if (!performanceResult.success || !performanceResult.data.length) {
      return { success: false, error: '公演が見つかりません' };
    }
    const performanceId = performanceResult.data[0].id;
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
    
    // 座席を当日券として予約
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
  }

  // 連続席の当日券割り当て（同一行、連番で count 席）
  async assignWalkInConsecutiveSeats(group, day, timeslot, count) {
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
      return { success: false, error: '利用可能な座席が不足しています' };
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
      const isCheckedIn = typeof columnE === 'string' && /済|check|checked/i.test(columnE);
      const data = {
        reserved_by: columnD || null,
        reserved_at: derivedStatus === 'reserved' ? nowIso : null,
        checked_in_at: isCheckedIn || derivedStatus === 'checked_in' ? nowIso : null,
        updated_at: nowIso
      };
      
      const result = await this.updateSeatStatus(performanceId, seatId, derivedStatus, data);
      
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
function mapStatusToColumnC(status) {
  switch (status) {
    case 'available': return '空';
    case 'reserved': return '予約済';
    case 'checked_in': return '予約済';
    case 'walkin': return '予約済';
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
  if (/チェック|済|checked/i.test(value)) return 'checked_in';
  if (/当日|walkin/i.test(value)) return 'walkin';
  // 既定は予約済み扱い
  if (/予約|確保|reserved/i.test(value)) return 'reserved';
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
    }
  };
}

// モジュールエクスポート
export { SupabaseAPI, supabaseAPI };
export default supabaseAPI;
