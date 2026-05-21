// logs-main.js - ログ表示システムのメイン処理

import GasAPI from './api.js';
import AdminLayout from './admin/AdminLayout.js';
import fullCapacityMonitor from './full-capacity-monitor.js';


// カスタムダイアログ用ヘルパー
async function customAlert(msg) {
  if (window.CustomDialog) await CustomDialog.alert(msg);
  else window.alert(msg);
}

async function customConfirm(msg) {
  if (window.CustomDialog) return await CustomDialog.confirm(msg);
  return window.confirm(msg);
}


// グローバル変数
let currentLogs = [];
let autoRefreshInterval = null;
let isAutoRefreshEnabled = true;
let lastFullKeySet = new Set();

// Utils
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 初期化
window.onload = async () => {
  try {
    // 0. Initialize Layout and Auth
    if (!AdminLayout.init('logs')) return;

    // グローバル関数を登録（既存定義がある場合は上書きしない）
    window.refreshLogs = refreshLogs;
    window.toggleAutoRefresh = toggleAutoRefresh;
    window.applyFilters = applyFilters;
    window.showLogDetail = showLogDetail;
    window.closeLogDetail = closeLogDetail;
    window.showFullCapacitySettings = showFullCapacitySettings;
    window.closeFullCapacitySettings = closeFullCapacitySettings;
    window.saveFullCapacitySettings = saveFullCapacitySettings;
    window.testFullCapacityNotification = testFullCapacityNotification;
    window.manualFullCapacityCheck = manualFullCapacityCheck;
    window._exportLogsCSV = exportLogsCSV;
    window._clearFilters = clearFilters;

    // 初期データ読み込み
    await loadStatistics();
    await loadLogs();

    // フィルター用の操作一覧を取得
    await loadOperationList();

    // イベントリスナー設定
    setupEventListeners();

    // デフォルトで自動更新をオンにする
    toggleAutoRefresh(true);

    console.log('ログ表示システム初期化完了');

    // 満席監視（30秒毎、ログページのみ）
    try { setInterval(checkFullTimeslotsAndNotify, 30000); } catch (_) { }

    // SWへ最高管理者モード登録（ログ画面はsuperadminのみアクセス想定）
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'REGISTER_SUPERADMIN' });
        // ページ離脱時に解除
        window.addEventListener('beforeunload', () => {
          try { navigator.serviceWorker.controller.postMessage({ type: 'UNREGISTER_SUPERADMIN' }); } catch (_) { }
        });
      }
    } catch (_) { }
  } catch (error) {
    console.error('初期化エラー:', error);
    showError('初期化に失敗しました: ' + error.message);
  }
};

// 満席ブロードキャストを送るヘルパー（任意ページから呼び出し可能）
try {
  window.notifyFullSeats = async (group, day, timeslot) => {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'FULL_ALERT', group, day, timeslot });
      }
    } catch (_) { }
  };
} catch (_) { }

// イベントリスナー設定
function setupEventListeners() {
  // フィルター変更時のイベント（null安全）
  const opFilter = document.getElementById('operation-filter');
  const stFilter = document.getElementById('status-filter');
  const limFilter = document.getElementById('limit-filter');
  if (opFilter) opFilter.addEventListener('change', applyFilters);
  if (stFilter) stFilter.addEventListener('change', applyFilters);
  if (limFilter) limFilter.addEventListener('change', applyFilters);
  const textFilter = document.getElementById('text-filter');
  if (textFilter) textFilter.addEventListener('input', () => updateLogsTable());
  const dateStart = document.getElementById('date-start');
  const dateEnd = document.getElementById('date-end');
  if (dateStart) dateStart.addEventListener('change', () => updateLogsTable());
  if (dateEnd) dateEnd.addEventListener('change', () => updateLogsTable());
  const errToggle = document.getElementById('error-highlight-toggle');
  if (errToggle) errToggle.addEventListener('change', () => updateLogsTable());

  // 自動更新トグルのイベント
  const refreshToggle = document.getElementById('auto-refresh-toggle');
  if (refreshToggle) {
    refreshToggle.addEventListener('change', (e) => {
      toggleAutoRefresh(e.target.checked);
    });
  }

  // モーダル外クリックで閉じる
  const modal = document.getElementById('log-detail-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'log-detail-modal') {
        closeLogDetail();
      }
    });
  }

  // ESCキーでモーダルを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLogDetail();
    }
  });

  // SWからの満席通知を受信
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.type === 'FULL_ALERT') {
          try { showFullAlertBanner(data); } catch (_) { }
        }
      });
    }
  } catch (_) { }
}

