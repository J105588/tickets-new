// SupabaseIntegration.gs
// GASからSupabaseへの接続とデータ操作を行うクラス

class SupabaseIntegration {
  constructor() {
    // Supabase設定（スクリプトプロパティから取得）
    this.url = PropertiesService.getScriptProperties().getProperty('SUPABASE_URL');
    this.anonKey = PropertiesService.getScriptProperties().getProperty('SUPABASE_ANON_KEY');
    this.serviceRoleKey = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!this.url || !this.anonKey) {
      throw new Error('Supabase設定が不完全です。URLとAPIキーを設定してください。');
    }
  }

  // Supabase API呼び出しの基本メソッド
  async _request(endpoint, options = {}) {
    const url = `${this.url}/rest/v1/${endpoint}`;
    const method = (options.method || 'GET').toUpperCase();
    const isMutation = method !== 'GET' && method !== 'HEAD';
    const authKey = isMutation && this.serviceRoleKey ? this.serviceRoleKey : this.anonKey;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': authKey,
      'Authorization': `Bearer ${authKey}`,
      ...(isMutation ? { 'Prefer': 'return=representation' } : {}),
      ...options.headers
    };

    try {
      const response = await UrlFetchApp.fetch(url, {
        method: method,
        headers: headers,
        payload: options.body ? JSON.stringify(options.body) : undefined,
        muteHttpExceptions: true
      });

      const status = response.getResponseCode();
      const text = response.getContentText();
      if (String(status)[0] !== '2') {
        throw new Error(`HTTP ${status}: ${text}`);
      }

      if (!text || text.trim().length === 0) {
        // GETは空配列、それ以外はnull
        return { success: true, data: (method === 'GET' || method === 'HEAD') ? [] : null };
      }
      try {
        const data = JSON.parse(text);
        return { success: true, data: data };
      } catch (_) {
        return { success: true, data: text };
      }
    } catch (error) {
      console.error('Supabase API Error:', error);
      return { success: false, error: error.message };
    }
  }

  // 公演データの取得
  async getPerformance(group, day, timeslot) {
    const endpoint = `performances?group_name=eq.${encodeURIComponent(group)}&day=eq.${day}&timeslot=eq.${timeslot}&select=*`;
    return await this._request(endpoint);
  }

  // 公演データの作成
  async createPerformance(group, day, timeslot) {
    const data = {
      group_name: group,
      day: day,
      timeslot: timeslot
    };
    return await this._request('performances', {
      method: 'POST',
      body: data
    });
  }

  // 座席データの取得（既存のデータ構造に合わせた形式）
  async getSeats(performanceId, status = null) {
    let endpoint = `seats?performance_id=eq.${performanceId}&select=*`;
    if (status) {
      endpoint += `&status=eq.${status}`;
    }
    return await this._request(endpoint);
  }

  // 座席データの更新
  async updateSeat(performanceId, seatId, updates) {
    const data = {
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    return await this._request(`seats?performance_id=eq.${performanceId}&seat_id=eq.${seatId}`, {
      method: 'PATCH',
      body: data
    });
  }

  // 複数座席の一括更新
  async updateMultipleSeats(performanceId, updates) {
    const results = [];
    
    for (const update of updates) {
      const result = await this.updateSeat(performanceId, update.seatId, update.data);
      results.push({
        seatId: update.seatId,
        success: result.success,
        data: result.data
      });
    }
    
    return { success: true, data: results };
  }

  // 座席の予約
  async reserveSeats(performanceId, seatIds, reservedBy) {
    const updates = seatIds.map(seatId => ({
      seatId: seatId,
      data: {
        status: 'reserved',
        reserved_by: reservedBy,
        reserved_at: new Date().toISOString()
      }
    }));
    
    return await this.updateMultipleSeats(performanceId, updates);
  }

  // 座席のチェックイン
  async checkInSeats(performanceId, seatIds) {
    const updates = seatIds.map(seatId => ({
      seatId: seatId,
      data: {
        status: 'checked_in',
        checked_in_at: new Date().toISOString()
      }
    }));
    
    return await this.updateMultipleSeats(performanceId, updates);
  }

  // 当日券の割り当て
  async assignWalkInSeats(performanceId, count) {
    // 利用可能な座席を取得
    const availableSeatsResult = await this.getSeats(performanceId, 'available');
    if (!availableSeatsResult.success || availableSeatsResult.data.length < count) {
      return { success: false, error: '利用可能な座席が不足しています' };
    }
    
    // ランダムに指定数の座席を選択（Fisher-Yatesでシャッフル）
    const pool = availableSeatsResult.data.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    const selectedSeats = pool.slice(0, count);
    const updates = selectedSeats.map(seat => ({
      seatId: seat.seat_id,
      data: {
        status: 'walkin',
        walkin_at: new Date().toISOString()
      }
    }));
    
    return await this.updateMultipleSeats(performanceId, updates);
  }

  // 座席データの統計取得
  async getSeatStatistics(performanceId) {
    const seatsResult = await this.getSeats(performanceId);
    if (!seatsResult.success) {
      return { success: false, error: '座席データの取得に失敗しました' };
    }
    
    const seats = seatsResult.data;
    const stats = {
      total: seats.length,
      available: seats.filter(s => s.status === 'available').length,
      reserved: seats.filter(s => s.status === 'reserved').length,
      checked_in: seats.filter(s => s.status === 'checked_in').length,
      walkin: seats.filter(s => s.status === 'walkin').length,
      blocked: seats.filter(s => s.status === 'blocked').length
    };
    
    return { success: true, data: stats };
  }

  // 接続テスト
  async testConnection() {
    try {
      const result = await this._request('performances?select=count');
      return { success: true, message: 'Supabase接続成功' };
    } catch (error) {
      return { success: false, error: `Supabase接続失敗: ${error.message}` };
    }
  }
}

// グローバルインスタンス
const supabaseIntegration = new SupabaseIntegration();
