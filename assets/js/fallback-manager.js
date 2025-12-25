// fallback-manager.js - フォールバック状態管理システム

class FallbackManager {
  constructor() {
    this.fallbackState = {
      isActive: false,
      mode: 'supabase', // 'supabase', 'gas', 'mixed'
      lastFallbackTime: 0,
      fallbackCount: 0,
      gasSuccessCount: 0,
      supabaseFailureCount: 0,
      totalRequests: 0
    };
    
    this.init();
  }

  init() {
    // 状態を復元
    this.loadState();
    
    // 定期的に状態をクリーンアップ
    setInterval(() => this.cleanupState(), 300000); // 5分ごと
    
    // ページ終了時に状態を保存
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.saveState());
    }
  }

  // フォールバック開始を記録
  recordFallbackStart(reason = 'unknown') {
    this.fallbackState.isActive = true;
    this.fallbackState.mode = 'gas';
    this.fallbackState.lastFallbackTime = Date.now();
    this.fallbackState.fallbackCount++;
    this.fallbackState.totalRequests++;
    
    console.log(`[FallbackManager] Fallback activated: ${reason}`);
    this.showFallbackNotification(reason);
    this.saveState();
  }

  // フォールバック成功を記録
  recordFallbackSuccess() {
    this.fallbackState.gasSuccessCount++;
    console.log(`[FallbackManager] GAS fallback successful (${this.fallbackState.gasSuccessCount} total)`);
  }

  // Supabase失敗を記録
  recordSupabaseFailure() {
    this.fallbackState.supabaseFailureCount++;
    console.log(`[FallbackManager] Supabase failure recorded (${this.fallbackState.supabaseFailureCount} total)`);
  }

  // フォールバック終了を記録
  recordFallbackEnd() {
    this.fallbackState.isActive = false;
    this.fallbackState.mode = 'supabase';
    console.log('[FallbackManager] Fallback deactivated, returning to Supabase');
    this.saveState();
  }

  // 混合モードを記録
  recordMixedMode() {
    this.fallbackState.mode = 'mixed';
    console.log('[FallbackManager] Mixed mode active (both Supabase and GAS)');
  }

  // フォールバック通知を表示
  showFallbackNotification(reason) {
    if (typeof window !== 'undefined' && window.ErrorNotification) {
      let message = 'Supabaseに接続できないため、GAS経由で処理を継続します。';
      
      if (reason.includes('Load failed')) {
        message = 'ネットワークエラーが発生したため、GAS経由で処理を継続します。';
      } else if (reason.includes('timeout')) {
        message = 'タイムアウトが発生したため、GAS経由で処理を継続します。';
      }
      
      window.ErrorNotification.show(message, {
        title: 'フォールバックモード',
        type: 'info',
        duration: 5000
      });
    }
  }

  // 統計情報を取得
  getStats() {
    const now = Date.now();
    const timeSinceLastFallback = now - this.fallbackState.lastFallbackTime;
    
    return {
      ...this.fallbackState,
      timeSinceLastFallback,
      fallbackRate: this.fallbackState.totalRequests > 0 
        ? (this.fallbackState.fallbackCount / this.fallbackState.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      gasSuccessRate: this.fallbackState.fallbackCount > 0
        ? (this.fallbackState.gasSuccessCount / this.fallbackState.fallbackCount * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  // 状態をリセット
  resetStats() {
    this.fallbackState = {
      isActive: false,
      mode: 'supabase',
      lastFallbackTime: 0,
      fallbackCount: 0,
      gasSuccessCount: 0,
      supabaseFailureCount: 0,
      totalRequests: 0
    };
    
    this.saveState();
    console.log('[FallbackManager] Statistics reset');
  }

  // 状態のクリーンアップ（古いデータを削除）
  cleanupState() {
    const now = Date.now();
    const oneHour = 3600000;
    
    // 1時間以上前のフォールバックは非アクティブに
    if (this.fallbackState.isActive && 
        now - this.fallbackState.lastFallbackTime > oneHour) {
      this.recordFallbackEnd();
    }
  }

  // 状態を保存
  saveState() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('fallbackState', JSON.stringify(this.fallbackState));
      }
    } catch (error) {
      console.warn('[FallbackManager] Failed to save state:', error);
    }
  }

  // 状態を読み込み
  loadState() {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('fallbackState');
        if (saved) {
          this.fallbackState = { ...this.fallbackState, ...JSON.parse(saved) };
        }
      }
    } catch (error) {
      console.warn('[FallbackManager] Failed to load state:', error);
    }
  }

  // フォールバック状態を強制設定
  setFallbackMode(enabled, reason = 'manual') {
    if (enabled) {
      this.recordFallbackStart(reason);
    } else {
      this.recordFallbackEnd();
    }
  }

  // 現在のモードを取得
  getCurrentMode() {
    return this.fallbackState.mode;
  }

  // フォールバックがアクティブかどうか
  isActive() {
    return this.fallbackState.isActive;
  }
}

// グローバルインスタンス
const fallbackManager = new FallbackManager();

// グローバルアクセス用
if (typeof window !== 'undefined') {
  window.FallbackManager = fallbackManager;
  
  // デバッグ用コンソールコマンド
  window.SeatApp = window.SeatApp || {};
  window.SeatApp.fallback = {
    stats: () => fallbackManager.getStats(),
    reset: () => fallbackManager.resetStats(),
    enable: (reason) => fallbackManager.setFallbackMode(true, reason || 'manual'),
    disable: () => fallbackManager.setFallbackMode(false),
    mode: () => fallbackManager.getCurrentMode(),
    active: () => fallbackManager.isActive()
  };
}

export default fallbackManager;