async function checkFullTimeslotsAndNotify() {
  try {
    const resp = await GasAPI._callApi('getFullTimeslots', []);
    if (!resp || !resp.success || !Array.isArray(resp.full)) return;
    const current = new Set(resp.full.map(x => `${x.group}|${x.day}|${x.timeslot}`));
    // 新規満席のみ通知
    for (const key of current) {
      if (!lastFullKeySet.has(key)) {
        const [group, day, timeslot] = key.split('|');
        // SWへ自動通知
        try {
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'FULL_ALERT', group, day, timeslot });
          }
        } catch (_) { }
        // ページ内バナーも即時表示
        try { showFullAlertBanner({ group, day, timeslot }); } catch (_) { }
      }
    }
    lastFullKeySet = current;
  } catch (_) { }
}

// 統計情報を読み込み（最適化版）
async function loadStatistics() {
  try {
    console.log('統計情報を読み込み中...');
    const response = await GasAPI._callApi('getClientAuditStatistics', []);

    if (response && response.success) {
      console.log('統計情報取得成功:', response.statistics);
      updateStatistics(response.statistics);

      // 統計情報のキャッシュを更新
      try {
        localStorage.setItem('audit_statistics_cache', JSON.stringify({
          data: response.statistics,
          timestamp: Date.now()
        }));
      } catch (_) { }
    } else {
      console.warn('統計情報の取得に失敗:', response?.message || 'Unknown error');

      // キャッシュから復元を試行
      const cachedStats = getCachedStatistics();
      if (cachedStats) {
        console.log('キャッシュから統計情報を復元');
        updateStatistics(cachedStats);
      } else {
        // デフォルト値を表示
        updateStatistics({
          totalOperations: 0,
          successCount: 0,
          errorCount: 0
        });
      }
    }

    // 満席監視統計も読み込み
    await loadFullCapacityStatistics();

  } catch (error) {
    console.error('統計情報読み込みエラー:', error);

    // キャッシュから復元を試行
    const cachedStats = getCachedStatistics();
    if (cachedStats) {
      console.log('エラー時、キャッシュから統計情報を復元');
      updateStatistics(cachedStats);
    } else {
      // エラー時もデフォルト値を表示
      updateStatistics({
        totalOperations: 0,
        successCount: 0,
        errorCount: 0
      });
    }
  }
}

// 満席監視統計を読み込み
async function loadFullCapacityStatistics() {
  try {
    const response = await GasAPI._callApi('getFullCapacityTimeslots', []);

    if (response && response.success) {
      const summary = response.summary || {};
      updateFullCapacityStatistics(summary);
    } else {
      console.warn('満席監視統計の取得に失敗:', response?.message);
      updateFullCapacityStatistics({ fullCapacity: 0, totalChecked: 0 });
    }
  } catch (error) {
    console.error('満席監視統計読み込みエラー:', error);
    updateFullCapacityStatistics({ fullCapacity: 0, totalChecked: 0 });
  }
}

// 満席監視統計を更新
function updateFullCapacityStatistics(summary) {
  const fullCapacityCard = document.getElementById('full-capacity-card');
  const fullCapacityCount = document.getElementById('full-capacity-count');

  if (fullCapacityCard && fullCapacityCount) {
    const fullCapacity = summary.fullCapacity || 0;
    const totalChecked = summary.totalChecked || 0;

    fullCapacityCount.textContent = `${fullCapacity}/${totalChecked}`;

    // 満席がある場合のみ表示
    if (totalChecked > 0) {
      fullCapacityCard.style.display = 'block';

      // 満席がある場合は警告色
      if (fullCapacity > 0) {
        fullCapacityCard.classList.add('error');
        fullCapacityCount.style.color = '#dc3545';
      } else {
        fullCapacityCard.classList.remove('error');
        fullCapacityCount.style.color = '#28a745';
      }
    } else {
      fullCapacityCard.style.display = 'none';
    }
  }
}

// キャッシュされた統計情報を取得
function getCachedStatistics() {
  try {
    const cached = localStorage.getItem('audit_statistics_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      // 5分以内のキャッシュのみ有効
      if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
        return parsed.data;
      }
    }
  } catch (_) { }
  return null;
}

