// system-lock.js - システムロック機能 (Premium & Persist Edition)
import errorHandler from './error-handler.js';

class SystemLock {
  constructor() {
    this.storageKey = 'system_lock_v2';
    this.ls = typeof localStorage !== 'undefined' ? localStorage : null;
    this._readyResolved = false;
    this.isLocked = false;
    this.message = null;
    this.domObserver = null;
    
    // BroadcastChannel for cross-tab sync
    this.bc = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('system_lock_sync') : null;

    // Ready Promise
    if (!window.systemLockReady) {
      window.systemLockReady = new Promise((resolve) => {
        this._resolveReady = resolve;
      });
    }

    this.init();
  }

  async init() {
    // 1. ローカルキャッシュから即座に状態を復元（高速な保護）
    this.restoreFromCache();

    // 2. タブ間同期の受信設定
    if (this.bc) {
      this.bc.onmessage = (e) => {
        if (e.data && e.data.type === 'LOCK_STATE_CHANGE') {
          this.applyLockState(e.data.locked, e.data.message, false);
        }
      };
    }

    // 3. サーバー監視開始
    this.startSystemLockWatcher();
    
    // 4. セキュリティ: ウィンドウのリサイズやスクロールを制御
    window.addEventListener('scroll', () => {
      if (this.isLocked) window.scrollTo(0, 0);
    }, { passive: false });
  }

  restoreFromCache() {
    try {
      const cached = this.ls ? this.ls.getItem(this.storageKey) : null;
      if (cached) {
        const { locked, message, ts } = JSON.parse(cached);
        // キャッシュが1時間以内の場合は即座に適用（安全第一）
        if (locked) {
          console.log('[SystemLock] 以前のロック状態をキャッシュから復元');
          this.applyLockState(true, message, false);
        }
      }
    } catch (_) {}
  }

  saveToCache(locked, message) {
    try {
      if (this.ls) {
        this.ls.setItem(this.storageKey, JSON.stringify({
          locked,
          message,
          ts: Date.now()
        }));
      }
    } catch (_) {}
  }

  async startSystemLockWatcher() {
    try {
      const { default: GasAPI } = await import('./api.js');
      let _lockCheckInFlight = false;

      const tick = async () => {
        if (_lockCheckInFlight) return;
        
        try {
          // バックグラウンドタブでは頻度を下げるかスキップ
          if (document.visibilityState === 'hidden' && Math.random() > 0.1) return;
          
          _lockCheckInFlight = true;

          // オフライン時はキャッシュを信じる（オンラインになるまで変更しない）
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            _lockCheckInFlight = false;
            this.resolveReadyOnce();
            return;
          }

          const status = await GasAPI.getSystemLock();
          if (status && status.success) {
            this.applyLockState(!!status.locked, status.message, true);
          }
        } catch (error) {
          console.warn('[SystemLock] ロック確認失敗:', error);
        } finally {
          _lockCheckInFlight = false;
          this.resolveReadyOnce();
        }
      };

      // 初回実行とポーリング（30秒）
      tick();
      setInterval(tick, 30000);

    } catch (error) {
      console.error('[SystemLock] 初期化失敗:', error);
      this.resolveReadyOnce();
    }
  }

  applyLockState(locked, message, shouldBroadcast = true) {
    this.isLocked = locked;
    this.message = message || 'メンテナンス中のためアクセスを一時停止しています';

    if (locked) {
      this.ensureGate();
      this.lockUI();
      if (shouldBroadcast && this.bc) {
        this.bc.postMessage({ type: 'LOCK_STATE_CHANGE', locked: true, message: this.message });
      }
    } else {
      this.removeGate();
      this.unlockUI();
      if (shouldBroadcast && this.bc) {
        this.bc.postMessage({ type: 'LOCK_STATE_CHANGE', locked: false });
      }
    }

    this.saveToCache(locked, message);
  }

  ensureGate() {
    let gate = document.getElementById('system-lock-gate');
    if (!gate) {
      gate = document.createElement('div');
      gate.id = 'system-lock-gate';
      gate.className = 'glass-morphism';
      gate.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(12px) saturate(180%);
        -webkit-backdrop-filter: blur(12px) saturate(180%);
        background-color: rgba(17, 25, 40, 0.75);
        opacity: 0;
        transition: opacity 0.5s ease;
        pointer-events: all;
        user-select: none;
        -webkit-user-select: none;
      `;

      const content = document.createElement('div');
      content.style.cssText = `
        background: rgba(255, 255, 255, 0.95);
        padding: 40px;
        border-radius: 24px;
        max-width: 420px;
        width: 90%;
        text-align: center;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        color: #1a202c;
        transform: translateY(20px);
        transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      `;

      content.innerHTML = `
        <div style="margin-bottom: 24px;">
          <div style="width: 64px; height: 64px; background: #feb2b2; color: #c53030; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
            <svg style="width: 32px; height: 32px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m0 0v2m0-2h2m-2 0h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
          </div>
        </div>
        <h2 style="font-size: 24px; font-weight: 800; margin: 0 0 12px 0; color: #2d3748;">System Locked</h2>
        <p id="system-lock-message" style="margin: 0 0 24px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">${this.message}</p>
        <div style="font-size: 12px; color: #a0aec0; margin-bottom: 20px;">
          管理者がメンテナンスを行っています。しばらくお待ちください。
        </div>
        <button id="system-lock-retry" style="background: #3182ce; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
          再試行
        </button>
      `;

      gate.appendChild(content);
      document.body.appendChild(gate);

      // アニメーション開始
      requestAnimationFrame(() => {
        gate.style.opacity = '1';
        content.style.transform = 'translateY(0)';
      });

      // 再試行ボタン
      gate.querySelector('#system-lock-retry').onclick = () => {
        const btn = gate.querySelector('#system-lock-retry');
        btn.textContent = '確認中...';
        btn.disabled = true;
        this.startSystemLockWatcher().finally(() => {
          setTimeout(() => {
            btn.textContent = '再試行';
            btn.disabled = false;
          }, 1000);
        });
      };
    } else {
      // メッセージの更新
      const msgEl = gate.querySelector('#system-lock-message');
      if (msgEl) msgEl.textContent = this.message;
    }

    // 監視の継続
    if (!this.domObserver) {
      this.domObserver = new MutationObserver(() => {
        if (this.isLocked && !document.getElementById('system-lock-gate')) {
          this.ensureGate();
        }
      });
      this.domObserver.observe(document.body, { childList: true });
    }
  }

  removeGate() {
    const gate = document.getElementById('system-lock-gate');
    if (gate) {
      gate.style.opacity = '0';
      setTimeout(() => gate.remove(), 500);
    }
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }
  }

  lockUI() {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    this._keyHandler = (e) => {
      if (this.isLocked) {
        // Tab, Space, Enter, Escape, Arrow keys などをブロック
        const blocked = ['Tab', ' ', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
        if (blocked.includes(e.key)) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', this._keyHandler, { capture: true });
  }

  unlockUI() {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler, { capture: true });
      this._keyHandler = null;
    }
  }

  resolveReadyOnce() {
    if (!this._readyResolved && this._resolveReady) {
      try { this._resolveReady(); } catch (_) {}
      this._readyResolved = true;
    }
  }
}

// インスタンス作成
const systemLock = new SystemLock();
window.systemLock = systemLock;
export default systemLock;
