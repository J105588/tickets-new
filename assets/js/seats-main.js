// seats-main.js - 最適化版
import GasAPI from './api.js';
import { loadSidebar, toggleSidebar, showModeChangeModal, applyModeChange, closeModeModal } from './sidebar.js';
import { apiUrlManager, DEBUG_MODE, debugLog, DemoMode } from './config.js';
import uiOptimizer from './ui-optimizer.js';
import { toDisplaySeatId } from './supabase-client.js';

/**
 * 座席選択画面のメイン処理
 */
const urlParams = new URLSearchParams(window.location.search);
const IS_ADMIN = urlParams.get('admin') === 'true';
const rebookId = urlParams.get('rebook');

// --- [NEW] Global App Mode Definition ---
const MODES = {
  NORMAL: 'NORMAL',
  ADMIN_CHECKIN: 'ADMIN_CHECKIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  REBOOK: 'REBOOK',
  WALKIN: 'WALKIN'
};

function determineAppMode() {
  if (rebookId && IS_ADMIN) return MODES.REBOOK; // Rebook takes precedence (must have admin param)
  const current = localStorage.getItem('currentMode');
  if (current === 'superadmin') return MODES.SUPER_ADMIN;
  if (current === 'admin' || IS_ADMIN) return MODES.ADMIN_CHECKIN;
  if (current === 'walkin') return MODES.WALKIN;
  return MODES.NORMAL;
}

const APP_MODE = determineAppMode();
console.log('[App Mode] Determined Mode:', APP_MODE);
// ----------------------------------------

const requestedGroup = urlParams.get('group') || '';
// DEMOモードで許可外の場合ブロックしてリダイレクト (Adminは除外)
if (!IS_ADMIN) {
  DemoMode.guardGroupAccessOrRedirect(requestedGroup, `seats.html ? group = ${encodeURIComponent(DemoMode.demoGroup)}& day=${urlParams.get('day') || '1'}& timeslot=${urlParams.get('timeslot') || 'A'} `);
}
// DEMOモード時は見本演劇を強制 (Adminは除外)
let GROUP = IS_ADMIN ? (requestedGroup || '見本演劇') : DemoMode.enforceGroup(requestedGroup || '見本演劇');
const DAY = urlParams.get('day') || '1';
const TIMESLOT = urlParams.get('timeslot') || 'A';
// const IS_ADMIN = urlParams.get('admin') === 'true'; // Removed duplicate

// ゲネプロモード時の時間帯・グループ偽装
const DISPLAY_TIMESLOT = TIMESLOT; // 表示用の時間帯
const ACTUAL_TIMESLOT = DemoMode.enforceGeneproTimeslot(TIMESLOT); // 実際にAPIで使用する時間帯
const ACTUAL_GROUP = DemoMode.enforceGeneproGroupForAPI(GROUP); // 実際にAPIで使用するグループ

let selectedSeats = [];
let ownSeats = []; // Global store for own seats in rebook mode
let isAutoRefreshEnabled = true;
let autoRefreshInterval = null;
let lastUpdateTime = null;
let isRefreshing = false;
let settingsOpen = false;
let isUserInteracting = false; // ユーザーが操作中かどうか
let interactionTimeout = null; // 操作終了を検知するためのタイマー

// APIエンドポイントを設定
const apiEndpoint = apiUrlManager.getCurrentUrl();
// OptimizedGasAPIはstaticメソッドを使用するため、インスタンス化は不要

// 初期化
window.onload = async () => {
  loadSidebar();

  // DEMO/ゲネプロモードアクティブ時に通知
  try {
    if (DemoMode.isActive() || DemoMode.isGeneproActive()) {
      DemoMode.showNotificationIfNeeded();
    }
  } catch (_) { }

  // オフライン状態インジケーターの初期化
  initializeOfflineIndicator();

  const groupName = isNaN(parseInt(GROUP)) ? GROUP : GROUP + '組';
  const performanceInfo = document.getElementById('performance-info');
  if (performanceInfo) {
    // ゲネプロモード時は表示用の時間帯を使用
    const displayTimeslot = DemoMode.isGeneproActive() ? DISPLAY_TIMESLOT : TIMESLOT;
    performanceInfo.textContent = `${groupName} ${DAY}日目 ${displayTimeslot} `;
  }

  // Mode-based UI Control (Strict Redesign)
  const adminIndicator = document.getElementById('admin-indicator');
  const superAdminIndicator = document.getElementById('superadmin-indicator');
  const adminLoginBtn = document.getElementById('admin-login-btn');
  const submitButton = document.getElementById('submit-button');
  const checkInSelectedBtn = document.getElementById('check-in-selected-btn');
  const walkinButton = document.getElementById('walkin-button');

  // Reset all first
  if (adminIndicator) adminIndicator.style.display = 'none';
  if (superAdminIndicator) superAdminIndicator.style.display = 'none';
  if (adminLoginBtn) adminLoginBtn.style.display = 'none';
  if (submitButton) submitButton.style.display = 'none';
  if (checkInSelectedBtn) checkInSelectedBtn.style.display = 'none';
  if (walkinButton) walkinButton.style.display = 'none';

  switch (APP_MODE) {
    case MODES.SUPER_ADMIN:
      if (superAdminIndicator) superAdminIndicator.style.display = 'block';
      if (walkinButton) walkinButton.style.display = 'block';
      break;

    case MODES.ADMIN_CHECKIN:
      if (adminIndicator) adminIndicator.style.display = 'block';
      if (checkInSelectedBtn) checkInSelectedBtn.style.display = 'block';
      break;

    case MODES.REBOOK:
      // Rebook: Needs Submit Button (for saving), Hides Check-in UI
      if (submitButton) {
        submitButton.style.display = 'block';
        submitButton.textContent = '変更を保存';
        submitButton.style.backgroundColor = '#f59e0b'; // Orange
      }
      // Hide admin indicators to avoid confusion, or keep simple one? 
      // User wants clean UI. Hiding admin specific widgets.
      break;

    case MODES.WALKIN:
      // Walkin specific UI if any
      break;

    case MODES.NORMAL:
    default:
      // Normal user booking
      if (adminLoginBtn) adminLoginBtn.style.display = 'block';
      if (submitButton) submitButton.style.display = 'block';
      break;
  }


  showLoader(true);

  try {
    // URL変更をチェック
    checkForUrlChange();

    // 現在のモードを取得して管理者権限を判定
    const currentMode = localStorage.getItem('currentMode') || 'normal';
    const isAdminMode = currentMode === 'admin' || IS_ADMIN;
    const isSuperAdminMode = currentMode === 'superadmin';

    // オフライン時はキャッシュから復元（サーバーへ取りに行かない）
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const cached = (window.readCache ? window.readCache(GROUP, DAY, TIMESLOT) : null);
      if (cached && cached.seatMap) {
        console.log('[Offline] キャッシュから座席データを復元:', {
          seatCount: Object.keys(cached.seatMap).length,
          cacheAge: cached.cachedAt ? Math.round((Date.now() - cached.cachedAt) / 1000) + '秒前' : '不明'
        });

        // オフライン時の座席データ復元強化
        const restoredSeatMap = {};
        Object.entries(cached.seatMap).forEach(([seatId, seatData]) => {
          if (seatData && typeof seatData === 'object') {
            restoredSeatMap[seatId] = {
              id: seatId,
              status: seatData.status || 'available',
              name: seatData.name || null,
              offlineRestored: true, // オフライン復元フラグ
              ...seatData
            };
          }
        });

        if (Object.keys(restoredSeatMap).length > 0) {
          console.log('[Offline] 座席データ復元完了:', Object.keys(restoredSeatMap).length + '席');
          drawSeatMap(restoredSeatMap);
          updateLastUpdateTime();

          // オフライン復元通知を表示
          showOfflineRestoreNotification(Object.keys(restoredSeatMap).length);

          const toggleCheckbox = document.getElementById('auto-refresh-toggle-checkbox');
          if (toggleCheckbox) {
            toggleCheckbox.checked = isAutoRefreshEnabled;
            toggleCheckbox.addEventListener('change', toggleAutoRefresh);
          }
          startAutoRefresh();
          return;
        }
      }
      // キャッシュがない場合のみ以降の処理に進む
    }

    console.log('GasAPI.getSeatData呼び出し:', { GROUP: ACTUAL_GROUP, DAY, TIMESLOT: ACTUAL_TIMESLOT, isAdminMode, isSuperAdminMode });
    const seatData = await GasAPI.getSeatData(ACTUAL_GROUP, DAY, ACTUAL_TIMESLOT, isAdminMode, isSuperAdminMode);

    // 詳細なデバッグ情報をコンソールに出力
    console.log("===== 座席データ詳細情報 =====");
    console.log("Received seatData:", seatData);

    if (seatData.seatMap) {
      // Rebook Mode: Identify and pre-select own seats (Fundamental Fix v20)
      if (APP_MODE === MODES.REBOOK) {
        console.log('[Rebook] Starting Fundamental Seat Identification for ID:', rebookId);

        // Always try to fetch fresh booking data to ensure accuracy
        // Strategy: treating Own Seats as "Available" + "Selected" (Yellow)
        // This allows natural Deselect/Select behavior without "Reserved" conflicts.

        const processOwnSeats = (seatIds) => {
          // Deduplicate input immediately
          seatIds = [...new Set(seatIds)];
          console.log('[Rebook] Processing Own Seats:', seatIds);
          const flatIds = [];

          // Normalize inputs first (handle commas)
          seatIds.forEach(id => {
            if (typeof id === 'string' && id.includes(',')) {
              id.split(',').forEach(sub => flatIds.push(sub.trim()));
            } else {
              flatIds.push(id);
            }
          });

          flatIds.forEach(id => {
            // Normalize ID
            const mapId = Object.keys(seatData.seatMap).find(k => String(k).trim() === String(id).trim());
            if (mapId && seatData.seatMap[mapId]) {
              const s = seatData.seatMap[mapId];

              // MUTATION: Force status to available so it behaves like a normal selectable seat
              s._originalStatus = s.status; // Backup
              s.status = 'available';
              s._isOwn = true;

              // Add to selection if not present
              if (!ownSeats.includes(s.id)) ownSeats.push(s.id);
              if (!selectedSeats.includes(s.id)) selectedSeats.push(s.id);
            }
          });
          updateSelectedSeatsDisplay();
        };

        // 1. Try Client Fetch first (Most reliable for "My Booking")
        if (window.SupabaseClient && window.SupabaseClient.getBookingWithSeats) {
          try {
            // Await here works because this is async function
            const res = await window.SupabaseClient.getBookingWithSeats(rebookId);
            if (res.success && res.data && res.data.seats) {
              const ids = res.data.seats.map(i => i.seat_id);
              processOwnSeats(ids);
            } else {
              console.warn('[Rebook] Client fetch failed, falling back to GAS data matching');
              // Fallback to GAS match
              const gasIds = Object.values(seatData.seatMap)
                .filter(s => String(s.reservation_id) === String(rebookId))
                .map(s => s.id);
              processOwnSeats(gasIds);
            }
          } catch (e) {
            console.error('[Rebook] Error fetching booking:', e);
          }
        } else {
          // Fallback if client missing
          const gasIds = Object.values(seatData.seatMap)
            .filter(s => String(s.reservation_id) === String(rebookId))
            .map(s => s.id);
          processOwnSeats(gasIds);
        }
      }

      console.log("座席マップ構造:", Object.keys(seatData.seatMap));
      console.log("座席データサンプル:", Object.values(seatData.seatMap).slice(0, 3));
    } else {
      console.log("座席マップが存在しません");
    }
    console.log("===== 座席データ詳細情報終了 =====");

    // エラーハンドリングの改善
    if (!seatData || seatData.success === false) {
      // オフライン委譲レスポンス: キャッシュから復元
      if (seatData && seatData.offline && seatData.error === 'offline_delegate') {
        const cached = (window.readCache ? window.readCache(GROUP, DAY, TIMESLOT) : null);
        if (cached && cached.seatMap) {
          console.log('[Offline] オフライン委譲検出、キャッシュから座席データを復元');
          drawSeatMap(cached.seatMap);
          updateLastUpdateTime();
          const toggleCheckbox = document.getElementById('auto-refresh-toggle-checkbox');
          if (toggleCheckbox) {
            toggleCheckbox.checked = isAutoRefreshEnabled;
            toggleCheckbox.addEventListener('change', toggleAutoRefresh);
          }
          startAutoRefresh();
          return;
        }
      }
      const errorMsg = seatData?.error || seatData?.message || 'データ読み込みに失敗しました';
      console.error('座席データ読み込み失敗:', errorMsg);

      // エラー表示を改善
      const errorContainer = document.getElementById('error-container');
      const errorMessage = document.getElementById('error-message');
      if (errorContainer && errorMessage) {
        errorMessage.textContent = `データ読み込み失敗: ${errorMsg} `;
        errorContainer.style.display = 'flex';
      } else {
        // エラーコンテナがない場合はアラートで表示
        alert(`座席データの読み込みに失敗しました: ${errorMsg} `);
      }

      // エラー時でも基本的なUIは表示
      showLoader(false);
      return;
    }

    // オンライン取得成功時はキャッシュに保存
    try { if (window.writeCache) { window.writeCache(GROUP, DAY, TIMESLOT, seatData); } } catch (_) { }
    drawSeatMap(seatData.seatMap);
    updateLastUpdateTime();
    updateSelectedSeatsDisplay(); // 初期化時に選択された座席数を更新

    // 自動更新設定の初期化
    const toggleCheckbox = document.getElementById('auto-refresh-toggle-checkbox');
    if (toggleCheckbox) {
      toggleCheckbox.checked = isAutoRefreshEnabled;
      toggleCheckbox.addEventListener('change', toggleAutoRefresh);
    }

    // 最終更新時間の初期表示
    updateLastUpdateTime();

    startAutoRefresh();
  } catch (error) {
    console.error('サーバー通信失敗:', error);

    // エラー表示を改善
    const errorContainer = document.getElementById('error-container');
    const errorMessage = document.getElementById('error-message');
    if (errorContainer && errorMessage) {
      errorMessage.textContent = `サーバー通信失敗: ${error.message} `;
      errorContainer.style.display = 'flex';
    } else {
      // エラーコンテナがない場合はアラートで表示
      alert(`サーバー通信に失敗しました: ${error.message} `);
    }
  } finally {
    showLoader(false);
  }
};