// 統計情報を更新
function updateStatistics(stats) {
  // 総操作数
  const totalOps = stats.totalOperations || 0;
  const totalEl = document.getElementById('total-operations');
  if (totalEl) totalEl.textContent = totalOps.toLocaleString();

  // 成功数
  const successCount = stats.successCount || 0;
  const successEl = document.getElementById('success-count');
  if (successEl) successEl.textContent = successCount.toLocaleString();

  // エラー数
  const errorCount = stats.errorCount || 0;
  const errorEl = document.getElementById('error-count');
  if (errorEl) errorEl.textContent = errorCount.toLocaleString();

  // 最終更新時刻
  const lastUpdateEl = document.getElementById('last-update');
  if (lastUpdateEl) lastUpdateEl.textContent = new Date().toLocaleTimeString('ja-JP');

  // デバッグ情報をコンソールに出力
  console.log('統計情報更新:', {
    totalOperations: totalOps,
    successCount: successCount,
    errorCount: errorCount,
    successRate: totalOps > 0 ? ((successCount / totalOps) * 100).toFixed(1) + '%' : '0%',
    errorRate: totalOps > 0 ? ((errorCount / totalOps) * 100).toFixed(1) + '%' : '0%'
  });
}

// ログを読み込み
async function loadLogs() {
  try {
    showLoading(true);

    const limit = parseInt(document.getElementById('limit-filter').value) || 100;
    const type = document.getElementById('operation-filter').value || null;
    const status = document.getElementById('status-filter').value || null;
    const response = await GasAPI._callApi('getClientAuditLogs', [limit, type, status]);

    if (response.success) {
      currentLogs = response.logs || [];
      updateLogsTable();
      updateLogsCount();
    } else {
      console.error('ログ取得エラー:', response.message);
      showError('ログの取得に失敗しました: ' + response.message);
    }
  } catch (error) {
    console.error('ログ読み込みエラー:', error);
    showError('ログの読み込みに失敗しました: ' + error.message);
  } finally {
    showLoading(false);
  }
}

// 操作一覧を読み込み（フィルター用）
async function loadOperationList() {
  try {
    const response = await GasAPI._callApi('getOperationLogs', [1000]); // 多めに取得

    if (response.success && response.logs) {
      const operations = [...new Set(response.logs.map(log => log.type))].sort();
      const operationFilter = document.getElementById('operation-filter');

      // 既存のオプションをクリア（"すべて"以外）
      while (operationFilter.children.length > 1) {
        operationFilter.removeChild(operationFilter.lastChild);
      }

      // 操作一覧を追加
      operations.forEach(operation => {
        const option = document.createElement('option');
        option.value = operation;
        option.textContent = operation;
        operationFilter.appendChild(option);
      });
    }
  } catch (error) {
    console.error('操作一覧読み込みエラー:', error);
  }
}

// ログテーブルを更新
function updateLogsTable() {
  const tbody = document.getElementById('logs-table-body');

  const filtered = getFilteredLogs();

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="no-data">ログがありません</td></tr>';
    updateLogsCount();
    return;
  }

  const isHighlightEnabled = (() => { try { return document.getElementById('error-highlight-toggle')?.checked !== false; } catch (_) { return true; } })();

  tbody.innerHTML = filtered.map(log => {
    const timestamp = new Date(log.timestamp).toLocaleString('ja-JP');
    const shortMeta = truncateJson(log.metadata, 80);

    // エラーログかどうかを判定
    const isError = isErrorLog(log);
    const errorLevel = getErrorLevel(log);

    // エラーレベルに応じたクラス設定
    let rowClass = '';
    if (isHighlightEnabled && isError) {
      switch (errorLevel) {
        case 'critical':
          rowClass = 'error-row-critical';
          break;
        case 'timeout':
          rowClass = 'error-row-timeout';
          break;
        case 'network':
          rowClass = 'error-row-network';
          break;
        default:
          rowClass = 'error-row';
      }
    }

    // エラーレベル表示用のアイコン
    let errorIcon = '';
    if (isHighlightEnabled && isError) {
      switch (errorLevel) {
        case 'critical':
          errorIcon = '<span class="error-icon critical" title="致命的エラー">🚨</span>';
          break;
        case 'timeout':
          errorIcon = '<span class="error-icon timeout" title="タイムアウト">⏰</span>';
          break;
        case 'network':
          errorIcon = '<span class="error-icon network" title="ネットワークエラー">🌐</span>';
          break;
        default:
          errorIcon = '<span class="error-icon error" title="エラー">⚠️</span>';
      }
    }

    return `
      <tr class="${rowClass}">
        <td>${escapeHTML(timestamp)}</td>
        <td>${escapeHTML(log.type)}</td>
        <td class="action-cell">${errorIcon}${escapeHTML(log.action)}</td>
        <td style="text-align:center;">
            <button class="detail-btn" onclick="showLogDetail('${escapeHTML(log.timestamp)}')">詳細</button>
        </td>
      </tr>
    `;
  }).join('');

  updateLogsCount();
}

