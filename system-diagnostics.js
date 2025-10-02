// system-diagnostics.js - システム全体の診断とヘルスチェック

class SystemDiagnostics {
  constructor() {
    this.diagnosticResults = {};
    this.lastDiagnosticTime = 0;
  }

  // システム全体の診断を実行
  async runFullDiagnostics() {
    console.log('[SystemDiagnostics] Starting full system diagnostics...');
    
    const startTime = Date.now();
    const results = {
      timestamp: new Date().toISOString(),
      overall: 'unknown',
      components: {},
      issues: [],
      recommendations: []
    };

    try {
      // 1. API統合の診断
      results.components.api = await this.diagnoseAPIIntegration();
      
      // 2. データベース接続の診断
      results.components.database = await this.diagnoseDatabaseConnections();
      
      // 3. フォールバック機構の診断
      results.components.fallback = await this.diagnoseFallbackSystems();
      
      // 4. オフライン同期の診断
      results.components.offlineSync = await this.diagnoseOfflineSync();
      
      // 5. エラーハンドリングの診断
      results.components.errorHandling = await this.diagnoseErrorHandling();
      
      // 6. ネットワーク状態の診断
      results.components.network = await this.diagnoseNetworkStatus();
      
      // 7. キャッシュシステムの診断
      results.components.cache = await this.diagnoseCacheSystem();

      // 全体的な健全性を評価
      results.overall = this.evaluateOverallHealth(results.components);
      
      // 問題と推奨事項を生成
      this.generateIssuesAndRecommendations(results);
      
      const duration = Date.now() - startTime;
      console.log(`[SystemDiagnostics] Diagnostics completed in ${duration}ms`);
      
      this.diagnosticResults = results;
      this.lastDiagnosticTime = Date.now();
      
      return results;
      
    } catch (error) {
      console.error('[SystemDiagnostics] Diagnostic failed:', error);
      results.overall = 'error';
      results.issues.push(`診断中にエラーが発生しました: ${error.message}`);
      return results;
    }
  }

  // API統合の診断
  async diagnoseAPIIntegration() {
    const result = { status: 'unknown', details: {}, issues: [] };
    
    try {
      // GasAPI の存在確認
      if (typeof window !== 'undefined' && window.GasAPI) {
        result.details.gasAPI = 'available';
      } else {
        result.details.gasAPI = 'missing';
        result.issues.push('GasAPI が利用できません');
      }
      
      // SupabaseAPI の存在確認
      if (typeof window !== 'undefined' && window.supabaseAPI) {
        result.details.supabaseAPI = 'available';
        
        // Supabase設定の確認
        if (window.supabaseAPI.url && window.supabaseAPI.anonKey) {
          result.details.supabaseConfig = 'configured';
        } else {
          result.details.supabaseConfig = 'incomplete';
          result.issues.push('Supabase設定が不完全です');
        }
      } else {
        result.details.supabaseAPI = 'missing';
        result.issues.push('SupabaseAPI が利用できません');
      }
      
      // API統合の整合性チェック
      if (result.details.gasAPI === 'available' && result.details.supabaseAPI === 'available') {
        result.status = 'healthy';
      } else {
        result.status = 'degraded';
      }
      
    } catch (error) {
      result.status = 'error';
      result.issues.push(`API統合診断エラー: ${error.message}`);
    }
    
    return result;
  }

  // データベース接続の診断
  async diagnoseDatabaseConnections() {
    const result = { status: 'unknown', details: {}, issues: [] };
    
    try {
      // Supabase接続テスト
      if (typeof window !== 'undefined' && window.supabaseAPI) {
        try {
          const connectionTest = await window.supabaseAPI._testConnection();
          result.details.supabaseConnection = connectionTest ? 'connected' : 'disconnected';
          
          if (!connectionTest) {
            result.issues.push('Supabaseサーバーに接続できません');
          }
        } catch (error) {
          result.details.supabaseConnection = 'error';
          result.issues.push(`Supabase接続テストエラー: ${error.message}`);
        }
      }
      
      // GAS接続テスト（簡易）
      if (typeof window !== 'undefined' && window.GasAPI) {
        result.details.gasConnection = 'available';
      } else {
        result.details.gasConnection = 'unavailable';
      }
      
      result.status = result.issues.length === 0 ? 'healthy' : 'degraded';
      
    } catch (error) {
      result.status = 'error';
      result.issues.push(`データベース診断エラー: ${error.message}`);
    }
    
    return result;
  }