// 最終アップデート時間を取得
function updateLastUpdateTime() {
  lastUpdateTime = new Date();
  const lastUpdateEl = document.getElementById('last-update-display');
  if (lastUpdateEl) {
    lastUpdateEl.textContent = `最終更新: ${lastUpdateTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} `;
  } else {
    console.warn('最終更新時間を表示する要素が見つかりません');
  }
}

// ローダー表示制御
function showLoader(visible) {
  const loader = document.getElementById('loading-modal');
  if (loader) {
    if (visible) {
      loader.classList.add('show');
    } else {
      loader.classList.remove('show');
    }
  }
}

// 座席マップを描画する関数（受信データに基づく動的レイアウト）
function drawSeatMap(seatMap) {
  const container = document.getElementById('seat-map-container');
  if (!container) {
    console.error('座席マップコンテナが見つかりません');
    return;
  }
  container.innerHTML = '';

  // 受信データから座席の行と列を動的に抽出
  // Rebook Mode Mutation: Ensure own seats are always 'available' in the model
  if (APP_MODE === MODES.REBOOK && typeof ownSeats !== 'undefined' && ownSeats.length > 0) {
    ownSeats.forEach(ownId => {
      if (seatMap[ownId]) {
        seatMap[ownId].status = 'available';
        seatMap[ownId]._isOwn = true;
      }
    });
  }

  const seatData = extractSeatLayoutFromData(seatMap);

  const seatSection = document.createElement('div');
  seatSection.className = 'seat-section';

  // 左右に余白を追加して中央基準のスクロールを可能にする（スクロールバー幅を考慮）
  const scrollbarWidth = getScrollbarWidth();
  const viewportWidth = window.innerWidth;
  const containerWidth = container.clientWidth;

  // 左側の余白：座席図の左端がスクロールバーの0位置に来るように調整
  const leftPaddingWidth = Math.max(containerWidth * 0.4, 200); // コンテナ幅の40%または最小200px

  // 右側の余白：左側と同じ幅にして中央配置を維持
  const rightPaddingWidth = leftPaddingWidth;

  const leftPadding = document.createElement('div');
  leftPadding.style.cssText = `
width: ${leftPaddingWidth} px;
min - width: 200px;
height: 1px;
flex - shrink: 0;
`;

  const rightPadding = document.createElement('div');
  rightPadding.style.cssText = `
width: ${rightPaddingWidth} px;
min - width: 200px;
height: 1px;
flex - shrink: 0;
`;

  // 余白を追加
  seatSection.appendChild(leftPadding);

  // 行をソートして描画（A, B, C, D, E, F, G, ...）
  const sortedRows = Object.keys(seatData.rows).sort();

  sortedRows.forEach(rowLabel => {
    const rowEl = document.createElement('div');
    rowEl.className = 'seat-row';

    // 座席番号でソート
    const sortedSeats = seatData.rows[rowLabel].sort((a, b) => a.seatNumber - b.seatNumber);

    sortedSeats.forEach(seat => {
      // 座席要素を作成
      const seatElement = createSeatElement(seat);
      rowEl.appendChild(seatElement);

      // 通路を挿入（13,14の間と25,26の間）
      if (seat.seatNumber === 13) {
        const passage = document.createElement('div');
        passage.className = 'passage vertical-passage';
        passage.textContent = '通路';
        rowEl.appendChild(passage);
      } else if (seat.seatNumber === 25) {
        const passage = document.createElement('div');
        passage.className = 'passage vertical-passage';
        passage.textContent = '通路';
        rowEl.appendChild(passage);
      }
    });

    seatSection.appendChild(rowEl);

    // FとGの間に横の通路を追加
    if (rowLabel === 'F') {
      const horizontalPassage = document.createElement('div');
      horizontalPassage.className = 'horizontal-passage';
      horizontalPassage.textContent = '通路';
      seatSection.appendChild(horizontalPassage);
    }
  });

  // 右側の余白を追加
  seatSection.appendChild(rightPadding);

  container.appendChild(seatSection);

  // ズーム機能を初期化
  initializeZoomControls();

  // カスタムスクロールバーを初期化
  initializeCustomScrollbar();

  // 初期スクロール位置を座席図の左端がスクロールバーの0位置に来るように設定
  setTimeout(() => {
    centerSeatMap();
  }, 100);
}

// スクロールバーの幅を取得する関数
function getScrollbarWidth() {
  // 一時的な要素を作成してスクロールバーの幅を測定
  const outer = document.createElement('div');
  outer.style.visibility = 'hidden';
  outer.style.overflow = 'scroll';
  outer.style.msOverflowStyle = 'scrollbar'; // IE用
  document.body.appendChild(outer);

  const inner = document.createElement('div');
  outer.appendChild(inner);

  const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
  outer.parentNode.removeChild(outer);

  return scrollbarWidth;
}

// 座席図を中央に配置する関数
function centerSeatMap() {
  const container = document.getElementById('seat-map-container');
  if (!container) return;

  const scrollWidth = container.scrollWidth;
  const clientWidth = container.clientWidth;

  if (scrollWidth > clientWidth) {
    // コンテナの中央に配置
    const targetScrollLeft = (scrollWidth - clientWidth) / 2;
    container.scrollLeft = targetScrollLeft;
  }
}

// 受信データから座席レイアウトを抽出する関数
function extractSeatLayoutFromData(seatMap) {
  const rows = {};

  // 座席データを解析して行ごとに整理
  Object.values(seatMap).forEach(seatData => {
    const seatId = seatData.id;
    const rowMatch = seatId.match(/^([A-Z]+)(\d+)$/);

    if (rowMatch) {
      const rowLabel = rowMatch[1];
      const seatNumber = parseInt(rowMatch[2]);

      if (!rows[rowLabel]) {
        rows[rowLabel] = [];
      }

      rows[rowLabel].push({
        id: seatId,
        seatNumber: seatNumber,
        status: (seatData.columnC === '確保' || seatData.status === 'secured') ? 'secured' : seatData.status,
        name: seatData.name,
        columnC: seatData.columnC,
        columnD: seatData.columnD,
        columnE: seatData.columnE,
        _isOwn: seatData._isOwn // Rebook Mode: Add _isOwn flag
      });
    }
  });

  // 各列を座席番号順にソート
  Object.keys(rows).forEach(rowLabel => {
    rows[rowLabel].sort((a, b) => a.seatNumber - b.seatNumber);
  });

  return { rows };
}

// ズーム機能の初期化
function initializeZoomControls() {
  const container = document.getElementById('seat-map-container');
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const zoomResetBtn = document.getElementById('zoom-reset-btn');
  const zoomLevelDisplay = document.getElementById('zoom-level');

  if (!container || !zoomInBtn || !zoomOutBtn || !zoomResetBtn || !zoomLevelDisplay) {
    console.warn('ズームコントロールの要素が見つかりません');
    return;
  }

  // 現在のズームレベル（デフォルト70%）
  let currentZoom = 0.7;
  const minZoom = 0.3;
  const maxZoom = 2.0;
  const zoomStep = 0.1;

  // ズームレベルを更新
  function updateZoom(zoom) {
    currentZoom = Math.max(minZoom, Math.min(maxZoom, zoom));
    container.style.setProperty('--seat-scale', currentZoom);
    zoomLevelDisplay.textContent = Math.round(currentZoom * 100) + '%';

    // ズーム状態のクラスを更新
    container.classList.remove('zoomed-out', 'zoomed', 'zoomed-in');
    if (currentZoom < 0.6) {
      container.classList.add('zoomed-out');
    } else if (currentZoom > 1.0) {
      container.classList.add('zoomed-in');
    } else {
      container.classList.add('zoomed');
    }
  }

  // ボタンイベント
  zoomInBtn.addEventListener('click', () => {
    updateZoom(currentZoom + zoomStep);
  });

  zoomOutBtn.addEventListener('click', () => {
    updateZoom(currentZoom - zoomStep);
  });

  zoomResetBtn.addEventListener('click', () => {
    updateZoom(0.7); // デフォルトに戻す
  });

  // ピンチ操作（タッチデバイス）
  let lastTouchDistance = 0;
  let initialZoom = currentZoom;

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      lastTouchDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      initialZoom = currentZoom;
    }
  });

  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault(); // スクロールを防ぐ

      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );

      if (lastTouchDistance > 0) {
        const scale = currentDistance / lastTouchDistance;
        const newZoom = initialZoom * scale;
        updateZoom(newZoom);
      }
    }
  });

  container.addEventListener('touchend', () => {
    lastTouchDistance = 0;
  });

  // マウスホイールズーム（デスクトップ）
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
    updateZoom(currentZoom + delta);
  });

  // ダブルタップズーム（モバイル）
  let lastTapTime = 0;
  container.addEventListener('touchend', (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;

    if (tapLength < 500 && tapLength > 0) {
      // ダブルタップ検出
      e.preventDefault();
      if (currentZoom < 1.0) {
        updateZoom(1.0); // 100%にズーム
      } else {
        updateZoom(0.7); // デフォルトに戻す
      }
    }
    lastTapTime = currentTime;
  });

  // キーボードショートカット（デスクトップ）
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case '=':
        case '+':
          e.preventDefault();
          updateZoom(currentZoom + zoomStep);
          break;
        case '-':
          e.preventDefault();
          updateZoom(currentZoom - zoomStep);
          break;
        case '0':
          e.preventDefault();
          updateZoom(0.7); // デフォルトに戻す
          break;
      }
    }
  });

  // 初期ズームレベルを設定
  updateZoom(currentZoom);
}

