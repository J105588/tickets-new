// supabase-config.js
// Supabase設定ファイル

// Supabase設定
const SUPABASE_CONFIG = {
  // SupabaseプロジェクトのURL
  url: 'https://dsmnqpcizmudfkfitrfg.supabase.co',
  
  // Supabase匿名キー
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzbW5xcGNpem11ZGZrZml0cmZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5ODc3OTksImV4cCI6MjA3NDU2Mzc5OX0.0BBCmyV_IrZBch-hvPgW5HuG6-zgE7T1Hdvl7a-aB7g',
  
  // Supabaseサービスロールキー（管理者用）
  serviceRoleKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzbW5xcGNpem11ZGZrZml0cmZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODk4Nzc5OSwiZXhwIjoyMDc0NTYzNzk5fQ.aZj6ky5KfON2mr-mY6oFAJnSS5htS3fVNvXDJlMKUfI',
  
  // データベース設定
  database: {
    // 接続タイムアウト（ミリ秒）
    connectionTimeout: 30000,
    
    // リトライ設定
    retry: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 5000
    }
  },
  
  // 認証設定
  auth: {
    // セッション有効期限（秒）
    sessionTimeout: 3600,
    
    // リフレッシュトークンの有効期限（秒）
    refreshTokenTimeout: 2592000
  },
  
  // ストレージ設定
  storage: {
    // バケット名
    bucket: 'seat-management',
    
    // ファイルサイズ制限（バイト）
    maxFileSize: 10 * 1024 * 1024, // 10MB
    
    // 許可されるファイルタイプ
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
  },
  
  // リアルタイム設定
  realtime: {
    // 接続タイムアウト（ミリ秒）
    connectionTimeout: 10000,
    
    // ハートビート間隔（ミリ秒）
    heartbeatInterval: 30000
  }
};

// 環境変数の検証
function validateConfig() {
  const required = ['url', 'anonKey'];
  const missing = required.filter(key => !SUPABASE_CONFIG[key] || SUPABASE_CONFIG[key].includes('your-'));
  
  if (missing.length > 0) {
    console.warn('Supabase設定が不完全です。以下の設定を確認してください:', missing);
    return false;
  }
  
  return true;
}

// 設定の取得
function getConfig() {
  return SUPABASE_CONFIG;
}

// 設定の更新
function updateConfig(newConfig) {
  Object.assign(SUPABASE_CONFIG, newConfig);
  return validateConfig();
}

// 設定のリセット
function resetConfig() {
  Object.assign(SUPABASE_CONFIG, {
    url: 'https://your-project.supabase.co',
    anonKey: 'your-anon-key',
    serviceRoleKey: 'your-service-role-key'
  });
}

// 設定のエクスポート
function exportConfig() {
  return {
    url: SUPABASE_CONFIG.url,
    anonKey: SUPABASE_CONFIG.anonKey,
    // セキュリティのため、サービスロールキーは含めない
    database: SUPABASE_CONFIG.database,
    auth: SUPABASE_CONFIG.auth,
    storage: SUPABASE_CONFIG.storage,
    realtime: SUPABASE_CONFIG.realtime
  };
}

// 設定のインポート
function importConfig(config) {
  if (config.url) SUPABASE_CONFIG.url = config.url;
  if (config.anonKey) SUPABASE_CONFIG.anonKey = config.anonKey;
  if (config.serviceRoleKey) SUPABASE_CONFIG.serviceRoleKey = config.serviceRoleKey;
  if (config.database) Object.assign(SUPABASE_CONFIG.database, config.database);
  if (config.auth) Object.assign(SUPABASE_CONFIG.auth, config.auth);
  if (config.storage) Object.assign(SUPABASE_CONFIG.storage, config.storage);
  if (config.realtime) Object.assign(SUPABASE_CONFIG.realtime, config.realtime);
  
  return validateConfig();
}

// 設定の検証
function isConfigValid() {
  return validateConfig();
}

// 設定の詳細情報
function getConfigInfo() {
  return {
    isValid: isConfigValid(),
    url: SUPABASE_CONFIG.url,
    hasAnonKey: !!SUPABASE_CONFIG.anonKey && !SUPABASE_CONFIG.anonKey.includes('your-'),
    hasServiceRoleKey: !!SUPABASE_CONFIG.serviceRoleKey && !SUPABASE_CONFIG.serviceRoleKey.includes('your-'),
    database: SUPABASE_CONFIG.database,
    auth: SUPABASE_CONFIG.auth,
    storage: SUPABASE_CONFIG.storage,
    realtime: SUPABASE_CONFIG.realtime
  };
}

// グローバルアクセス用
if (typeof window !== 'undefined') {
  window.SupabaseConfig = {
    getConfig,
    updateConfig,
    resetConfig,
    exportConfig,
    importConfig,
    isConfigValid,
    getConfigInfo,
    validateConfig
  };
}

// モジュールエクスポート
export {
  SUPABASE_CONFIG,
  getConfig,
  updateConfig,
  resetConfig,
  exportConfig,
  importConfig,
  isConfigValid,
  getConfigInfo,
  validateConfig
};
export default SUPABASE_CONFIG;