  // フォールバック機構の診断
  async diagnoseFallbackSystems() {
    const result = { status: 'unknown', details: {}, issues: [] };
    
    try {
      // フォールバックマネージャーの確認
      if (typeof window !== 'undefined' && window.FallbackManager) {
        result.details.fallbackManager = 'available';
        
        const stats = window.FallbackManager.getStats();
        result.details.fallbackStats = stats;
        
        if (stats.fallbackRate && parseFloat(stats.fallbackRate) > 50) {
          result.issues.push(`フォールバック使用率が高すぎます: ${stats.fallbackRate}`);
        }
      } else {
        result.details.fallbackManager = 'missing';
        result.issues.push('フォールバックマネージャーが利用できません');
      }
      
      // 接続復旧システムの確認
      if (typeof window !== 'undefined' && window.ConnectionRecovery) {
        result.details.connectionRecovery = 'available';
        
        const status = window.ConnectionRecovery.getConnectionStatus();
        result.details.connectionStatus = status;
        
        if (!status.isOnline) {
          result.issues.push('ネットワーク接続が切断されています');
        }
      } else {
        result.details.connectionRecovery = 'missing';
        result.issues.push('接続復旧システムが利用できません');
      }
      
      result.status = result.issues.length === 0 ? 'healthy' : 'degraded';
      
    } catch (error) {
      result.status = 'error';
      result.issues.push(`フォールバック診断エラー: ${error.message}`);
    }
    
    return result;
  }

  // オフライン同期の診断
  async diagnoseOfflineSync() {
    const result = { status: 'unknown', details: {}, issues: [] };
    
    try {
      if (typeof window !== 'undefined' && window.OfflineSyncV2) {
        result.details.offlineSync = 'available';
        
        // 同期状態の確認
        const syncState = window.OfflineSyncV2.syncState || {};
        result.details.syncState = {
          isOnline: window.OfflineSyncV2.isOnline,
          syncInProgress: window.OfflineSyncV2.syncInProgress,
          queueLength: syncState.operationQueue?.length || 0
        };
        
        if (result.details.syncState.queueLength > 10) {
          result.issues.push(`オフライン操作キューが大きすぎます: ${result.details.syncState.queueLength}件`);
        }
      } else {
        result.details.offlineSync = 'missing';
        result.issues.push('オフライン同期システムが利用できません');
      }
      
      result.status = result.issues.length === 0 ? 'healthy' : 'degraded';
      
    } catch (error) {
      result.status = 'error';
      result.issues.push(`オフライン同期診断エラー: ${error.message}`);
    }
    
    return result;
  }

  // エラーハンドリングの診断
  async diagnoseErrorHandling() {
    const result = { status: 'unknown', details: {}, issues: [] };
    
    try {
      // エラー通知システムの確認
      if (typeof window !== 'undefined' && window.ErrorNotification) {
        result.details.errorNotification = 'available';
        
        const activeNotifications = window.ErrorNotification.activeNotifications?.size || 0;
        result.details.activeNotifications = activeNotifications;
        
        if (activeNotifications > 5) {
          result.issues.push(`アクティブなエラー通知が多すぎます: ${activeNotifications}件`);
        }
      } else {
        result.details.errorNotification = 'missing';
        result.issues.push('エラー通知システムが利用できません');
      }
      
      result.status = result.issues.length === 0 ? 'healthy' : 'warning';
      
    } catch (error) {
      result.status = 'error';
      result.issues.push(`エラーハンドリング診断エラー: ${error.message}`);
    }
    
    return result;
  }

  // ネットワーク状態の診断
  async diagnoseNetworkStatus() {
    const result = { status: 'unknown', details: {}, issues: [] };
    
    try {
      if (typeof navigator !== 'undefined') {
        result.details.navigatorOnline = navigator.onLine;
        result.details.connection = navigator.connection ? {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink,
          rtt: navigator.connection.rtt
        } : 'unavailable';
        
        if (!navigator.onLine) {
          result.issues.push('ネットワーク接続がオフラインです');
        }
        
        if (navigator.connection && navigator.connection.effectiveType === 'slow-2g') {
          result.issues.push('ネットワーク接続が非常に遅いです');
        }
      }
      
      result.status = result.issues.length === 0 ? 'healthy' : 'warning';
      
    } catch (error) {
      result.status = 'error';
      result.issues.push(`ネットワーク診断エラー: ${error.message}`);
    }
    
    return result;
  }

  // キャッシュシステムの診断
  async diagnoseCacheSystem() {
    const result = { status: 'unknown', details: {}, issues: [] };
    
    try {
      // Service Worker の確認
      if ('serviceWorker' in navigator) {
        result.details.serviceWorker = 'supported';
        
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          result.details.swRegistration = 'active';
          result.details.swState = registration.active?.state || 'unknown';
        } else {
          result.details.swRegistration = 'inactive';
          result.issues.push('Service Workerが登録されていません');
        }
      } else {
        result.details.serviceWorker = 'unsupported';
        result.issues.push('Service Workerがサポートされていません');
      }
      
      // Cache API の確認
      if ('caches' in window) {
        result.details.cacheAPI = 'supported';
        
        try {
          const cacheNames = await caches.keys();
          result.details.cacheNames = cacheNames;
          result.details.cacheCount = cacheNames.length;
        } catch (error) {
          result.issues.push(`キャッシュ情報の取得に失敗: ${error.message}`);
        }
      } else {
        result.details.cacheAPI = 'unsupported';
        result.issues.push('Cache APIがサポートされていません');
      }
      
      result.status = result.issues.length === 0 ? 'healthy' : 'warning';
      
    } catch (error) {
      result.status = 'error';
      result.issues.push(`キャッシュ診断エラー: ${error.message}`);
    }
    