// カスタムスクロールバーの初期化
function initializeCustomScrollbar() {
  const container = document.getElementById('seat-map-container');
  const customScrollbar = document.getElementById('custom-scrollbar');
  const scrollbarThumb = document.getElementById('scrollbar-thumb');

  if (!container || !customScrollbar || !scrollbarThumb) {
    console.warn('カスタムスクロールバーの要素が見つかりません');
    return;
  }

  // スクロール中のみ表示するためのタイマー管理
  let hideTimer = null;
  const HIDE_DELAY_MS = 800; // スクロール停止から非表示までの遅延

  // スクロールバーの表示制御関数
  function showScrollbar() {
    customScrollbar.classList.add('visible');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      customScrollbar.classList.remove('visible');
    }, HIDE_DELAY_MS);
  }

  function hideScrollbar() {
    customScrollbar.classList.remove('visible');
  }

  let isDragging = false;
  let startX = 0;
  let startScrollLeft = 0;

  // スクロールバーの更新（0-100正規化、初期位置50）
  function updateScrollbar() {
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    const scrollLeft = container.scrollLeft;

    if (scrollWidth <= clientWidth) {
      // スクロール不要な場合は非表示
      hideScrollbar();
      return;
    }

    // スクロール発生時は一旦表示
    customScrollbar.style.display = 'block';

    // スクロールバーの幅を計算
    const trackWidth = customScrollbar.offsetWidth;
    const thumbWidth = Math.max(30, (clientWidth / scrollWidth) * trackWidth);
    const maxThumbLeft = trackWidth - thumbWidth;

    // スクロール位置を0-100の範囲に正規化
    const maxScrollLeft = scrollWidth - clientWidth;
    const normalizedScroll = (scrollLeft / maxScrollLeft) * 100; // 0-100の範囲

    // スクロールバーの位置を計算（0-100の範囲をトラック幅にマッピング）
    const thumbLeft = (normalizedScroll / 100) * maxThumbLeft;

    scrollbarThumb.style.width = thumbWidth + 'px';
    scrollbarThumb.style.left = Math.max(0, Math.min(maxThumbLeft, thumbLeft)) + 'px';
  }

  // スクロールバーをクリックした時の処理（0-100正規化）
  customScrollbar.addEventListener('click', (e) => {
    if (e.target === scrollbarThumb) return;

    const trackWidth = customScrollbar.offsetWidth;
    const clickX = e.offsetX;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    const maxScrollLeft = scrollWidth - clientWidth;
    const maxThumbLeft = trackWidth - Math.max(30, (clientWidth / scrollWidth) * trackWidth);

    // クリック位置を0-100の範囲に正規化
    const normalizedClick = (clickX / maxThumbLeft) * 100; // 0-100の範囲
    const scrollLeft = (normalizedClick / 100) * maxScrollLeft;

    container.scrollLeft = Math.max(0, Math.min(maxScrollLeft, scrollLeft));

    // クリック操作時は表示を維持し、少し後に隠す
    showScrollbar();
  });

  // スクロールバーのドラッグ開始
  scrollbarThumb.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startScrollLeft = container.scrollLeft;
    e.preventDefault();
  });

  // ドラッグ中の処理（0-100正規化）
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const trackWidth = customScrollbar.offsetWidth;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    const maxScrollLeft = scrollWidth - clientWidth;
    const maxThumbLeft = trackWidth - Math.max(30, (clientWidth / scrollWidth) * trackWidth);

    // ドラッグ量を0-100の範囲に正規化してスクロール位置に変換
    const normalizedDelta = (deltaX / maxThumbLeft) * 100; // 0-100の範囲
    const scrollDelta = (normalizedDelta / 100) * maxScrollLeft;
    const newScrollLeft = startScrollLeft + scrollDelta;

    container.scrollLeft = Math.max(0, Math.min(maxScrollLeft, newScrollLeft));

    // ドラッグ中は表示
    showScrollbar();
  });

  // ドラッグ終了
  document.addEventListener('mouseup', () => {
    isDragging = false;
    // 少し待って非表示
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      customScrollbar.classList.remove('visible');
    }, HIDE_DELAY_MS);
  });

  // タッチイベント（モバイル対応）
  scrollbarThumb.addEventListener('touchstart', (e) => {
    isDragging = true;
    startX = e.touches[0].clientX;
    startScrollLeft = container.scrollLeft;
    e.preventDefault();
    // タッチ開始で表示
    showScrollbar();
  });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;

    const deltaX = e.touches[0].clientX - startX;
    const trackWidth = customScrollbar.offsetWidth;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    const maxScrollLeft = scrollWidth - clientWidth;
    const maxThumbLeft = trackWidth - Math.max(30, (clientWidth / scrollWidth) * trackWidth);

    // ドラッグ量を0-100の範囲に正規化してスクロール位置に変換
    const normalizedDelta = (deltaX / maxThumbLeft) * 100; // 0-100の範囲
    const scrollDelta = (normalizedDelta / 100) * maxScrollLeft;
    const newScrollLeft = startScrollLeft + scrollDelta;

    container.scrollLeft = Math.max(0, Math.min(maxScrollLeft, newScrollLeft));
    e.preventDefault();
    // タッチ移動中は表示
    showScrollbar();
  });

  document.addEventListener('touchend', () => {
    isDragging = false;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      customScrollbar.classList.remove('visible');
    }, HIDE_DELAY_MS);
  });

  // 座席図のスクロールイベント
  container.addEventListener('scroll', () => {
    // スクロール発生時は表示
    if (container.scrollWidth > container.clientWidth) {
      showScrollbar();
    } else {
      hideScrollbar();
    }
    updateScrollbar();
  });

  // ウィンドウリサイズイベント
  window.addEventListener('resize', () => {
    // リサイズ後に座席図の左端がスクロールバーの0位置に来るように再配置
    setTimeout(() => {
      centerSeatMap();
      updateScrollbar();
    }, 100);
  });

  // 初期位置を座席図の左端がスクロールバーの0位置に来るように設定
  setTimeout(() => {
    centerSeatMap();
    updateScrollbar();
    // 初期表示では非表示
    hideScrollbar();
  }, 100);
}

// 自動更新機能の実装（最適化版）
function startAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  // ユーザーが操作中でない場合のみ自動更新を開始
  if (isAutoRefreshEnabled && isPageVisible && !isUserInteracting) {
    autoRefreshInterval = setInterval(async () => {
      if (isRefreshing || !isPageVisible || isUserInteracting) return; // 操作中は更新しない

      isRefreshing = true;
      try {
        // 現在のモードを取得して管理者権限を判定
        const currentMode = localStorage.getItem('currentMode') || 'normal';
        const isAdminMode = currentMode === 'admin' || IS_ADMIN;
        const isSuperAdminMode = currentMode === 'superadmin';

        // オフライン時はネットワークに行かずキャッシュのみ
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          const cached = (window.readCache ? window.readCache(GROUP, DAY, TIMESLOT) : null);
          if (cached && cached.seatMap) {
            console.log('[Offline] 自動更新でキャッシュから座席データを復元:', {
              seatCount: Object.keys(cached.seatMap).length,
              cacheAge: cached.cachedAt ? Math.round((Date.now() - cached.cachedAt) / 1000) + '秒前' : '不明'
            });

            // オフライン時の座席データ復元強化
            const restoredSeatMap = {};
            Object.entries(cached.seatMap).forEach(([seatId, seatData]) => {
              if (seatData && typeof seatData === 'object') {
                restoredSeatMap[seatId] = {
                  id: seatId,
                  status: seatData.status || 'available',
                  name: seatData.name || null,
                  offlineRestored: true, // オフライン復元フラグ
                  ...seatData
                };
              }
            });

            if (Object.keys(restoredSeatMap).length > 0) {
              updateSeatMapWithMinimalData(restoredSeatMap);
              updateLastUpdateTime();
            }
          }
          return;
        }

        // URL変更をチェック
        checkForUrlChange();

        // 最適化: 通常の自動更新時は最小限のデータを取得
        let seatData;
        if (isAdminMode || isSuperAdminMode) {
          // 管理者モードの場合は完全なデータを取得
          seatData = await GasAPI.getSeatData(ACTUAL_GROUP, DAY, ACTUAL_TIMESLOT, isAdminMode, isSuperAdminMode);
        } else {
          // 通常モードの場合は最小限のデータを取得（高速化）
          seatData = await GasAPI.getSeatDataMinimal(ACTUAL_GROUP, DAY, ACTUAL_TIMESLOT, isAdminMode);
        }

        if (seatData.success) {
          try { if (window.writeCache) { window.writeCache(GROUP, DAY, TIMESLOT, seatData); } } catch (_) { }
          // 最小限データの場合は既存の座席データとマージ
          if (seatData.seatMap && Object.keys(seatData.seatMap).length > 0) {
            // 既存の座席データを保持しつつ、ステータスのみ更新
            updateSeatMapWithMinimalData(seatData.seatMap);
          } else {
            // 完全なデータの場合は通常通り更新
            drawSeatMap(seatData.seatMap);
          }
          updateLastUpdateTime();
        }
      } catch (error) {
        console.error('自動更新エラー:', error);
      } finally {
        isRefreshing = false;
      }
    }, 30000); // 30秒ごとに更新
  }
}

// 最小限データで座席マップを更新する関数
function updateSeatMapWithMinimalData(minimalSeatMap) {
  // 既存の座席要素を取得
  const existingSeats = document.querySelectorAll('.seat');

  existingSeats.forEach(seatEl => {
    const seatId = seatEl.dataset.id;
    const minimalData = minimalSeatMap[seatId];

    if (minimalData) {
      // ステータスのみ更新（色とクラス）
      const currentStatus = seatEl.dataset.status;
      if (currentStatus !== minimalData.status) {
        // ステータスが変更された場合のみ更新
        seatEl.dataset.status = minimalData.status;

        // クラスと色を統一更新
        applySeatStatusClasses(seatEl, minimalData.status);

        // ステータステキストも更新
        updateSeatStatusText(seatEl, minimalData.status);
      }
    }
  });
}

// 完全なデータで座席マップを更新する関数
function updateSeatMapWithCompleteData(completeSeatMap) {
  // 既存の座席要素を取得
  const existingSeats = document.querySelectorAll('.seat');

  existingSeats.forEach(seatEl => {
    const seatId = seatEl.dataset.id;
    const completeData = completeSeatMap[seatId];

    if (completeData) {
      // ステータスが変更された場合のみ更新
      const currentStatus = seatEl.dataset.status;
      if (currentStatus !== completeData.status) {
        // ステータスを更新
        seatEl.dataset.status = completeData.status;

        // クラスと色を統一更新
        applySeatStatusClasses(seatEl, completeData.status);

        // ステータステキストを更新
        updateSeatStatusText(seatEl, completeData.status);
      }

      // 名前を更新（管理者モードと最高管理者モードで表示）
      updateSeatName(seatEl, completeData);

      // その他のデータを更新（最高管理者モード用）
      updateSeatAdditionalData(seatEl, completeData);

      // チェックイン可能フラグを更新
      updateSeatCheckinFlag(seatEl, completeData);
    }
  });
}