// フィルタリング処理（テキスト/日付）
function getFilteredLogs() {
  const text = (document.getElementById('text-filter')?.value || '').trim().toLowerCase();
  const startStr = document.getElementById('date-start')?.value || '';
  const endStr = document.getElementById('date-end')?.value || '';
  let startTs = null;
  let endTs = null;
  try { if (startStr) { startTs = new Date(startStr + 'T00:00:00').getTime(); } } catch (_) { }
  try { if (endStr) { endTs = new Date(endStr + 'T23:59:59.999').getTime(); } } catch (_) { }

  return currentLogs.filter(log => {
    // 日付範囲
    try {
      const ts = new Date(log.timestamp).getTime();
      if (startTs && ts < startTs) return false;
      if (endTs && ts > endTs) return false;
    } catch (_) { }

    // テキスト検索
    if (text) {
      const haystack = [
        String(log.type || ''),
        String(log.action || ''),
        String(log.sessionId || ''),
        String(log.ipAddress || ''),
        (() => { try { return JSON.stringify(JSON.parse(log.metadata || '{}')); } catch (_) { return String(log.metadata || ''); } })(),
        String(log.userAgent || '')
      ].join(' ').toLowerCase();
      if (!haystack.includes(text)) return false;
    }

    return true;
  });
}

// フィルタークリア
function clearFilters() {
  try { document.getElementById('operation-filter').value = ''; } catch (_) { }
  try { document.getElementById('status-filter').value = ''; } catch (_) { }
  try { document.getElementById('text-filter').value = ''; } catch (_) { }
  try { document.getElementById('date-start').value = ''; } catch (_) { }
  try { document.getElementById('date-end').value = ''; } catch (_) { }
  updateLogsTable();
}

// CSVエクスポート（最適化版）
async function exportLogsCSV() {
  const rows = getFilteredLogs();
  if (!rows || rows.length === 0) {
    await customAlert('エクスポート対象のログがありません');
    return;
  }

  // プログレスバーを表示
  showExportProgress();

  // 非同期でCSV生成（UIブロックを防ぐ）
  setTimeout(async () => {
    try {
      const headers = ['timestamp', 'type', 'action', 'metadata', 'sessionId', 'ipAddress', 'userAgent'];
      const csvRows = [headers.join(',')];

      // バッチ処理でメモリ効率を向上
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const batchCsv = batch.map(r => headers.map(h => {
          let v = r[h];
          if (h === 'metadata') {
            try {
              const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata;
              v = JSON.stringify(meta || {});
            } catch (_) {
              v = String(r.metadata || '');
            }
          }
          if (h === 'timestamp') {
            try {
              v = new Date(r.timestamp).toISOString();
            } catch (_) {
              v = String(r.timestamp || '');
            }
          }
          const s = String(v == null ? '' : v);
          // CSVエスケープ
          const needsQuote = /[",\n\r]/.test(s);
          const esc = s.replace(/"/g, '""');
          return needsQuote ? '"' + esc + '"' : esc;
        }).join(','));

        csvRows.push(...batchCsv);

        // プログレス更新
        updateExportProgress(i + batch.length, rows.length);
      }

      const csv = csvRows.join('\n');

      // BOM付きUTF-8でエンコード（Excel対応）
      const bom = '\uFEFF';
      const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // ファイル名に日時を含める
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 19).replace(/:/g, '-');
      a.download = `audit_logs_${dateStr}.csv`;

      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
        hideExportProgress();
      }, 0);

    } catch (error) {
      console.error('CSVエクスポートエラー:', error);
      await customAlert('CSVエクスポート中にエラーが発生しました: ' + error.message);
      hideExportProgress();
    }
  }, 100);
}

// エクスポート進捗表示
function showExportProgress() {
  const progressContainer = document.getElementById('export-progress-container');
  if (progressContainer) {
    progressContainer.style.display = 'block';
    updateExportProgress(0, 1);
  }
}

// エクスポート進捗更新
function updateExportProgress(current, total) {
  const progressBar = document.getElementById('export-progress-bar');
  const progressText = document.getElementById('export-progress-text');

  if (progressBar) {
    const percentage = Math.round((current / total) * 100);
    progressBar.style.width = percentage + '%';
  }

  if (progressText) {
    progressText.textContent = `エクスポート中... ${current}/${total} (${Math.round((current / total) * 100)}%)`;
  }
}

// エクスポート進捗非表示
function hideExportProgress() {
  const progressContainer = document.getElementById('export-progress-container');
  if (progressContainer) {
    progressContainer.style.display = 'none';
  }
}