    return result;
  }

  // 全体的な健全性を評価
  evaluateOverallHealth(components) {
    const statuses = Object.values(components).map(comp => comp.status);
    
    if (statuses.includes('error')) {
      return 'error';
    } else if (statuses.includes('degraded')) {
      return 'degraded';
    } else if (statuses.includes('warning')) {
      return 'warning';
    } else if (statuses.every(status => status === 'healthy')) {
      return 'healthy';
    } else {
      return 'unknown';
    }
  }

  // 問題と推奨事項を生成
  generateIssuesAndRecommendations(results) {
    // 全コンポーネントから問題を収集
    Object.values(results.components).forEach(component => {
      if (component.issues) {
        results.issues.push(...component.issues);
      }
    });

    // 推奨事項を生成
    if (results.overall === 'error') {
      results.recommendations.push('システムに重大な問題があります。技術サポートに連絡してください。');
    } else if (results.overall === 'degraded') {
      results.recommendations.push('システムの一部機能に問題があります。フォールバック機能が動作している可能性があります。');
    } else if (results.overall === 'warning') {
      results.recommendations.push('システムは動作していますが、パフォーマンスに影響する問題があります。');
    } else if (results.overall === 'healthy') {
      results.recommendations.push('システムは正常に動作しています。');
    }

    // 具体的な推奨事項
    if (results.components.database?.details?.supabaseConnection === 'disconnected') {
      results.recommendations.push('Supabaseサーバーへの接続を確認してください。');
    }
    
    if (results.components.network?.details?.navigatorOnline === false) {
      results.recommendations.push('インターネット接続を確認してください。');
    }
  }

  // 診断結果をコンソールに表示
  displayResults(results = this.diagnosticResults) {
    if (!results) {
      console.log('[SystemDiagnostics] No diagnostic results available. Run runFullDiagnostics() first.');
      return;
    }

    console.group('🔍 System Diagnostics Results');
    console.log(`Overall Status: ${this.getStatusEmoji(results.overall)} ${results.overall.toUpperCase()}`);
    console.log(`Timestamp: ${results.timestamp}`);
    
    console.group('📊 Component Status');
    Object.entries(results.components).forEach(([name, component]) => {
      console.log(`${this.getStatusEmoji(component.status)} ${name}: ${component.status}`);
      if (component.issues.length > 0) {
        console.group('Issues:');
        component.issues.forEach(issue => console.warn(`⚠️ ${issue}`));
        console.groupEnd();
      }
    });
    console.groupEnd();

    if (results.issues.length > 0) {
      console.group('🚨 System Issues');
      results.issues.forEach(issue => console.warn(`⚠️ ${issue}`));
      console.groupEnd();
    }

    if (results.recommendations.length > 0) {
      console.group('💡 Recommendations');
      results.recommendations.forEach(rec => console.info(`💡 ${rec}`));
      console.groupEnd();
    }

    console.groupEnd();
  }

  // ステータス絵文字を取得
  getStatusEmoji(status) {
    switch (status) {
      case 'healthy': return '✅';
      case 'warning': return '⚠️';
      case 'degraded': return '🟡';
      case 'error': return '❌';
      default: return '❓';
    }
  }

  // 最後の診断結果を取得
  getLastResults() {
    return this.diagnosticResults;
  }

  // 診断が必要かどうかを判定
  needsDiagnostics() {
    const fiveMinutes = 5 * 60 * 1000;
    return Date.now() - this.lastDiagnosticTime > fiveMinutes;
  }
}

// グローバルインスタンス
const systemDiagnostics = new SystemDiagnostics();

// グローバルアクセス用
if (typeof window !== 'undefined') {
  window.SystemDiagnostics = systemDiagnostics;
  
  // コンソールコマンド
  window.SeatApp = window.SeatApp || {};
  window.SeatApp.diagnostics = {
    run: () => systemDiagnostics.runFullDiagnostics(),
    show: () => systemDiagnostics.displayResults(),
    results: () => systemDiagnostics.getLastResults(),
    quick: async () => {
      const results = await systemDiagnostics.runFullDiagnostics();
      systemDiagnostics.displayResults(results);
      return results;
    }
  };
}

export default systemDiagnostics;