// 自動更新の切り替え
function toggleAutoRefresh() {
  isAutoRefreshEnabled = !isAutoRefreshEnabled;
  const toggleBtn = document.getElementById('auto-refresh-toggle-checkbox');

  if (toggleBtn) {
    toggleBtn.checked = isAutoRefreshEnabled;
  }

  if (isAutoRefreshEnabled && isPageVisible) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

// 座席要素を作成する関数
function createSeatElement(seatData) {
  const seat = document.createElement('div');
  // 統一的なクラス適用関数を使用
  applySeatStatusClasses(seat, seatData.status);
  seat.dataset.id = seatData.id;

  // 選択状態の反映
  if (selectedSeats.includes(seatData.id)) {
    if (seatData._isOwn || ownSeats.includes(seatData.id)) {
      seat.classList.add('my-booking'); // Yellow
      seat.classList.add('selected'); // Logic is selected
    } else {
      seat.classList.add('selected'); // Orange
    }
  } else {
    seat.classList.remove('selected');
    seat.classList.remove('my-booking');

    // If it's my seat but unselected, it effectively becomes 'available' (Green) visually
    // Logic: If I drop it, it's green.
    if (seatData._isOwn || ownSeats.includes(seatData.id)) {
      seat.classList.add('available'); // Force available look when deselected
      seat.classList.remove('reserved', 'seat-reserved', 'secured', 'seat-secured'); // Remove reserved look
    }
  }

  // fuck 山田一
  // 座席IDを表示
  const seatIdEl = document.createElement('div');
  seatIdEl.className = 'seat-id';
  seatIdEl.textContent = toDisplaySeatId(seatData.id);
  seat.appendChild(seatIdEl);

  // 管理者モード・最高管理者モードの判定
  const currentMode = localStorage.getItem('currentMode') || 'normal';
  const isAdminMode = currentMode === 'admin' || IS_ADMIN;
  const isSuperAdminMode = currentMode === 'superadmin';

  if (isAdminMode && (seatData.status === 'to-be-checked-in' || seatData.status === 'reserved' || seatData.status === 'secured')) {
    // チェックイン可能な座席を選択可能にする
    seat.classList.add('checkin-selectable');
    seat.dataset.seatName = seatData.name || '';
  }

  // 最高管理者モード用にC、D、E列のデータを保存
  if (seatData.columnC !== undefined) {
    seat.dataset.columnC = seatData.columnC;
  }
  if (seatData.columnD !== undefined) {
    seat.dataset.columnD = seatData.columnD;
  }
  if (seatData.columnE !== undefined) {
    seat.dataset.columnE = seatData.columnE;
  }

  // 名前を表示（管理者モードと最高管理者モードで同じ表示）
  if (seatData.name && seatData.status !== 'available') {
    const nameEl = document.createElement('div');
    nameEl.className = 'seat-name';

    // 名前が長すぎる場合は省略表示
    if (seatData.name.length > 8) {
      nameEl.textContent = seatData.name.substring(0, 8) + '...';
      nameEl.title = seatData.name; // ツールチップで全文表示
    } else {
      nameEl.textContent = seatData.name;
    }
    seat.appendChild(nameEl);
  }

  // クリックイベントの設定
  // Rebook Mode: Allow clicking own-reserved seats
  const isOwnSeat = seatData._isOwn || ownSeats.includes(seatData.id);

  // Interaction Logic:
  // 1. Normal User: Can only click 'available' seats
  // 2. Admin/SuperAdmin: Can click ANY seat (to check-in, edit, or rebook)
  // 3. Rebook Mode: Can click 'available' OR 'own' seats
  let isInteractable = false;

  if (isSuperAdminMode || isAdminMode) {
    isInteractable = true; // Admins can touch everything
  } else {
    isInteractable = seatData.status === 'available';
  }

  // Rebook override
  if (rebookId && isOwnSeat) isInteractable = true;

  if (isInteractable) {
    // Correctly handle cursor and pointer events
    seat.style.cursor = 'pointer';
    if (isOwnSeat) {
      seat.style.pointerEvents = 'auto';
    }
  } else {
    seat.style.pointerEvents = 'none';
  }

  // Single source of truth for click event
  seat.addEventListener('click', (e) => handleSeatClick(seatData, e));
  return seat;
}

// 座席クリック時の処理
// 座席クリック時の処理
function handleSeatClick(seatData, event) {
  // Use Global APP_MODE for routing
  if (APP_MODE === MODES.SUPER_ADMIN) {
    handleSuperAdminSeatClick(seatData, event);
  } else if (APP_MODE === MODES.ADMIN_CHECKIN) {
    handleAdminSeatClick(seatData);
  } else if (APP_MODE === MODES.REBOOK) {
    // Rebook: Treat as Normal (Selection) but with override permissions
    handleNormalSeatClick(seatData);
  } else {
    // Normal / Walkin
    handleNormalSeatClick(seatData);
  }
}

// 最高管理者モードでの座席クリック処理
function handleSuperAdminSeatClick(seatData, event) {
  console.log('[最高管理者] 座席クリック:', seatData);

  // 任意の座席を選択可能
  const seatElement = document.querySelector(`[data-id="${seatData.id}"]`);
  if (!seatElement) {
    console.error('[最高管理者] 座席要素が見つかりません:', seatData.id);
    return;
  }

  // ユーザー操作開始
  startUserInteraction();

  // モーダルは座席クリックでは操作しない（選択を維持）

  const multiSelectKey = event && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey);
  if (multiSelectKey) {
    // トグル選択のみ行い、モーダルは開かない
    seatElement.classList.toggle('selected-for-edit');
    updateBulkEditButtonVisibility();
    return;
  }

  // 単独クリック時の挙動: 既に選択がある場合はトグル追加/削除、選択がない場合は単独選択
  const clickedSelected = seatElement.classList.contains('selected-for-edit');
  const currentSelected = Array.from(document.querySelectorAll('.seat.selected-for-edit'));
  const hasSelection = currentSelected.length > 0;

  if (!hasSelection) {
    // 何も選ばれていない → ドロワーを即座に開く（単独編集）
    console.log('[最高管理者] 単独編集ドロワーを開く:', seatData.id);
    document.querySelectorAll('.seat.selected-for-edit').forEach(seat => seat.classList.remove('selected-for-edit'));
    seatElement.classList.add('selected-for-edit');
    showSeatEditModal(seatData); // ドロワーを表示
  } else {
    // 既に選択がある → トグル追加/削除（マルチ選択モード）
    seatElement.classList.toggle('selected-for-edit');
    console.log('[最高管理者] トグル選択:', seatData.id, '->', !clickedSelected);
  }
  updateBulkEditButtonVisibility();
}

// 一括編集ボタンの表示制御
function updateBulkEditButtonVisibility() {
  const selected = Array.from(document.querySelectorAll('.seat.selected-for-edit'));
  // 既存のフローティングボタンがあれば隠す/削除（移行）
  const legacy = document.getElementById('bulk-seat-edit-btn');
  if (legacy) { legacy.style.display = 'none'; }
  // ヘッダーの編集ボタンを書き換え
  const headerBtn = document.getElementById('walkin-button');
  if (!headerBtn) return;
  if (selected.length >= 2) {
    headerBtn.textContent = '選択座席を一括編集';
  } else {
    headerBtn.textContent = '編集';
  }
}

