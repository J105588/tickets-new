/**
 * Triggers.gs
 * 定期実行タスクの定義
 */

/**
 * 毎日深夜に実行することを想定したメンテナンス処理
 * 1. 古い監査ログの削除 (MissingFunctions.gs)
 */
function dailySystemMaintenance() {
  console.log('Starting daily system maintenance...');
  
  // 1. ログローテーション (デフォルト90日保持)
  try {
    if (typeof purgeOldAuditLogs === 'function') {
      purgeOldAuditLogs(90);
    }
  } catch (e) {
    console.error('Daily log purge failed:', e);
  }
  
  console.log('Daily system maintenance completed.');
}

/**
 * トリガー設定の案内
 * 手動で実行してトリガーを作成するためのヘルパー
 */
function setupMaintenanceTrigger() {
  // 既存の同名トリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'dailySystemMaintenance') {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // 毎日午前2時〜3時に実行
  ScriptApp.newTrigger('dailySystemMaintenance')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
    
  console.log('Scheduled maintenance trigger has been set (Daily at 2:00-3:00 AM).');
}