// エラーログかどうかを判定（強化版）
function isErrorLog(log) {
  try {
    const metaObj = log.metadata && (typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata);
    
    // Explicit success flag (High priority override)
    if (metaObj && metaObj.success === true) return false;

    // 1. Explicit flag from database (most reliable for recent logs)
    if (log.is_error === true || log.isError === true) return true;

    // 2. Type based (fallback/inclusive)
    if ((log.type || '').toLowerCase().includes('error')) return true;

    // 3. Action based (fallback/inclusive)
    const actionLower = (log.action || '').toLowerCase();
    if (actionLower.includes('error') || actionLower.includes('fail') ||
      actionLower.includes('exception') || actionLower.includes('timeout')) {
      return true;
    }

    // メタデータでの判定
    if (log.metadata && log.metadata !== 'null') {
      const metaObj = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;

      // 明示的なエラーフラグ
      if (metaObj.success === false || metaObj.error || metaObj.failed) {
        return true;
      }

      // エラーメッセージの存在
      if (metaObj.errorMessage || metaObj.errorMsg || metaObj.message) {
        const errorMsg = (metaObj.errorMessage || metaObj.errorMsg || metaObj.message || '').toLowerCase();
        if (errorMsg.includes('error') || errorMsg.includes('fail') ||
          errorMsg.includes('exception') || errorMsg.includes('timeout')) {
          return true;
        }
      }

      // HTTPステータスコードでの判定
      if (metaObj.statusCode && metaObj.statusCode >= 400) {
        return true;
      }

      // レスポンス時間での判定（タイムアウト）
      if (metaObj.responseTime && metaObj.responseTime > 10000) {
        return true;
      }
    }

    // セッションIDが異常な場合
    if (log.sessionId === 'nosession' || !log.sessionId) {
      return true;
    }

    return false;
  } catch (e) {
    // JSON解析エラーの場合はエラーとして扱う
    return true;
  }
}

// エラーレベルの判定
function getErrorLevel(log) {
  try {
    const actionLower = (log.action || '').toLowerCase();

    // 致命的エラー
    if (actionLower.includes('critical') || actionLower.includes('fatal')) {
      return 'critical';
    }

    // タイムアウトエラー
    if (actionLower.includes('timeout')) {
      return 'timeout';
    }

    // ネットワークエラー
    if (actionLower.includes('network') || actionLower.includes('connection')) {
      return 'network';
    }

    // 一般的なエラー
    if (isErrorLog(log)) {
      return 'error';
    }

    return 'normal';
  } catch (e) {
    return 'error';
  }
}

// JSON文字列を短縮
function truncateJson(jsonStr, maxLength) {
  if (!jsonStr || jsonStr === 'null') return '-';

  try {
    const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    const str = JSON.stringify(parsed, null, 2);
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  } catch (e) {
    const fallback = String(jsonStr);
    return fallback.length > maxLength ? fallback.substring(0, maxLength) + '...' : fallback;
  }
}

// ログ件数を更新
function updateLogsCount() {
  const el = document.getElementById('logs-count');
  const filtered = getFilteredLogs();
  const total = filtered.length;

  if (el) el.textContent = `${total}件`;

  // フィルタリングされたログから統計を計算して更新
  const errorCount = filtered.filter(isErrorLog).length;
  const successCount = total - errorCount;

  updateStatistics({
    totalOperations: total,
    successCount: successCount,
    errorCount: errorCount
  });
}

// ログ詳細を表示
function showLogDetail(timestamp) {
  const log = currentLogs.find(l => l.timestamp === timestamp);
  if (!log) return;

  // エラーログかどうかを判定
  const isError = isErrorLog(log);

  // モーダルにデータを設定
  document.getElementById('detail-timestamp').textContent = new Date(log.timestamp).toLocaleString('ja-JP');
  document.getElementById('detail-operation').textContent = `${log.type} / ${log.action}`;

  // ステータス表示
  const statusElement = document.getElementById('detail-status');
  if (isError) {
    statusElement.innerHTML = '<span class="status-error" style="background:#fff5f5; color:#c53030; padding:2px 8px; border-radius:4px; font-weight:600; border:1px solid #feb2b2;">エラー</span>';
  } else {
    statusElement.innerHTML = '<span class="status-success" style="background:#f0fff4; color:#2f855a; padding:2px 8px; border-radius:4px; font-weight:600; border:1px solid #9ae6b4;">成功</span>';
  }

  // エラー解説
  const descElement = document.getElementById('detail-description');
  if (isError) {
    const description = getErrorDescription(log);
    descElement.textContent = description;
    descElement.style.whiteSpace = 'pre-wrap';
    descElement.style.display = 'block';
  } else {
    descElement.style.display = 'none';
  }

  document.getElementById('detail-ip').textContent = log.ipAddress || '-';
  document.getElementById('detail-session').textContent = log.sessionId || '-';

  // JSON表示
  try {
    const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
    document.getElementById('detail-parameters').textContent = JSON.stringify(meta, null, 2);
    
    // 結果表示（メタデータ内にエラーメッセージ等があれば）
    const result = meta.message || meta.error || meta.errorMessage || meta.errorMsg || meta.reason || (isError ? '詳細不明のエラー' : '-');
    let detailText = typeof result === 'object' ? JSON.stringify(result, null, 2) : result;
    
    // stack情報があれば追記
    if (meta.stack) {
        detailText += '\n\n[Stack Trace]\n' + meta.stack;
    }
    // ファイル情報があれば追記
    if (meta.filename) {
        detailText += `\n\n[Source] ${meta.filename}:${meta.lineno || '?'}${meta.colno ? ':' + meta.colno : ''}`;
    }
    
    document.getElementById('detail-result').textContent = detailText;
  } catch (e) {
    document.getElementById('detail-parameters').textContent = String(log.metadata);
    document.getElementById('detail-result').textContent = isError ? 'データ解析エラー' : '-';
  }

  document.getElementById('detail-useragent').textContent = log.userAgent || '-';

  // モーダルを表示
  document.getElementById('log-detail-modal').classList.add('show');
}

