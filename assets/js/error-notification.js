// error-notification.js - ユーザーフレンドリーなエラー通知システム

class ErrorNotification {
  constructor() {
    this.container = null;
    this.activeNotifications = new Set();
    this.maxNotifications = 3;
    this.init();
  }

  init() {
    // エラー通知用のコンテナを作成
    if (!document.getElementById('error-notification-container')) {
      this.container = document.createElement('div');
      this.container.id = 'error-notification-container';
      this.container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 50000;
        pointer-events: none;
        max-width: 400px;
        width: 100%;
      `;
      document.body.appendChild(this.container);
    } else {
      this.container = document.getElementById('error-notification-container');
    }

    // CSS スタイルを追加
    this.addStyles();
  }

  addStyles() {
    if (document.getElementById('error-notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'error-notification-styles';
    style.textContent = `
      .error-notification {
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        margin-bottom: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        pointer-events: auto;
        cursor: pointer;
        transform: translateX(100%);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-left: 4px solid rgba(255, 255, 255, 0.3);
        position: relative;
        overflow: hidden;
      }

      .error-notification.show {
        transform: translateX(0);
      }

      .error-notification.hide {
        transform: translateX(100%);
        opacity: 0;
      }

      .error-notification::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: rgba(255, 255, 255, 0.3);
        animation: progress 5s linear forwards;
      }

      .error-notification:hover::before {
        animation-play-state: paused;
      }

      .error-notification .error-title {
        font-weight: 600;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .error-notification .error-message {
        opacity: 0.9;
        font-size: 13px;
      }

      .error-notification .error-icon {
        font-size: 16px;
        flex-shrink: 0;
      }

      .error-notification.warning {
        background: linear-gradient(135deg, #ffa726 0%, #ff9800 100%);
      }

      .error-notification.info {
        background: linear-gradient(135deg, #42a5f5 0%, #2196f3 100%);
      }

      .error-notification.success {
        background: linear-gradient(135deg, #66bb6a 0%, #4caf50 100%);
      }

      @keyframes progress {
        from { width: 100%; }
        to { width: 0%; }
      }

      @media (max-width: 480px) {
        #error-notification-container {
          left: 10px;
          right: 10px;
          top: 10px;
          max-width: none;
        }
        
        .error-notification {
          padding: 12px 16px;
          font-size: 13px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  show(message, options = {}) {
    const {
      title = 'エラーが発生しました',
      type = 'error', // error, warning, info, success
      duration = 5000,
      persistent = false
    } = options;

    // 最大通知数を超える場合は古いものを削除
    if (this.activeNotifications.size >= this.maxNotifications) {
      const oldest = this.activeNotifications.values().next().value;
      if (oldest) {
        this.hide(oldest);
      }
    }

    const notification = document.createElement('div');
    notification.className = `error-notification ${type}`;
    
    const icon = this.getIcon(type);
    
    notification.innerHTML = `
      <div class="error-title">
        <span class="error-icon">${icon}</span>
        <span>${title}</span>
      </div>
      <div class="error-message">${message}</div>
    `;

    // クリックで閉じる
    notification.addEventListener('click', () => {
      this.hide(notification);
    });

    // 自動で閉じる（persistent でない場合）
    if (!persistent && duration > 0) {
      setTimeout(() => {
        this.hide(notification);
      }, duration);
    }

    this.container.appendChild(notification);
    this.activeNotifications.add(notification);

    // アニメーション開始
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    return notification;
  }

  hide(notification) {
    if (!notification || !notification.parentElement) return;

    notification.classList.add('hide');
    this.activeNotifications.delete(notification);

    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 300);
  }

  getIcon(type) {
    const icons = {
      error: '⚠️',
      warning: '⚡',
      info: 'ℹ️',
      success: '✅'
    };
    return icons[type] || icons.error;
  }

  // Supabase API エラー専用の表示メソッド
  showSupabaseError(error) {
    let title = 'データベース接続エラー';
    let message = error.error || error.message || '不明なエラーが発生しました';
    let type = 'error';

    if (error.errorType) {
      switch (error.errorType) {
        case 'network_error':
          title = 'ネットワークエラー';
          type = 'warning';
          break;
        case 'timeout':
          title = 'タイムアウトエラー';
          type = 'warning';
          break;
        case 'fetch_error':
          title = 'サーバー通信エラー';
          type = 'error';
          break;
        case 'cors_error':
          title = 'セキュリティエラー';
          type = 'error';
          break;
      }
    }

    return this.show(message, { title, type, duration: 8000 });
  }

  // 全ての通知をクリア
  clearAll() {
    this.activeNotifications.forEach(notification => {
      this.hide(notification);
    });
  }
}

// グローバルインスタンス
const errorNotification = new ErrorNotification();

// グローバルアクセス用
if (typeof window !== 'undefined') {
  window.ErrorNotification = errorNotification;
}

export default errorNotification;