// 一括編集モーダル
function showBulkSeatEditModal(seatIds) {
  if (!seatIds || seatIds.length < 2) return;
  const modalHTML = `
  < div id = "bulk-seat-edit-modal" class="modal" >
    <div class="modal-content" style="max-width: 520px;">
      <h3>一括編集（${seatIds.length}席）</h3>
      <div class="seat-edit-form">
        <div class="form-group">
          <label for="bulk-column-c">C列: ステータス（空、確保、予約済など）</label>
          <input type="text" id="bulk-column-c" value="" placeholder="例: 予約済">
        </div>
        <div class="form-group">
          <label for="bulk-column-d">D列: 予約名・備考（全席に同じ内容）</label>
          <input type="text" id="bulk-column-d" value="" placeholder="例: 田中太郎">
        </div>
        <div class="form-group">
          <label for="bulk-column-e">E列: チェックイン状態・その他</label>
          <input type="text" id="bulk-column-e" value="" placeholder="例: 済">
        </div>
      </div>
      <div style="font-size:12px;color:#666;margin-top:-8px;">入力した内容が選択された全ての座席に適用されます。</div>
      <div class="modal-buttons">
        <button class="btn-primary" onclick="window.applyBulkSeatEdit()">一括適用</button>
        <button class="btn-secondary" onclick="window.closeBulkSeatEditModal()">キャンセル</button>
      </div>
    </div>
    </div >
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  // アニメーション開始
  requestAnimationFrame(() => {
    const modalEl = document.getElementById('bulk-seat-edit-modal');
    if (modalEl) modalEl.classList.add('show');
  });
  // 外側クリックで閉じる
  const modal = document.getElementById('bulk-seat-edit-modal');
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) { closeBulkSeatEditModal(); } });
  }
  // 一括適用関数を束縛
  window.applyBulkSeatEdit = async function () {
    const columnC = document.getElementById('bulk-column-c').value;
    const columnD = document.getElementById('bulk-column-d').value;
    const columnE = document.getElementById('bulk-column-e').value;
    if (!confirm(`以下の内容を${seatIds.length} 席に一括適用しますか？\n\nC列: ${columnC} \nD列: ${columnD} \nE列: ${columnE} `)) return;
    closeBulkSeatEditModal();
    showLoader(true);
    try {
      // 一括更新用データの作成
      const updates = seatIds.map(id => {
        const el = document.querySelector(`.seat[data-id="${id}"]`);
        // 空欄は現状値を維持（意図せぬクリア防止）
        const cVal = columnC !== '' ? columnC : (el ? (el.dataset.columnC || '') : '');
        const dVal = columnD !== '' ? columnD : (el ? (el.dataset.columnD || '') : '');
        const eVal = columnE !== '' ? columnE : (el ? (el.dataset.columnE || '') : '');

        return {
          seatId: id,
          columnC: cVal,
          columnD: dVal,
          columnE: eVal
        };
      });

      console.log('一括更新実行:', updates);

      const response = await GasAPI.updateMultipleSeats(GROUP, DAY, ACTUAL_TIMESLOT, updates);

      if (response.success) {
        showSuccessNotification(`${updates.length} 席を更新しました。`);

        // 最新データで再描画
        try {
          const currentMode = localStorage.getItem('currentMode') || 'normal';
          const isAdminMode = currentMode === 'admin' || IS_ADMIN;
          const isSuperAdminMode = currentMode === 'superadmin';
          // キャッシュバイパス（SuperAdminならfalse）
          const useCache = !isSuperAdminMode;
          const seatData = await GasAPI.getSeatData(GROUP, DAY, ACTUAL_TIMESLOT, isAdminMode, isSuperAdminMode, useCache);

          if (seatData.success) {
            drawSeatMap(seatData.seatMap);
            updateLastUpdateTime();
          }
        } catch (refreshErr) {
          console.warn('再描画エラー:', refreshErr);
        }
      } else {
        const msg = response.message || response.error || '不明なエラー';
        showErrorNotification(`一括更新エラー: ${msg} `);
      }

    } catch (error) {
      console.error('一括編集エラー:', error);
      showErrorNotification('一括編集でエラーが発生しました。');
    } finally {
      showLoader(false);
      // 選択状態クリア
      document.querySelectorAll('.seat.selected-for-edit').forEach(seat => seat.classList.remove('selected-for-edit'));
      updateBulkEditButtonVisibility();
    }
  };
  window.closeBulkSeatEditModal = function () {
    const modal = document.getElementById('bulk-seat-edit-modal');
    if (!modal) return;
    try {
      modal.classList.add('closing');
      setTimeout(() => { try { modal.remove(); } catch (_) { } }, 250);
    } catch (_) {
      try { modal.remove(); } catch (_) { }
    }
  };
}

// 管理者モードでの座席クリック処理
function handleAdminSeatClick(seatData) {
  // チェックイン可能な座席のみ選択可能（確保ステータスも含む）
  if (seatData.status !== 'to-be-checked-in' && seatData.status !== 'reserved' && seatData.status !== 'walkin' && seatData.status !== 'secured') {
    console.log('この座席はチェックインできません:', seatData.status);
    return;
  }

  const seatElement = document.querySelector(`[data-id="${seatData.id}"]`);
  if (!seatElement) return;

  // ユーザー操作開始
  startUserInteraction();

  // 座席の選択状態を切り替え
  if (seatElement.classList.contains('selected-for-checkin')) {
    // 選択解除
    seatElement.classList.remove('selected-for-checkin');
    selectedSeats = selectedSeats.filter(id => id !== seatData.id);
  } else {
    // 選択
    seatElement.classList.add('selected-for-checkin');
    selectedSeats.push(seatData.id);
  }

  // 選択された座席数を表示
  updateSelectedSeatsDisplay();

  console.log('チェックイン対象座席:', selectedSeats);
}

// 通常モードでの座席クリック処理
function handleNormalSeatClick(seatData) {
  // 利用可能な座席のみ選択可能（通常時）
  // Rebook Mode with Admin: Allow selecting 'reserved' seats (to keep them or claim them)
  const isRebookAdmin = APP_MODE === MODES.REBOOK;

  if (seatData.status !== 'available' && !seatData._isOwn && !ownSeats.includes(seatData.id)) {
    // Rebook Admin Exception: Allow interaction with ANY seat to "Select" (Keep) or "Deselect" (Release)
    if (!isRebookAdmin) {
      console.log('この座席は選択できません:', seatData.status);
      // ユーザーに分かりやすいメッセージを表示
      const statusMessages = {
        'reserved': 'この座席は既に予約されています',
        'to-be-checked-in': 'この座席は既に予約されています',
        'checked-in': 'この座席は既にチェックイン済みです',
        'unavailable': 'この座席は利用できません'
      };
      const message = statusMessages[seatData.status] || 'この座席は選択できません';
      alert(message);
      return;
    }
  }

  const seatElement = document.querySelector(`[data-id="${seatData.id}"]`);
  if (!seatElement) return;

  // ユーザー操作開始
  startUserInteraction();

  // 座席の選択状態を切り替え
  if (seatElement.classList.contains('selected')) {
    // 選択解除
    seatElement.classList.remove('selected');
    selectedSeats = selectedSeats.filter(id => id !== seatData.id);
    // Rebook Mode: If own seat is deselected, remove 'my-booking' class
    if (seatData._isOwn || ownSeats.includes(seatData.id)) {
      seatElement.classList.remove('my-booking');
      // Visually revert to available if it was an own seat and deselected
      applySeatStatusClasses(seatElement, 'available');
    }
  } else {
    // 選択
    seatElement.classList.add('selected');
    selectedSeats.push(seatData.id);
    // Rebook Mode: If own seat is selected, add 'my-booking' class
    if (seatData._isOwn || ownSeats.includes(seatData.id) || APP_MODE === MODES.REBOOK) {
      seatElement.classList.add('my-booking');
    }
  }

  // 選択された座席数を表示
  updateSelectedSeatsDisplay();

  console.log('選択された座席:', selectedSeats);
}

// 選択された座席数の表示を更新
function updateSelectedSeatsDisplay() {
  const submitButton = document.getElementById('submit-button');
  if (submitButton) {
    // Rebook Mode Text
    const isRebook = !!rebookId && IS_ADMIN;
    const baseText = isRebook ? '変更を保存' : 'この席で予約する';

    // For Reset/Initial state in Rebook mode, we might want to say 'Change Seats' even with 0 selected?
    // Actually, usually 0 selected means disabled.
    // In Rebook mode, if I deselect all, I can't change. So disabled is correct.

    if (selectedSeats.length > 0) {
      const seatList = toDisplaySeatId(selectedSeats.join(', '));
      submitButton.textContent = `${baseText} (${selectedSeats.length} 席: ${seatList})`;
      submitButton.disabled = false;
      // Rebook: Orange/Amber color
      if (isRebook) submitButton.style.backgroundColor = '#f59e0b';
    } else {
      submitButton.textContent = baseText;
      submitButton.disabled = true;
      if (isRebook) submitButton.style.backgroundColor = '#f59e0b';
    }
  }
}



// checkInSelected wrapper removed - guard logic moved to function definition

// グローバル関数として設定
window.showLoader = showLoader;
window.toggleAutoRefresh = toggleAutoRefresh;
window.checkInSelected = checkInSelected;
window.confirmReservation = confirmReservation;
window.promptForAdminPassword = promptForAdminPassword;
window.toggleAutoRefreshSettings = toggleAutoRefreshSettings;
window.closeAutoRefreshSettings = closeAutoRefreshSettings;
window.manualRefresh = manualRefresh;
window.showModeChangeModal = showModeChangeModal;
window.closeModeModal = closeModeModal;
window.applyModeChange = applyModeChange;
window.startUserInteraction = startUserInteraction;
window.endUserInteraction = endUserInteraction;
window.showSeatEditModal = showSeatEditModal;
window.closeSeatEditModal = closeSeatEditModal;
window.updateSeatData = updateSeatData;
window.showUrlChangeAnimation = showUrlChangeAnimation;
window.centerSeatMap = centerSeatMap;
window.getScrollbarWidth = getScrollbarWidth;

// デバッグ用：グローバル関数の登録確認
console.log('[Seats Main] グローバル関数登録完了:', {
  showUrlChangeAnimation: typeof window.showUrlChangeAnimation,
  manualRefresh: typeof window.manualRefresh
});

// 自動更新設定メニューの表示制御
function toggleAutoRefreshSettings() {
  const panel = document.getElementById('auto-refresh-settings-panel');
  const overlay = document.getElementById('auto-refresh-overlay');

  if (panel.classList.contains('show')) {
    closeAutoRefreshSettings();
  } else {
    panel.classList.add('show');
    if (overlay) overlay.classList.add('show');
  }
}

// 自動更新設定メニューを閉じる
function closeAutoRefreshSettings() {
  const panel = document.getElementById('auto-refresh-settings-panel');
  const overlay = document.getElementById('auto-refresh-overlay');

  if (panel) panel.classList.remove('show');
  if (overlay) overlay.classList.remove('show');
}

// 手動更新
async function manualRefresh() {
  if (isRefreshing) return;

  isRefreshing = true;
  showLoader(true);

  try {
    // 手動更新時は必ず異なるURLを選択
    const oldUrl = apiUrlManager.getCurrentUrl();
    console.log('[Manual Refresh] 更新前URL:', oldUrl);

    apiUrlManager.selectRandomUrl();
    const newUrl = apiUrlManager.getCurrentUrl();
    console.log('[Manual Refresh] 更新後URL:', newUrl);

    // URL変更をチェック
    console.log('[Manual Refresh] checkForUrlChange を呼び出し');
    checkForUrlChange();

    // 手動更新時は直接アニメーションを表示
    if (oldUrl !== newUrl) {
      console.log('[Manual Refresh] 直接アニメーション表示');
      showUrlChangeAnimation(oldUrl, newUrl, 'random');
    }

    const currentMode = localStorage.getItem('currentMode') || 'normal';
    const isAdminMode = currentMode === 'admin' || IS_ADMIN;
    const isSuperAdminMode = currentMode === 'superadmin';

    // オフライン時はキャッシュから復元
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const cached = (window.readCache ? window.readCache(GROUP, DAY, TIMESLOT) : null);
      if (cached && cached.seatMap) {
        console.log('[Offline] 手動更新でキャッシュを使用');
        drawSeatMap(cached.seatMap);
        updateLastUpdateTime();
        alert('オフラインのためキャッシュから表示しています');
        return;
      }
    }

    const seatData = await GasAPI.getSeatData(ACTUAL_GROUP, DAY, ACTUAL_TIMESLOT, isAdminMode, isSuperAdminMode);

    if (seatData.success) {
      try { if (window.writeCache) { window.writeCache(GROUP, DAY, TIMESLOT, seatData); } } catch (_) { }
      drawSeatMap(seatData.seatMap);
      updateLastUpdateTime();
      alert('座席データを更新しました');
    }
  } catch (error) {
    console.error('手動更新エラー:', error);
    alert('更新に失敗しました: ' + error.message);
  } finally {
    showLoader(false);
    isRefreshing = false;
  }
}

// 画面の可視性変更を監視
let isPageVisible = true;
document.addEventListener('visibilitychange', () => {
  isPageVisible = !document.hidden;
  if (isPageVisible && isAutoRefreshEnabled) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
});

// ESCキーで設定メニューを閉じる
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeAutoRefreshSettings();
  }
});

// 自動更新の停止
function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// 管理者パスワード入力関数
function promptForAdminPassword() {
  // サイドバーのモード変更モーダルを表示
  showModeChangeModal();

  // 管理者モードを選択状態にする
  setTimeout(() => {
    const adminRadio = document.querySelector('input[name="mode"][value="admin"]');
    if (adminRadio) {
      adminRadio.checked = true;
    }
  }, 100);
}

// 複数同時チェックイン機能（最適化版）
async function checkInSelected() {
  if (rebookId) {
    console.warn('Rebook mode active: Check-in disabled.');
    return;
  }
  const selectedSeatElements = document.querySelectorAll('.seat.selected-for-checkin');
  if (selectedSeatElements.length === 0) {
    alert('チェックインする座席を選択してください。');
    return;
  }

  const selectedSeatInfos = Array.from(selectedSeatElements).map(seatEl => ({
    id: seatEl.dataset.id,
    columnD: seatEl.dataset.columnD || seatEl.dataset.seatName || ''
  }));

  // 選択された座席の一覧を表示
  const seatList = selectedSeatInfos.map(seat => `${seat.id}：${seat.columnD || '（名前未設定）'} `).join('\n');
  const confirmMessage = `以下の座席をチェックインしますか？\n\n${seatList} `;

  if (!confirm(confirmMessage)) {
    return;
  }

  // 楽観的更新：即座にUIを更新（チェックイン済みとして表示）
  const seatIds = selectedSeatInfos.map(seat => seat.id);

  // 選択された座席を即座にチェックイン済みとして表示
  selectedSeatElements.forEach(seatEl => {
    const seatId = seatEl.dataset.id;
    const seatData = {
      id: seatId,
      status: 'checked-in',
      name: seatEl.dataset.seatName || '',
      columnC: seatEl.dataset.columnC || '',
      columnD: seatEl.dataset.seatName || '',
      columnE: seatEl.dataset.columnE || ''
    };

    // 座席要素を更新
    updateSeatElement(seatEl, seatData);

    // 選択状態をクリア
    seatEl.classList.remove('selected-for-checkin');
  });

  // Clear global selection array
  selectedSeats = [];

  // 選択表示を更新
  updateSelectedSeatsDisplay();

  // ローダーを表示（軽量版）
  showLoader(true);

  try {
    // バックグラウンドでAPI呼び出し
    const response = await GasAPI.checkInMultipleSeats(ACTUAL_GROUP, DAY, ACTUAL_TIMESLOT, seatIds);

    if (response.success) {
      // 成功時：即座に成功メッセージを表示（ローダーは非表示）
      showLoader(false);

      // 成功通知を表示（非ブロッキング）: 座席ID：名前 の形式で複数表示し、スコープを明示
      const scopeLabel = `${GROUP} ${DAY}日目 ${DISPLAY_TIMESLOT} `;
      const lines = selectedSeatInfos.map(s => `${s.id}：${s.columnD || '（名前未設定）'} `);
      const message = `チェックインが完了しました（${scopeLabel}）\n\n${lines.join('\n')} `;
      showSuccessNotification(message);

      // バックグラウンドで座席データを再取得（サイレント更新）
      setTimeout(async () => {
        try {
          const currentMode = localStorage.getItem('currentMode') || 'normal';
          const isAdminMode = currentMode === 'admin' || IS_ADMIN;
          const isSuperAdminMode = currentMode === 'superadmin';

          const seatData = await GasAPI.getSeatData(ACTUAL_GROUP, DAY, ACTUAL_TIMESLOT, isAdminMode, isSuperAdminMode);

          if (seatData.success) {
            // サイレント更新：座席マップを再描画
            drawSeatMap(seatData.seatMap);
            updateLastUpdateTime();
          }
        } catch (error) {
          console.warn('バックグラウンド更新エラー（非致命的）:', error);
        }
      }, 1000); // 1秒後にバックグラウンド更新

    } else {
      // オフライン委譲レスポンスの処理
      if (response.error === 'offline_delegate' && response.functionName && response.params) {
        console.log('[チェックイン] オフライン委譲レスポンスを処理中...');

        // オフライン同期システムに操作を追加
        if (window.OfflineSyncV2 && window.OfflineSyncV2.addOperation) {
          const operationId = window.OfflineSyncV2.addOperation({
            type: response.functionName,
            args: response.params
          });

          showLoader(false);
          showSuccessNotification('オフラインでチェックインを受け付けました。オンライン復帰時に自動同期されます。');

          // 座席データを再取得してUIを復元
          await refreshSeatData();
          return;
        }
      }

      // オフライン委譲レスポンスの処理
      if (response.error === 'offline_delegate' && response.functionName && response.params) {
        console.log('[チェックイン] オフライン委譲レスポンスを処理中...');

        // オフライン同期システムに操作を追加
        if (window.OfflineSyncV2 && window.OfflineSyncV2.addOperation) {
          const operationId = window.OfflineSyncV2.addOperation({
            type: response.functionName,
            args: response.params
          });

          showLoader(false);
          showSuccessNotification('オフラインでチェックインを受け付けました。オンライン復帰時に自動同期されます。');

          // 座席データを再取得してUIを復元
          await refreshSeatData();
          return;
        }
      }
    }
  } catch (error) {
    console.error('チェックインエラー:', error);
    console.error('エラー詳細:', {
      message: error.message,
      error: error.error,
      success: error.success,
      stack: error.stack
    });

    // エラー時：UIを元に戻す
    showLoader(false);
    const errorMessage = error.message || error.error || '不明なエラーが発生しました';
    showErrorNotification(`チェックインエラー：\n${errorMessage} `);

    // 座席データを再取得してUIを復元
    await refreshSeatData();
  }

  // ユーザー操作終了
  endUserInteraction();
}

// 予約確認・実行関数（最適化版）
async function confirmReservation() {
  if (selectedSeats.length === 0) {
    alert('予約する座席を選択してください。\n\n利用可能な座席（緑色）をクリックして選択してから、予約ボタンを押してください。');
    return;
  }

  // 予約モードの分岐
  // Rebooking Mode
  if (urlParams.get('rebook') && urlParams.get('admin') === 'true') {
    const bookingId = urlParams.get('rebook');

    if (!confirm(`予約変更(Rebooking for ID: ${bookingId}) \n\n選択した座席に変更します。\nよろしいですか？`)) return;

    showLoader(true);
    try {
      const res = await GasAPI.adminChangeSeats(bookingId, selectedSeats);
      if (res.success) {
        if (urlParams.get('embed') === 'true') {
          // Embed Mode: Notify parent
          window.parent.postMessage({ type: 'REBOOK_COMPLETE', success: true }, '*');
        } else {
          // Standalone Mode
          alert('座席変更が完了しました。\n管理画面に戻ります。');
          if (window.opener) window.opener.location.reload();
          window.close();
        }
      } else {
        if (urlParams.get('embed') === 'true') {
          window.parent.postMessage({ type: 'REBOOK_COMPLETE', success: false, error: res.error }, '*');
        } else {
          alert('変更失敗: ' + (res.error || 'Unknown Error'));
        }
      }
    } catch (e) {
      if (urlParams.get('embed') === 'true') {
        window.parent.postMessage({ type: 'REBOOK_COMPLETE', success: false, error: e.message }, '*');
      } else {
        alert('System Error: ' + e.message);
      }
    } finally {
      showLoader(false);
    }
    return;
  }

  // Normal Reservation
  const confirmMessage = selectedSeats.length === 0
    ? '座席が選択されていません。予約処理を続行しますか？' // Should probably block but keeping orig logic flavor if any
    : `以下の座席で予約しますか？\n\n${selectedSeats.join(', ')} `;

  if (selectedSeats.length === 0) {
    alert('予約する座席を選択してください。');
    return;
  }

  if (!confirm(confirmMessage)) {
    return;
  }

  // 選択された座席のコピーを作成（API呼び出し用）
  const seatsToReserve = [...selectedSeats];

  // 楽観的更新：即座にUIを更新（予約済みとして表示）

  // 選択された座席を即座に予約済みとして表示
  selectedSeats.forEach(seatId => {
    const seatEl = document.querySelector(`[data - id= "${seatId}"]`);
    if (seatEl) {
      const seatData = {
        id: seatId,
        status: 'reserved',
        name: '予約中...',
        columnC: '予約済',
        columnD: '予約中...',
        columnE: ''
      };

      // 座席要素を更新
      updateSeatElement(seatEl, seatData);
    }
  });

  // 選択をクリア
  selectedSeats = [];
  updateSelectedSeatsDisplay();

  // ローダーを表示（軽量版）
  showLoader(true);

  try {
    const response = await GasAPI.reserveSeats(GROUP, DAY, ACTUAL_TIMESLOT, seatsToReserve);

    if (response.success) {
      // 成功時：即座に成功メッセージを表示（ローダーは非表示）
      showLoader(false);

      // 成功通知を表示（非ブロッキング）
      showSuccessNotification(response.message || '予約が完了しました！');

      // バックグラウンドで座席データを再取得（サイレント更新）
      setTimeout(async () => {
        try {
          const currentMode = localStorage.getItem('currentMode') || 'normal';
          const isAdminMode = currentMode === 'admin' || IS_ADMIN;
          const isSuperAdminMode = currentMode === 'superadmin';

          const seatData = await GasAPI.getSeatData(ACTUAL_GROUP, DAY, ACTUAL_TIMESLOT, isAdminMode, isSuperAdminMode);

          if (seatData.success) {
            // サイレント更新：座席マップを再描画
            drawSeatMap(seatData.seatMap);
            updateLastUpdateTime();
          }
        } catch (error) {
          console.warn('バックグラウンド更新エラー（非致命的）:', error);
        }
      }, 1000); // 1秒後にバックグラウンド更新

    } else {
      // オフライン委譲レスポンスの処理
      if (response.error === 'offline_delegate' && response.functionName && response.params) {
        console.log('[予約] オフライン委譲レスポンスを処理中...');

        // オフライン同期システムに操作を追加
        if (window.OfflineSyncV2 && window.OfflineSyncV2.addOperation) {
          const operationId = window.OfflineSyncV2.addOperation({
            type: response.functionName,
            args: response.params
          });

          showLoader(false);
          showSuccessNotification('オフラインで予約を受け付けました。オンライン復帰時に自動同期されます。');

          // 座席データを再取得してUIを復元
          await refreshSeatData();
          return;
        }
      }

      // オフライン委譲レスポンスの処理
      if (response.error === 'offline_delegate' && response.functionName && response.params) {
        console.log('[予約] オフライン委譲レスポンスを処理中...');

        // オフライン同期システムに操作を追加
        if (window.OfflineSyncV2 && window.OfflineSyncV2.addOperation) {
          const operationId = window.OfflineSyncV2.addOperation({
            type: response.functionName,
            args: response.params
          });

          showLoader(false);
          showSuccessNotification('オフラインで予約を受け付けました。オンライン復帰時に自動同期されます。');

          // 座席データを再取得してUIを復元
          await refreshSeatData();
          return;
        }
      }
    }
  } catch (error) {
    console.error('予約エラー:', error);
    console.error('エラー詳細:', {
      message: error.message,
      error: error.error,
      success: error.success,
      stack: error.stack
    });

    // エラー時：UIを元に戻す
    showLoader(false);
    const errorMessage = error.message || error.error || '不明なエラーが発生しました';
    showErrorNotification(`予約エラー：\n${errorMessage} `);

    // 座席データを再取得してUIを復元
    await refreshSeatData();
  }

  // ユーザー操作終了
  endUserInteraction();
}

// ユーザー操作の開始を検知
function startUserInteraction() {
  isUserInteracting = true;

  // 既存のタイマーをクリア
  if (interactionTimeout) {
    clearTimeout(interactionTimeout);
  }

  // 操作終了を検知するタイマーを設定（5秒後）
  interactionTimeout = setTimeout(() => {
    isUserInteracting = false;
    // 操作終了後、自動更新を再開
    if (isAutoRefreshEnabled && isPageVisible) {
      startAutoRefresh();
    }
  }, 5000);

  // 操作中は自動更新を停止
  stopAutoRefresh();
}

// 座席編集ドロワーを表示する関数（旧モーダルを置換）
function showSeatEditModal(seatData) {
  console.log('[最高管理者] ドロワー表示開始:', seatData);

  // 既存のドロワー/オーバーレイがあれば即座に完全削除（ID重複回避のため、closeSeatEditModalのアニメーション待機を行わない）
  const existingDrawer = document.getElementById('seat-edit-drawer');
  if (existingDrawer) existingDrawer.remove();
  const existingOverlay = document.getElementById('seat-edit-overlay');
  if (existingOverlay) existingOverlay.remove();

  // ステータス定義
  const statuses = [
    { value: '空', label: '空 (Available)' },
    { value: '予約済', label: '予約済 (Reserved)' },
    { value: '確保', label: '確保 (Reserved)' },
    { value: '使用不可', label: '使用不可 (Blocked)' },
    { value: 'チェックイン済', label: 'チェックイン済 (Checked In)' },
    { value: '当日券', label: '当日券 (Walk-in)' }
  ];

  const currentStatus = seatData.columnC || '空';

  // チップのHTML生成
  const chipsHTML = statuses.map(s => `
  <div class="status-chip ${s.value === currentStatus ? 'selected' : ''}"
    data-value="${s.value}"
    onclick="selectStatusChip(this, '${s.value}')">
      ${s.label}
  </div>
  `).join('');

  const drawerHTML = `
    <div id="seat-edit-overlay" class="seat-edit-overlay" onclick="closeSeatEditModal()"></div>
    <div id="seat-edit-drawer" class="seat-edit-drawer">
      <div class="drawer-header">
        <h3>座席編集 - ${seatData.id}</h3>
        <button class="btn-close-drawer" onclick="closeSeatEditModal()">&times;</button>
      </div>
      <div class="drawer-content">
        <div class="seat-edit-form">
          <div class="form-group">
            <label>ステータス</label>
            <div class="status-chip-group">
              ${chipsHTML}
            </div>
            <input type="hidden" id="drawer-column-c" value="${currentStatus}">
          </div>
          <div class="form-group">
            <label for="column-d">予約名・備考</label>
            <input type="text" id="column-d" value="${seatData.columnD || ''}" placeholder="例: 田中太郎">
          </div>

          <div class="form-group">
            <label for="column-e">E列: 備考</label>
            <input type="text" id="column-e" value="${seatData.columnE || ''}" placeholder="例: メモ">
          </div>
        </div>
      </div>
      <div class="drawer-footer">
        <button class="btn-secondary" onclick="closeSeatEditModal()">キャンセル</button>
        <button class="btn-primary" onclick="updateSeatData('${seatData.id}')">保存</button>
      </div>
    </div>
`;

  document.body.insertAdjacentHTML('beforeend', drawerHTML);

  // アニメーション開始
  requestAnimationFrame(() => {
    const drawer = document.getElementById('seat-edit-drawer');
    const overlay = document.getElementById('seat-edit-overlay');
    if (drawer) drawer.classList.add('show');
    if (overlay) overlay.classList.add('show');
  });
}

// ステータスチップ選択処理（グローバルへ）
window.selectStatusChip = function (el, value) {
  console.log('[Debug] selectStatusChip clicked:', { value, el });
  // 選択状態の更新
  document.querySelectorAll('.status-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  // 隠し入力フィールドの更新
  const input = document.getElementById('drawer-column-c');
  if (input) {
    input.value = value;
    console.log('[Debug] Hidden input updated:', input.value);
  } else {
    console.error('[Debug] Hidden input drawer-column-c NOT FOUND');
  }
};

// 座席編集ドロワーを閉じる関数
function closeSeatEditModal() {
  const drawer = document.getElementById('seat-edit-drawer');
  const overlay = document.getElementById('seat-edit-overlay');

  if (drawer) {
    drawer.classList.remove('show');
    if (overlay) overlay.classList.remove('show');

    // アニメーション完了後に削除
    setTimeout(() => {
      if (drawer) drawer.remove();
      if (overlay) overlay.remove();
    }, 300);
  }

  // 最高管理者モードの座席選択状態をクリア
  document.querySelectorAll('.seat.selected-for-edit').forEach(seat => {
    seat.classList.remove('selected-for-edit');
  });
}

// 座席データを更新する関数
async function updateSeatData(seatId) {
  const inputEl = document.getElementById('drawer-column-c');
  const columnC = inputEl ? inputEl.value : '';
  console.log('[Debug] updateSeatData reading input:', { found: !!inputEl, value: columnC });

  const columnD = document.getElementById('column-d').value;
  const columnE = document.getElementById('column-e').value; // 備考として取得

  // 確認ダイアログを表示
  const confirmMessage = `座席 ${seatId} のデータを以下の内容で更新しますか？\n\nC列: ${columnC} \nD列: ${columnD} \nE列: ${columnE} `;

  if (!confirm(confirmMessage)) {
    return;
  }

  showLoader(true);

  let el = null;
  let originalData = null;

  try {
    // 空欄は現状値を維持（意図せぬクリア防止）→ 修正: 入力値を正とする（空欄ならクリア）
    el = document.querySelector(`.seat[data-id="${seatId}"]`);

    // 入力値をそのまま使用する（空文字列ならクリアされる）
    const cVal = columnC;
    const dVal = columnD;
    const eVal = columnE;

    // 楽観的更新（即座にUIを更新）
    if (el) {


      // --- Initial Data Load ---
      originalData = {
        columnC: el.dataset.columnC,
        columnD: el.dataset.columnD,
        columnE: el.dataset.columnE,
        status: el.dataset.status
      };

      // 一時的にUIを更新
      el.dataset.columnC = cVal;
      el.dataset.columnD = dVal;
      el.dataset.columnE = eVal;
      // statusも更新（normalizeStatusで変換されるため、入力値のままでOK）
      el.dataset.status = cVal;
      updateSeatElement(el, { columnC: cVal, columnD: dVal, columnE: eVal, status: cVal });
    }

    let response;

    // オフライン時は操作をキューに追加
    if (window.ConnectionRecovery && !window.ConnectionRecovery.getConnectionStatus().isOnline) {
      window.ConnectionRecovery.queueOperation({
        type: 'updateSeat',
        group: GROUP,
        day: DAY,
        timeslot: ACTUAL_TIMESLOT,
        seatId: seatId,
        columnC: cVal,
        columnD: dVal,
        columnE: eVal
      });

      // オフライン通知
      if (window.ErrorNotification) {
        window.ErrorNotification.show('オフラインのため、操作をキューに保存しました。接続復旧時に自動実行されます。', {
          title: 'オフライン操作',
          type: 'info',
          duration: 5000
        });
      }

      return; // 処理を終了
    }

    response = await GasAPI.updateSeatData(GROUP, DAY, ACTUAL_TIMESLOT, seatId, cVal, dVal, eVal);

    if (response.success) {
      // 成功通知
      if (window.ErrorNotification) {
        window.ErrorNotification.show('座席データを更新しました！', {
          title: '更新完了',
          type: 'success',
          duration: 3000
        });
      } else {
        alert('座席データを更新しました！');
      }

      closeSeatEditModal();

      // 最高管理者モードの座席選択状態をクリア
      document.querySelectorAll('.seat.selected-for-edit').forEach(seat => {
        seat.classList.remove('selected-for-edit');
      });

      // 座席データを再読み込み（確認のため）
      const currentMode = localStorage.getItem('currentMode') || 'normal';
      const isAdminMode = currentMode === 'admin' || IS_ADMIN;
      const isSuperAdminMode = currentMode === 'superadmin';

      try {
        // 最高管理者の場合はキャッシュをバイパスして最新データを取得
        const useCache = !isSuperAdminMode;
        if (isSuperAdminMode) {
          console.log('[最高管理者] 最新データを強制取得中...');
        }

        const seatData = await GasAPI.getSeatData(GROUP, DAY, ACTUAL_TIMESLOT, isAdminMode, isSuperAdminMode, useCache);

        if (seatData.success) {
          drawSeatMap(seatData.seatMap);
          updateLastUpdateTime();
          if (isSuperAdminMode) {
            console.log('[最高管理者] データ同期完了');
          }
        }
      } catch (refreshError) {
        console.warn('座席データの再読み込みに失敗しましたが、更新は成功しました:', refreshError);
      }

    } else {
      // 失敗時は元の状態に戻す
      if (el && originalData) {
        el.dataset.columnC = originalData.columnC;
        el.dataset.columnD = originalData.columnD;
        el.dataset.columnE = originalData.columnE;
        updateSeatElement(el, originalData);
      }

      // エラー通知
      const errorMessage = response.error || response.message || '不明なエラーが発生しました';

      if (window.ErrorNotification) {
        window.ErrorNotification.show(errorMessage, {
          title: '更新エラー',
          type: 'error',
          duration: 8000
        });
      } else {
        alert(`更新エラー：\n${errorMessage} `);
      }
    }
  } catch (error) {
    console.error('座席データ更新エラー:', error);

    // 楽観的更新を元に戻す
    if (el && originalData) {
      el.dataset.columnC = originalData.columnC;
      el.dataset.columnD = originalData.columnD;
      el.dataset.columnE = originalData.columnE;
      updateSeatElement(el, originalData);
    }

    // ネットワークエラーの詳細な処理
    let errorMessage = error.message || '不明なエラーが発生しました';
    let errorType = 'error';

    if (error.message && error.message.includes('Load failed')) {
      errorMessage = 'ネットワーク接続エラーが発生しました。インターネット接続を確認して再試行してください。';
      errorType = 'warning';
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage = 'リクエストがタイムアウトしました。しばらく時間をおいて再試行してください。';
      errorType = 'warning';
    }

    if (window.ErrorNotification) {
      window.ErrorNotification.show(errorMessage, {
        title: '通信エラー',
        type: errorType,
        duration: 10000
      });
    } else {
      alert(`更新中にエラーが発生しました：\n${errorMessage} `);
    }
  } finally {
    showLoader(false);
  }
}

// ユーザー操作の終了を検知
function endUserInteraction() {
  isUserInteracting = false;
  if (interactionTimeout) {
    clearTimeout(interactionTimeout);
    interactionTimeout = null;
  }

  // 操作終了後、自動更新を再開
  if (isAutoRefreshEnabled && isPageVisible) {
    startAutoRefresh();
  }
}

// 当日券ページへのナビゲーション
function navigateToWalkin() {
  const currentMode = localStorage.getItem('currentMode') || 'normal';

  if (currentMode !== 'walkin' && currentMode !== 'superadmin') {
    alert('当日券発行には当日券モードまたは最高管理者モードでのログインが必要です。\nサイドバーからモードを変更してください。');
    return;
  }

  // 現在のURLパラメータを使用して当日券ページに遷移
  window.location.href = `walkin.html ? group = ${GROUP}& day=${DAY}& timeslot=${TIMESLOT} `;
}



// グローバル関数として登録
window.navigateToWalkin = navigateToWalkin;

// 選択座席の一括編集を起動（ヘッダーボタンから）
window.editSelectedSeats = function () {
  const selected = Array.from(document.querySelectorAll('.seat.selected-for-edit')).map(el => el.dataset.id);
  if (selected.length < 1) {
    alert('編集する座席を選択してください。\nCtrl/Shift キーを押しながらクリックで複数選択できます。');
    return;
  }
  if (selected.length === 1) {
    // 1席のみなら従来の単体編集モーダルへ
    const el = document.querySelector(`.seat.selected -for-edit`);
    if (!el) return;
    const seatId = el.dataset.id;
    // 簡易データを組み立てて既存モーダルを開く
    showSeatEditModal({ id: seatId, columnC: el.dataset.columnC || '', columnD: el.dataset.columnD || '', columnE: el.dataset.columnE || '' });
    return;
  }
  // 2席以上なら一括編集モーダル
  showBulkSeatEditModal(selected);
};

// 座席要素を更新する関数（楽観的更新用）
function updateSeatElement(seatEl, seatData) {
  if (!seatEl || !seatData) return;

  // データ属性を更新
  seatEl.dataset.seatName = seatData.name || seatData.columnD || '';
  seatEl.dataset.columnC = seatData.columnC || '';
  seatEl.dataset.columnD = seatData.columnD || '';
  seatEl.dataset.columnE = seatData.columnE || '';

  // クラスと色を統一更新
  applySeatStatusClasses(seatEl, seatData.status);

  // 座席名を更新
  const nameEl = seatEl.querySelector('.seat-name');
  if (nameEl) {
    nameEl.textContent = seatData.name || '';
  }

  // ステータス表示を更新
  const statusEl = seatEl.querySelector('.seat-status');
  if (statusEl) {
    statusEl.textContent = getStatusText(seatData.status);
  }

  // 色を更新
  updateSeatColor(seatEl, seatData.status);
}

// ステータス正規化（CSSクラス整合用）
function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();

  // Japanese Mappings
  if (s === '予約済') return 'reserved';
  if (s === '確保') return 'secured';
  if (s === 'チェックイン済') return 'checked-in';
  if (s === 'チェックイン待ち') return 'to-be-checked-in';
  if (s === '空') return 'available';
  if (s === '使用不可') return 'unavailable';
  if (s === '当日券') return 'walkin';

  // Standard Mappings
  if (s === 'checked_in') return 'checked-in';
  if (s === 'to_be_checked_in' || s === 'to-be-checked-in') return 'to-be-checked-in';
  if (s === 'unavailable' || s === 'blocked') return 'unavailable';
  if (s === 'walkin') return 'walkin';
  if (s === 'reserved') return 'reserved';
  if (s === 'secured') return 'secured';
  if (s === 'available') return 'available';
  return s;
}


// 全ての座席ステータスクラス（クリーンアップ用）
const ALL_CLASSES = [
  'reserved', 'seat-reserved',
  'secured', 'seat-secured',
  'checked-in', 'seat-checked-in',
  'to-be-checked-in', 'seat-to-be-checked-in',
  'available', 'seat-available',
  'unavailable', 'seat-unavailable',
  'walkin', 'seat-walkin',
  'blocked', 'seat-blocked'
];

function applySeatStatusClasses(seatEl, raw) {
  const normalized = normalizeStatus(raw);
  // すべての既知ステータスクラスを除去し、必要なクラスを付与
  seatEl.classList.remove(...ALL_CLASSES);
  // ベースクラス
  seatEl.classList.add('seat');
  // 汎用クラス（従来）
  if (normalized) seatEl.classList.add(normalized);
  // プレフィックス付き（新）
  seatEl.classList.add(`seat-${normalized}`);
  // blocked は unavailable と同義として両方付与
  if (raw === 'blocked') {
    seatEl.classList.add('blocked');
    seatEl.classList.add('seat-blocked');
    seatEl.classList.add('unavailable');
    seatEl.classList.add('seat-unavailable');
  }
}

// 色更新はCSSクラスで管理するため互換用の空関数
function updateSeatColor(seatEl, status) {
  // 互換目的: 色は applySeatStatusClasses で更新済み
}

// 座席のステータステキストを更新する関数
function updateSeatStatusText(seatEl, status) {
  // ステータス表示要素を取得
  const statusEl = seatEl.querySelector('.seat-status');
  if (statusEl) {
    statusEl.textContent = getStatusText(status);
  }
}

// 座席の名前を更新する関数
function updateSeatName(seatEl, seatData) {
  const currentMode = localStorage.getItem('currentMode') || 'normal';
  const isAdminMode = currentMode === 'admin' || IS_ADMIN;
  const isSuperAdminMode = currentMode === 'superadmin';

  // 管理者モードまたは最高管理者モードで、かつ予約済み以上の座席の場合のみ名前を表示
  if ((isAdminMode || isSuperAdminMode) && seatData.name && seatData.status !== 'available') {
    let nameEl = seatEl.querySelector('.seat-name');

    // 名前要素が存在しない場合は作成
    if (!nameEl) {
      nameEl = document.createElement('div');
      nameEl.className = 'seat-name';
      seatEl.appendChild(nameEl);
    }

    // 名前を更新
    if (seatData.name.length > 8) {
      nameEl.textContent = seatData.name.substring(0, 8) + '...';
      nameEl.title = seatData.name; // ツールチップで全文表示
    } else {
      nameEl.textContent = seatData.name;
    }
  } else {
    // 通常モードまたは名前が不要な場合は名前要素を削除
    const nameEl = seatEl.querySelector('.seat-name');
    if (nameEl) {
      nameEl.remove();
    }
  }
}

// 座席の追加データを更新する関数（最高管理者モード用）
function updateSeatAdditionalData(seatEl, seatData) {
  const currentMode = localStorage.getItem('currentMode') || 'normal';
  const isSuperAdminMode = currentMode === 'superadmin';

  if (isSuperAdminMode) {
    // C、D、E列のデータを更新
    if (seatData.columnC !== undefined) {
      seatEl.dataset.columnC = seatData.columnC;
    }
    if (seatData.columnD !== undefined) {
      seatEl.dataset.columnD = seatData.columnD;
    }
    if (seatData.columnE !== undefined) {
      seatEl.dataset.columnE = seatData.columnE;
    }
  }
}

// 座席のチェックイン可能フラグを更新する関数
function updateSeatCheckinFlag(seatEl, seatData) {
  const currentMode = localStorage.getItem('currentMode') || 'normal';
  const isAdminMode = currentMode === 'admin' || IS_ADMIN;

  if (isAdminMode && (seatData.status === 'to-be-checked-in' || seatData.status === 'reserved' || seatData.status === 'walkin')) {
    // チェックイン可能な座席を選択可能にする
    seatEl.classList.add('checkin-selectable');
    seatEl.dataset.seatName = seatData.name || seatData.columnD || '';
  } else {
    // チェックイン不可能な場合はフラグを削除
    seatEl.classList.remove('checkin-selectable');
    delete seatEl.dataset.seatName;
  }
}

// ステータスのテキストを取得する関数
function getStatusText(status) {
  const statusMap = {
    'available': '予約可能',
    'reserved': '予約済',
    'secured': '確保',
    'checked-in': 'チェックイン済',
    'unavailable': '設定なし'
  };
  return statusMap[status] || '不明';
}

// 成功通知を表示する関数（非ブロッキング）
function showSuccessNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'success-notification';
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.right = '20px';
  notification.style.background = '#d4edda';
  notification.style.color = '#155724';
  notification.style.border = '1px solid #c3e6cb';
  notification.style.borderRadius = '5px';
  notification.style.padding = '15px 20px';
  notification.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  notification.style.zIndex = '10001';
  notification.style.maxWidth = '400px';

  notification.innerHTML = `
  < div class="notification-content" style = "display: flex; align-items: center; gap: 10px;" >
      <span class="notification-icon" style="font-size: 1.2em; color: #28a745;">✓</span>
      <span class="notification-message" style="flex: 1; font-size: 0.9em;">${message}</span>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #155724; font-size: 1.2em; cursor: pointer; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">×</button>
    </div >
  `;

  // 通知を表示
  document.body.appendChild(notification);

  // 4秒後に自動で消す
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 4000);
}

// エラー通知を表示する関数（非ブロッキング）
function showErrorNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'error-notification';
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.right = '20px';
  notification.style.background = '#f8d7da';
  notification.style.color = '#721c24';
  notification.style.border = '1px solid #f5c6cb';
  notification.style.borderRadius = '5px';
  notification.style.padding = '15px 20px';
  notification.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  notification.style.zIndex = '10001';
  notification.style.maxWidth = '400px';

  notification.innerHTML = `
  < div class="notification-content" style = "display: flex; align-items: center; gap: 10px;" >
      <span class="notification-icon" style="font-size: 1.2em; color: #dc3545;">✗</span>
      <span class="notification-message" style="flex: 1; font-size: 0.9em;">${message}</span>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #721c24; font-size: 1.2em; cursor: pointer; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">×</button>
    </div >
  `;

  // 通知を表示
  document.body.appendChild(notification);

  // 5秒後に自動で消す
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
}

// オフライン復元通知を表示する関数
function showOfflineRestoreNotification(seatCount) {
  const notification = document.createElement('div');
  notification.className = 'offline-restore-notification';
  notification.innerHTML = `
  < div style = "display: flex; align-items: center; gap: 8px;" >
      <span style="font-size: 16px; color: #fff;">●</span>
      <div>
        <div style="font-weight: 600; margin-bottom: 2px;">オフライン復元完了</div>
        <div style="font-size: 12px; opacity: 0.9;">${seatCount}席のデータをキャッシュから復元しました</div>
      </div>
    </div >
  `;
  notification.style.cssText = `
position: fixed;
top: 20px;
left: 20px;
background: linear - gradient(135deg, #28a745 0 %, #20c997 100 %);
color: white;
padding: 12px 16px;
border - radius: 8px;
box - shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
z - index: 10000;
font - size: 14px;
max - width: 320px;
word - wrap: break-word;
animation: slideInLeft 0.3s ease - out;
`;

  // アニメーション用のCSS
  const style = document.createElement('style');
  style.textContent = `
@keyframes slideInLeft {
      from {
    transform: translateX(-100 %);
    opacity: 0;
  }
      to {
    transform: translateX(0);
    opacity: 1;
  }
}
`;
  document.head.appendChild(style);

  document.body.appendChild(notification);

  // 4秒後に自動削除
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideInLeft 0.3s ease-out reverse';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }, 300);
    }
  }, 4000);
}

// 座席データを再取得してUIを復元する関数
async function refreshSeatData() {
  try {
    const currentMode = localStorage.getItem('currentMode') || 'normal';
    const isAdminMode = currentMode === 'admin' || IS_ADMIN;
    const isSuperAdminMode = currentMode === 'superadmin';

    // 手動更新時も最小限のデータで十分な場合は最小限データを使用
    let seatData;
    if (isAdminMode || isSuperAdminMode) {
      // 管理者モードの場合は完全なデータを取得
      seatData = await GasAPI.getSeatData(GROUP, DAY, ACTUAL_TIMESLOT, isAdminMode, isSuperAdminMode);
    } else {
      // 通常モードの場合は最小限のデータを取得（高速化）
      seatData = await GasAPI.getSeatDataMinimal(GROUP, DAY, ACTUAL_TIMESLOT, isAdminMode);
    }

    if (seatData.success) {
      // 最小限データの場合は既存の座席データとマージ
      if (seatData.seatMap && Object.keys(seatData.seatMap).length > 0) {
        // 既存の座席データを保持しつつ、ステータスのみ更新
        updateSeatMapWithMinimalData(seatData.seatMap);
      } else {
        // 完全なデータの場合は通常通り更新
        drawSeatMap(seatData.seatMap);
      }
      updateLastUpdateTime();
    }
  } catch (error) {
    console.error('座席データ復元エラー:', error);
  }
}

// URL変更時のアニメーション通知を表示する関数
function showUrlChangeAnimation(oldUrl, newUrl, changeType = 'rotation') {
  console.log('[Animation] showUrlChangeAnimation 呼び出し:', { oldUrl, newUrl, changeType });

  // 通知要素を作成
  const notification = document.createElement('div');
  notification.className = 'url-change-notification';
  notification.style.cssText = `
position: fixed;
top: 20px;
left: 50 %;
transform: translateX(-50 %);
background: linear - gradient(135deg, #667eea 0 %, #764ba2 100 %);
color: white;
padding: 12px 20px;
border - radius: 8px;
box - shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
z - index: 10000;
font - family: -apple - system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans - serif;
font - size: 14px;
font - weight: 500;
opacity: 0;
transform: translateX(-50 %) translateY(-20px);
transition: all 0.3s cubic - bezier(0.4, 0, 0.2, 1);
max - width: 90vw;
text - align: center;
border: 1px solid rgba(255, 255, 255, 0.2);
cursor: pointer;
`;

  // アイコンとメッセージを設定
  const icon = changeType === 'rotation' ? '↻' : '⚡';
  const message = changeType === 'rotation' ? 'API URL ローテーション' : 'API URL ランダム選択';

  // スクリプトIDを抽出（/macros/s/以降の部分）
  const scriptId = newUrl.split('/macros/s/')[1]?.split('/')[0] || 'unknown';
  const displayId = scriptId.substring(0, 8) + '...';

  notification.innerHTML = `
  < div style = "display: flex; align-items: center; gap: 8px;" >
      <span style="font-size: 16px; font-weight: bold;">${icon}</span>
      <span>${message}</span>
      <span style="opacity: 0.8; font-size: 12px;">(${displayId})</span>
    </div >
  `;

  // 通知表示用のCSS
  if (!document.getElementById('url-change-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'url-change-animation-styles';
    style.textContent = `
@keyframes slideInDown {
        from {
    opacity: 0;
    transform: translateX(-50 %) translateY(-20px);
  }
        to {
    opacity: 1;
    transform: translateX(-50 %) translateY(0);
  }
}
@keyframes slideOutUp {
        from {
    opacity: 1;
    transform: translateX(-50 %) translateY(0);
  }
        to {
    opacity: 0;
    transform: translateX(-50 %) translateY(-20px);
  }
}
      .url - change - notification {
  animation: slideInDown 0.3s cubic - bezier(0.4, 0, 0.2, 1) forwards;
}
      .url - change - notification.hiding {
  animation: slideOutUp 0.3s cubic - bezier(0.4, 0, 0.2, 1) forwards;
}
`;
    document.head.appendChild(style);
  }

  // 通知を表示
  console.log('[Animation] 通知要素をDOMに追加');
  document.body.appendChild(notification);

  // アニメーション開始
  console.log('[Animation] アニメーション開始');
  requestAnimationFrame(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(-50%) translateY(0)';
    console.log('[Animation] アニメーション適用完了');
  });

  // 3秒後に自動で消す
  setTimeout(() => {
    notification.classList.add('hiding');
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 300);
  }, 3000);

  // クリックで即座に消す
  notification.addEventListener('click', () => {
    notification.classList.add('hiding');
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 300);
  });
}

// URL変更を監視する関数
let lastKnownUrl = apiUrlManager.getCurrentUrl();
function checkForUrlChange() {
  const currentUrl = apiUrlManager.getCurrentUrl();
  console.log('[URL Change Check] 現在のURL:', currentUrl);
  console.log('[URL Change Check] 前回のURL:', lastKnownUrl);

  if (currentUrl !== lastKnownUrl) {
    console.log('[URL Change] 検知:', lastKnownUrl, '→', currentUrl);
    console.log('[URL Change] showUrlChangeAnimation を呼び出し');
    showUrlChangeAnimation(lastKnownUrl, currentUrl, 'rotation');
    lastKnownUrl = currentUrl;
  } else {
    console.log('[URL Change] 変更なし');
  }
}

// Rebook Mode UI Support (Moved from DOMContentLoaded)
// const urlParams = new URLSearchParams(window.location.search); // Already declared at top
// const rebookId = urlParams.get('rebook'); // Already declared at top

// オフライン状態インジケーターの制御
let updateOfflineStatus; // Define globally

function initializeOfflineIndicator() {
  const indicator = document.getElementById('offline-indicator');
  const progressBar = document.getElementById('sync-progress-bar');

  if (!indicator || !progressBar) return;

  // オフライン状態の監視
  updateOfflineStatus = () => {
    const isOnline = navigator.onLine;
    if (isOnline) {
      indicator.style.display = 'none';
      indicator.textContent = 'オンライン';
      indicator.classList.add('online');
    } else {
      indicator.style.display = 'block';
      indicator.textContent = 'オフライン';
      indicator.classList.remove('online');
    }
  };

  // 初期状態の設定
  updateOfflineStatus();

  // イベントリスナーの設定
  window.addEventListener('online', updateOfflineStatus);
  window.addEventListener('offline', updateOfflineStatus);
}

// Rebook Mode Global Init
document.addEventListener('DOMContentLoaded', () => {
  // UI Support Logic using global rebookId
  // Rebook Mode UI Support
  // let ownSeats = []; // Store IDs of own seats - This is already a global variable. Do not redeclare.

  if (rebookId && urlParams.get('admin') === 'true') {
    const btn = document.getElementById('reservation-btn');
    if (btn) {
      btn.innerText = '予約変更を実行 (Change Seats)';
      btn.style.backgroundColor = '#f59e0b'; // Amber
    }

    const headerTitle = document.querySelector('header h1');
    if (headerTitle) {
      headerTitle.innerHTML += ' <span style="color:#f59e0b; font-size:0.8em;">[座席変更]</span>';
    }
  }

  // Embed Mode UI Cleanup
  if (urlParams.get('embed') === 'true') {
    document.body.classList.add('embed-mode');
    // Inject styles to hide header/footer
    const style = document.createElement('style');
    style.textContent = `
header, footer { display: none!important; }
            body { padding: 0!important; background: transparent; }
            .container { max - width: 100 % !important; padding: 10px!important; margin: 0!important; }
            /* Adjust sticky button bar if needed */
            .reservation - bar { bottom: 0; }
`;
    document.head.appendChild(style);
  }
});

// オフライン同期システムの状態監視
if (window.OfflineSyncV2) {
  const progressBar = document.getElementById('sync-progress-bar');
  const checkSyncStatus = () => {
    const status = window.OfflineSyncV2.getStatus();

    if (status.syncInProgress) {
      progressBar.style.display = 'block';
      const progress = progressBar.querySelector('.progress');
      if (progress) {
        progress.style.width = '100%';
      }
    } else {
      progressBar.style.display = 'none';
      const progress = progressBar.querySelector('.progress');
      if (progress) {
        progress.style.width = '0%';
      }
    }
  };

  // 定期的に状態をチェック
  setInterval(checkSyncStatus, 1000);

  // 初期状態のチェック
  checkSyncStatus();

  // URL変更の定期チェック（30秒ごと）
  setInterval(checkForUrlChange, 30000);
}