// エラー内容に基づいた日本語解説を取得
function getErrorDescription(log) {
    const action = (log.action || '').toLowerCase();
    const type = (log.type || '').toLowerCase();
    
    // メタデータからエラー文字列を抽出
    let errorMsg = '';
    try {
        const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
        if (meta) {
            errorMsg = meta.message || meta.error || meta.errorMessage || meta.errorMsg || meta.reason || '';
            if (typeof errorMsg === 'object') {
                errorMsg = JSON.stringify(errorMsg);
            }
        }
    } catch (e) {
        errorMsg = String(log.metadata || '');
    }
    
    const metaStr = (typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata || {})).toLowerCase();
    const searchStr = `${action} ${type} ${errorMsg.toLowerCase()} ${metaStr}`;

    let category = 'システムエラー';
    let detail = '予期しないエラーが発生しました。システム管理者にメタデータとエラー内容を添えて報告してください。';
    let actionTip = 'しばらく時間をおいて再度お試しいただくか、解決しない場合はシステム管理者にお問い合わせください。';

    // 1. ネットワークエラー
    if (action.includes('fetch') || searchStr.includes('network') || searchStr.includes('failed to fetch') || searchStr.includes('cors')) {
        category = 'ネットワーク通信エラー';
        detail = 'サーバーとの通信に失敗しました。インターネット接続が不安定か、オフライン状態である可能性があります。また、一時的なサーバーの稼働停止やCORSポリシー違反も考えられます。';
        actionTip = '接続状況を確認のうえ、ブラウザをリロード（F5）して再度お試しください。';
    }
    // 2. タイムアウト
    else if (action.includes('timeout') || searchStr.includes('timeout') || searchStr.includes('deadline')) {
        category = '処理タイムアウト';
        detail = 'サーバーからの応答が制限時間内に返ってきませんでした。データ処理量が多すぎるか、サーバー負荷が一時的に高まっています。';
        actionTip = 'しばらく待ってから再度実行してください。処理対象の範囲（件数や期間など）を狭めてお試しいただくと解決する場合があります。';
    }
    // 3. 認証・認可エラー
    else if (searchStr.includes('token') || searchStr.includes('auth') || searchStr.includes('jwt') || searchStr.includes('expired') || searchStr.includes('unauthorized') || searchStr.includes('permission') || searchStr.includes('denied')) {
        category = '認証・権限エラー';
        detail = 'セッションの有効期限が切れたか、この操作を実行する権限がありません。ログイン状態が無効になっている可能性があります。';
        actionTip = '一度ログアウトし、再度ログインし直してから実行してください。それでも解決しない場合は、管理者アカウントの権限設定を確認してください。';
    }
    // 4. 重複エラー / ユニーク制約
    else if (searchStr.includes('duplicate') || searchStr.includes('already exists') || searchStr.includes('unique constraint') || searchStr.includes('pkey') || searchStr.includes('primary key')) {
        category = 'データ重複エラー';
        detail = '既にデータベース内に登録されているデータと競合が発生しました。チケットの重複予約や、同じ識別子（IDなど）での二重登録が疑われます。';
        actionTip = '送信したデータ内容（予約時間、ID等）が既存のものと重複していないか確認してください。画面の表示を更新して最新の状態を確認することをおすすめします。';
    }
    // 5. 行レベルセキュリティ（RLS）違反
    else if (searchStr.includes('rls') || searchStr.includes('row-level security') || searchStr.includes('policy')) {
        category = 'データベースポリシー違反';
        detail = 'Supabase データベースのセキュリティ制御（Row-Level Security Policy）により、該当レコードへの書き込みまたは読み込み操作が拒否されました。';
        actionTip = '現在ログインしているユーザーのロール（管理者、一般ユーザー等）に対して、該当テーブルへの操作ポリシーが正しく設定されているか確認してください。';
    }
    // 6. 満席 / 在庫不足 / キャパシティ超過
    else if (searchStr.includes('full') || searchStr.includes('capacity') || searchStr.includes('sold out') || searchStr.includes('no vacancy') || searchStr.includes('exceeds limit')) {
        category = '予約枠上限超過 (満席)';
        detail = '選択された時間帯またはチケットの予約枠が既に上限（満席）に達しているため、新規の予約・追加登録を行うことができません。';
        actionTip = '予約状況を確認し、他の空いている時間帯を選択するか、管理者画面から該当時間帯の予約上限数（キャパシティ）の枠を広げてください。';
    }
    // 7. 入力値の検証エラー（バリデーション）
    else if (searchStr.includes('validation') || searchStr.includes('invalid') || searchStr.includes('bad request') || searchStr.includes('required') || searchStr.includes('null value') || searchStr.includes('violates not-null')) {
        category = '入力バリデーションエラー';
        detail = '送信されたパラメータの形式が正しくないか、必須項目が入力されていません。データベースの制約（NOT NULL制約など）に違反している可能性があります。';
        actionTip = 'フォームの入力漏れがないか、または日付や数値のフォーマットが適切であるかを確認して再度送信してください。';
    }
    // 8. データベース内リソース未検出（404）
    else if (searchStr.includes('not found') || searchStr.includes('404') || searchStr.includes('no rows')) {
        category = 'データ未検出';
        detail = '操作対象のデータレコードまたはAPIエンドポイントが見つかりませんでした。該当データが既に別の管理者に削除されたか、IDの不整合が考えられます。';
        actionTip = '画面をリフレッシュし、対象のデータがまだ存在しているか確認してください。';
    }
    // 9. GAS側エラー
    else if (searchStr.includes('script error') || searchStr.includes('gas error') || searchStr.includes('google apps script') || type.includes('gas')) {
        category = 'Google Apps Script (GAS) 連携エラー';
        detail = '連携している Google Apps Script バックエンドの実行中にエラーが発生しました。GASの実行数制限（Quota）や、トリガーエラー、スクリプト内の例外処理が考えられます。';
        actionTip = 'Google Apps Script エディタを開き、「実行数」ログから該当するエラーの詳細（スタックトレース等）を確認してください。';
    }
    // 10. フロントエンド例外処理
    else if (action === 'window_error' || type.includes('window') || action === 'promise_rejection') {
        category = 'ブラウザ実行時例外';
        detail = 'ブラウザ上の JavaScript の処理中に、キャッチされなかった例外（バグや互換性問題）が発生しました。';
        actionTip = 'ブラウザのキャッシュをクリアし、ページを再読み込み（Ctrl + F5 / Cmd + Shift + R）してお試しください。解決しない場合は開発コンソール（F12）のログを確認してください。';
    }

    // エラー解説文の構築
    let resultText = `【解説】${category}\n■ 原因：\n${detail}\n\n■ 対処法：\n${actionTip}`;
    
    // 生のエラーメッセージが存在する場合は見やすく追加する
    if (errorMsg) {
        resultText += `\n\n----------------------------------------\n[生のエラー情報]\n${errorMsg}`;
    }
    
    return resultText;
}

