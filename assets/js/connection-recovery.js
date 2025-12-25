// connection-recovery.js - 接続復旧とオフライン対応システム

class ConnectionRecoveryManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.pendingOperations = [];
    this.isRecovering = false;
    
    this.init();
  }

  init() {
    // ネットワーク状態の監視
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    // 定期的な接続チェック
    setInterval(() => this.checkConnection(), 30000);
    
    // ページの可視性変更時の処理
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.isOnline) {
        this.attemptReconnection();
      }
    });
  }

  handleOnline() {
    console.log('[ConnectionRecovery] ネットワーク接続が復旧しました');
    this.isOnline = true;
    this.reconnectAttempts = 0;
    
    // 保留中の操作を実行
    this.processPendingOperations();
    
    // 成功通知
    if (window.ErrorNotification) {
      window.ErrorNotification.show('インターネット接続が復旧しました', {
        title: '接続復旧',
        type: 'success',
        duration: 3000
      });
    }
  }

  handleOffline() {
    console.log('[ConnectionRecovery] ネットワーク接続が切断されました');
    this.isOnline = false;
    
    // オフライン通知
    if (window.ErrorNotification) {
      window.ErrorNotification.show('インターネット接続が切断されました。自動的に再接続を試行します。', {
        title: 'オフライン',
        type: 'warning',
        duration: 5000
      });
    }
    
    // 再接続を開始
    this.attemptReconnection();
  }

  async checkConnection() {
    if (this.isOnline) return true;
    
    try {
      // 軽量なリクエストで接続をテスト
      const response = await fetch('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok || response.status === 404) {
        if (!this.isOnline) {
          this.handleOnline();
        }
        return true;
      }
    } catch (error) {
      if (this.isOnline) {
        this.handleOffline();
      }
    }
    
    return false;
  }

  async attemptReconnection() {
    if (this.isRecovering) return;
    
    this.isRecovering = true;
    
    while (this.reconnectAttempts < this.maxReconnectAttempts && !this.isOnline) {
      this.reconnectAttempts++;
      
      console.log(`[ConnectionRecovery] 再接続試行 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      const isConnected = await this.checkConnection();
      
      if (isConnected) {
        this.isRecovering = false;
        return true;
      }
      
      // 指数バックオフで待機時間を増加
      const delay = Math.min(
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
        this.maxReconnectDelay
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.isRecovering = false;
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[ConnectionRecovery] 最大再接続試行回数に達しました');
      
      if (window.ErrorNotification) {
        window.ErrorNotification.show(
          '接続の復旧に失敗しました。ネットワーク設定を確認してページを再読み込みしてください。',
          {
            title: '接続失敗',
            type: 'error',
            persistent: true
          }
        );
      }
    }
    
    return false;
  }

  // 操作を保留キューに追加
  queueOperation(operation) {
    this.pendingOperations.push({
      ...operation,
      timestamp: Date.now(),
      attempts: 0
    });
    
    console.log(`[ConnectionRecovery] 操作をキューに追加: ${operation.type}`);
  }

  // 保留中の操作を処理
  async processPendingOperations() {
    if (this.pendingOperations.length === 0) return;
    
    console.log(`[ConnectionRecovery] ${this.pendingOperations.length}件の保留操作を処理中...`);
    
    const operations = [...this.pendingOperations];
    this.pendingOperations = [];
    
    for (const operation of operations) {
      try {
        operation.attempts++;
        
        // 操作が古すぎる場合はスキップ（5分以上）
        if (Date.now() - operation.timestamp > 300000) {
          console.warn('[ConnectionRecovery] 古い操作をスキップ:', operation.type);
          continue;
        }
        
        // 操作を実行
        await this.executeOperation(operation);
        
        console.log(`[ConnectionRecovery] 操作完了: ${operation.type}`);
        
      } catch (error) {
        console.error(`[ConnectionRecovery] 操作失敗: ${operation.type}`, error);
        
        // 再試行回数が少ない場合は再度キューに追加
        if (operation.attempts < 3) {
          this.pendingOperations.push(operation);
        }
      }
    }
    
    if (this.pendingOperations.length > 0) {
      console.log(`[ConnectionRecovery] ${this.pendingOperations.length}件の操作が再試行待ち`);
    }
  }

  // 操作を実行
  async executeOperation(operation) {
    switch (operation.type) {
      case 'updateSeat':
        return await GasAPI.updateSeatData(
          operation.group,
          operation.day,
          operation.timeslot,
          operation.seatId,
          operation.columnC,
          operation.columnD,
          operation.columnE
        );
      
      case 'reserveSeats':
        return await GasAPI.reserveSeats(
          operation.group,
          operation.day,
          operation.timeslot,
          operation.selectedSeats,
          operation.reservedBy
        );
      
      case 'checkInSeats':
        return await GasAPI.checkInSeats(
          operation.group,
          operation.day,
          operation.timeslot,
          operation.seatIds
        );
      
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  // 接続状態を取得
  getConnectionStatus() {
    return {
      isOnline: this.isOnline,
      reconnectAttempts: this.reconnectAttempts,
      pendingOperations: this.pendingOperations.length,
      isRecovering: this.isRecovering
    };
  }

  // 保留操作をクリア
  clearPendingOperations() {
    this.pendingOperations = [];
    console.log('[ConnectionRecovery] 保留操作をクリアしました');
  }
}

// グローバルインスタンス
const connectionRecovery = new ConnectionRecoveryManager();

// グローバルアクセス用
if (typeof window !== 'undefined') {
  window.ConnectionRecovery = connectionRecovery;
}

export default connectionRecovery;