// 満席通知のバナー表示
function showFullAlertBanner(data) {
  const el = document.getElementById('full-alert');
  if (!el) return;
  const text = (() => {
    try {
      return `${data.group || ''} ${data.day || ''}-${data.timeslot || ''} が満席になりました`;
    } catch (_) { return '満席通知を受信しました'; }
  })();
  el.textContent = text;
  el.style.display = '';
  // 一定時間後に自動で隠す
  setTimeout(() => { try { el.style.display = 'none'; } catch (_) { } }, 8000);
}

// ログ詳細を閉じる
function closeLogDetail() {
  const modal = document.getElementById('log-detail-modal');
  if (modal) modal.classList.remove('show');
}

// フィルターを適用
async function applyFilters() {
  await loadLogs();
}

// ログを更新
async function refreshLogs() {
  await loadStatistics();
  await loadLogs();
}

// 自動更新を切り替え
function toggleAutoRefresh(enabled) {
  isAutoRefreshEnabled = enabled !== undefined ? enabled : !isAutoRefreshEnabled;
  
  const toggle = document.getElementById('auto-refresh-toggle');
  const statusLabel = document.getElementById('auto-refresh-status');

  if (isAutoRefreshEnabled) {
    if (statusLabel) statusLabel.textContent = 'ON';
    if (toggle) toggle.checked = true;
    
    if (!autoRefreshInterval) {
      autoRefreshInterval = setInterval(refreshLogs, 30000); // 30秒ごと
    }
  } else {
    if (statusLabel) statusLabel.textContent = 'OFF';
    if (toggle) toggle.checked = false;
    
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  }
}

// ローディング表示
function showLoading(show) {
  const loading = document.getElementById('logs-loading');
  if (!loading) return;
  if (show) {
    loading.style.display = 'inline';
  } else {
    loading.style.display = 'none';
  }
}

// エラー表示
async function showError(message) {
  AdminLayout.showError(message);
}

// ページが非表示になったら自動更新を停止
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isAutoRefreshEnabled) {
    // ページが非表示の時は自動更新を一時停止
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  } else if (!document.hidden && isAutoRefreshEnabled) {
    // ページが表示されたら自動更新を再開
    autoRefreshInterval = setInterval(refreshLogs, 30000);
  }
});

// ページ離脱時に自動更新を停止
window.addEventListener('beforeunload', () => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
});

// 満席通知設定モーダルを表示
function showFullCapacitySettings() {
  const modal = document.getElementById('full-capacity-settings-modal');
  if (!modal) return;

  // 現在の設定を読み込み
  const settings = fullCapacityMonitor.getSettings();
  const emailsDisplay = document.getElementById('notification-emails-display');
  if (emailsDisplay) {
    emailsDisplay.textContent = settings.emails ? settings.emails.join('\n') : '設定されていません';
  }
  document.getElementById('notification-enabled').checked = settings.enabled;

  // 監視間隔を設定
  const intervalSelect = document.getElementById('check-interval');
  intervalSelect.value = settings.checkInterval;

  // 現在の状態を表示
  const statusElement = document.getElementById('monitor-status');
  statusElement.textContent = settings.isRunning ? '監視中' : '停止中';
  statusElement.style.color = settings.isRunning ? '#28a745' : '#dc3545';

  modal.classList.add('show');
}

// 満席通知設定モーダルを閉じる
function closeFullCapacitySettings() {
  const modal = document.getElementById('full-capacity-settings-modal');
  if (modal) {
    modal.classList.remove('show');
  }
}

// 満席通知設定を保存
async function saveFullCapacitySettings() {
  const enabled = document.getElementById('notification-enabled').checked;
  const interval = parseInt(document.getElementById('check-interval').value);

  try {
    const success = await fullCapacityMonitor.updateNotificationSettings(enabled);

    if (success) {
      // 監視間隔を更新
      fullCapacityMonitor.setCheckInterval(interval);

      await customAlert('設定を保存しました。');
      closeFullCapacitySettings();

      // 設定に応じて監視を開始/停止
      if (enabled) {
        fullCapacityMonitor.start();
      } else {
        fullCapacityMonitor.stop();
      }
    } else {
      await customAlert('設定の保存に失敗しました。');
    }
  } catch (error) {
    console.error('設定保存エラー:', error);
    await customAlert('設定の保存中にエラーが発生しました: ' + error.message);
  }
}

// テスト通知を送信
async function testFullCapacityNotification() {
  try {
    // ハードコーディングされたメールアドレスを使用
    const hardcodedEmails = [
      'admin@example.com',
      'manager@example.com',
      'staff@example.com'
    ];

    // テスト用の満席データを作成
    const testFullTimeslots = [{
      group: 'テスト公演',
      day: '1',
      timeslot: 'A',
      totalSeats: 50,
      occupiedSeats: 50,
      emptySeats: 0
    }];

    const response = await GasAPI._callApi('sendFullCapacityEmail', [{
      emails: hardcodedEmails,
      fullTimeslots: testFullTimeslots,
      timestamp: new Date().toISOString(),
      isTest: true
    }]);

    if (response && response.success) {
      await customAlert(`テスト通知を送信しました。\n成功: ${response.successCount}件\n失敗: ${response.failureCount}件`);
    } else {
      await customAlert('テスト通知の送信に失敗しました: ' + (response?.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('テスト通知エラー:', error);
    await customAlert('テスト通知中にエラーが発生しました: ' + error.message);
  }
}

// 手動で満席チェック
async function manualFullCapacityCheck() {
  try {
    await fullCapacityMonitor.manualCheck();
    await customAlert('手動チェックを実行しました。');
  } catch (error) {
    console.error('手動チェックエラー:', error);
    await customAlert('手動チェック中にエラーが発生しました: ' + error.message);
  }
}
