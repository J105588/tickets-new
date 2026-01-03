/**
 * reservation.js
 * 予約フローを制御するスクリプト
 */

import { apiUrlManager } from './config.js';
import { fetchMasterDataFromSupabase, fetchPerformancesFromSupabase, fetchSeatsFromSupabase, getServerTime, subscribeToDeadline, toDisplaySeatId } from './supabase-client.js';

// 状態管理
const state = {
    group: '',
    day: '',
    timeslot: '',
    selectedSeats: [], // Array of seat IDs
    maxSeats: 5, // 1回の予約で選択できる最大数
    token: new URLSearchParams(window.location.search).get('token'),
    serverOffset: 0,
    globalDeadline: null,
    isExpired: false
};

// DOM Elements
const pages = {
    1: document.getElementById('step-1'),
    2: document.getElementById('step-2'),
    3: document.getElementById('step-3'),
    4: document.getElementById('step-4')
};

const inputs = {
    group: document.getElementById('group-select'),
    day: document.getElementById('day-select'),
    timeslot: document.getElementById('timeslot-select')
};

const navigation = {
    toStep2: document.getElementById('btn-to-step-2'),
    toStep3: document.getElementById('btn-to-step-3'),
    submit: document.getElementById('btn-submit')
};

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    await initTimeSync(); // Sync first
    await initializeMasterData();
    populateFormDropdowns();
    initStep1();
    initStep2();
    startDeadlineMonitoring(); // Start loop
});

async function initTimeSync() {
    const serverNow = await getServerTime(); // Fetch RPC
    if (serverNow) {
        state.serverOffset = serverNow.getTime() - Date.now();
        console.log('Time synced. Offset:', state.serverOffset, 'ms');
    }
}

function getCurrentServerTime() {
    return new Date(Date.now() + state.serverOffset);
}

// Deadline Monitor Loop
function startDeadlineMonitoring() {
    // 1. Check periodically
    setInterval(checkDeadlineStatus, 1000); // Check every second
    checkDeadlineStatus(); // Immediate check

    // 2. Subscribe to changes
    subscribeToDeadline((newValue) => {
        state.globalDeadline = newValue;
        checkDeadlineStatus(); // Re-check immediately
    });
}

function checkDeadlineStatus() {
    if (!state.globalDeadline) {
        updateDeadlineUI(false);
        return;
    }

    // Force JST interpretation (Append +09:00 if strictly YYYY-MM-DDTHH:mm)
    // datetime-local format: "2025-10-30T15:00"
    let deadlineStr = state.globalDeadline;
    if (deadlineStr.indexOf('+') === -1 && deadlineStr.indexOf('Z') === -1) {
        deadlineStr += '+09:00';
    }
    const deadlineDate = new Date(deadlineStr);
    const now = getCurrentServerTime();

    // Display Time (Always JST)
    const formatDeadline = deadlineDate.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'
    });

    if (now > deadlineDate) {
        // Expired
        if (!state.isExpired) {
            state.isExpired = true;
            handleExpiration(formatDeadline); // Pass date for display if needed
        } else {
            // already expired, just ensure UI is correct if needed (token case)
            handleExpiration(formatDeadline);
        }
    } else {
        // Active
        if (state.isExpired) {
            state.isExpired = false;
        }
        handleActive();
        updateDeadlineUI(true); // This creates the span
    }

    // Set text AFTER UI update ensures span exists
    const deadlineDisplay = document.getElementById('deadline-display-time');
    if (deadlineDisplay) deadlineDisplay.innerText = formatDeadline;
}

function handleExpiration(deadlineText = '') {
    if (state.token) {
        // Token valid -> Warn but allow
        const dInfo = document.getElementById('deadline-info');
        if (dInfo) {
            dInfo.style.display = 'block';
            dInfo.innerHTML = `<i class="fas fa-exclamation-circle"></i> 期限(${deadlineText})を過ぎていますが、招待リンクにより予約可能です。`;
            dInfo.style.backgroundColor = '#d4edda';
            dInfo.style.color = '#155724';
            dInfo.style.borderColor = '#c3e6cb';
        }
        // Show form if hidden
        document.querySelector('.progress-bar').style.display = 'flex';
        if (document.getElementById('step-1').style.display === 'none') {
            // If we were on step 1, show it. If user is deeper, don't reset.
            // Simplest: just ensure container is visible. 
            // But wait, step-1 might not be active step.
            // Just unhide the progress bar and let current step show.
        }
    } else {
        // Block
        document.querySelector('.progress-bar').style.display = 'none';
        document.querySelector('.step-content.active').style.display = 'none'; // Hide current step
        document.getElementById('reservation-closed-message').style.display = 'block';
        document.getElementById('deadline-info').style.display = 'none'; // Hide info in favor of big error
    }
}

function handleActive() {
    // Re-open if extended
    document.getElementById('reservation-closed-message').style.display = 'none';
    document.querySelector('.progress-bar').style.display = 'flex';
    document.querySelector('.step-content.active').style.display = 'block';
    updateDeadlineUI(true);
}

function updateDeadlineUI(show) {
    const el = document.getElementById('deadline-info');
    if (!el) return;
    if (show) {
        el.style.display = 'block';
        // Reset style
        el.style.background = '#fff3cd';
        el.style.color = '#856404';
        el.style.border = '1px solid #ffeeba';
        el.innerHTML = `<i class="fas fa-exclamation-circle"></i> 予約受付期限: <span id="deadline-display-time" style="font-weight: bold;"></span> まで`;
    } else {
        el.style.display = 'none';
    }
}

let masterGroups = [];
let masterDates = [];

async function initializeMasterData() {
    // Supabaseからマスターデータ取得
    const result = await fetchMasterDataFromSupabase();

    if (result.success) {
        masterGroups = result.data.groups;
        masterDates = result.data.dates || [];

        // Initial Deadline Set (Monitoring loop handles logic)
        state.globalDeadline = result.data.global_deadline;
        checkDeadlineStatus(); // Force check after load

        populateGroupSelect();
    } else {
        console.error('Master Data Load Error:', result.error);
        const el = document.getElementById('group-select');
        if (el) el.innerHTML = '<option disabled selected>データの読み込みに失敗しました</option>';
    }
}

function populateGroupSelect() {
    const select = document.getElementById('group-select');
    if (!select) return; // Prevention for null error
    select.innerHTML = '<option value="" disabled selected>選択してください</option>';

    masterGroups.forEach(g => {
        if (!g.is_active) return;
        const option = document.createElement('option');
        option.value = g.name;
        option.textContent = g.name;
        select.appendChild(option);
    });
}

function populateFormDropdowns() {
    // 年 (1-6 + その他)
    const yearSelect = document.getElementById('res-grade-year');
    if (yearSelect) {
        yearSelect.innerHTML = '<option value="">年を選択</option>';
        for (let i = 1; i <= 6; i++) {
            const opt = document.createElement('option');
            opt.value = `${i}年`;
            opt.innerText = `${i}年`;
            yearSelect.appendChild(opt);
        }
        const otherOpt = document.createElement('option');
        otherOpt.value = 'その他';
        otherOpt.innerText = 'その他';
        yearSelect.appendChild(otherOpt);
    }

    // 組 (1-11)
    const classSelect = document.getElementById('res-grade-class');
    if (classSelect) {
        classSelect.innerHTML = '<option value="">組を選択</option>';
        for (let i = 1; i <= 11; i++) {
            const opt = document.createElement('option');
            opt.value = `${i}組`;
            opt.innerText = `${i}組`;
            classSelect.appendChild(opt);
        }
    }

    // 部活 (masterGroupsから)
    const clubSelect = document.getElementById('res-club-select');
    if (clubSelect) {
        clubSelect.innerHTML = '<option value="">選択してください</option>';
        // masterGroups is global and populated by initializeMasterData
        if (typeof masterGroups !== 'undefined' && masterGroups.length > 0) {
            masterGroups.forEach(g => {
                if (!g.is_active) return;
                const opt = document.createElement('option');
                opt.value = g.name;
                opt.innerText = g.name;
                clubSelect.appendChild(opt);
            });
        }
    }
}

function getGradeClassValue() {
    const yElem = document.getElementById('res-grade-year');
    const cElem = document.getElementById('res-grade-class');
    if (!yElem || !cElem) return '';

    const y = yElem.value;
    const c = cElem.value;
    if (y === 'その他') return 'その他';
    // Both must be selected for a valid student grade/class
    if (y && c) return `${y}${c}`;
    return '';
}


// ==========================================
// Step 1: 公演選択
// ==========================================
function initStep1() {
    inputs.group.addEventListener('change', async () => {
        state.group = inputs.group.value;
        inputs.day.innerHTML = '<option value="" disabled selected>読み込み中...</option>';
        inputs.day.disabled = true;
        inputs.timeslot.innerHTML = '<option value="" disabled selected>日程を選択してください</option>';
        inputs.timeslot.disabled = true;

        state.selectedSeats = []; // Clear selection
        updateSelectedSeatsUI();

        await fetchPerformances(state.group);
    });

    inputs.day.addEventListener('change', () => {
        state.day = inputs.day.value;
        updateTimeslotOptions();
        checkStep1Validity();
    });

    inputs.timeslot.addEventListener('change', () => {
        state.timeslot = inputs.timeslot.value;
        checkStep1Validity();
    });

    navigation.toStep2.addEventListener('click', () => {
        // loadSeatMap(); // Moved to Modal Open
        // Reset selection if going fresh? 
        // Better to clear selection when changing Group/Day/Time in initStep1 listeners.
        showStep(2);
    });

    const btnBack1 = document.getElementById('btn-back-to-step-1');
    if (btnBack1) {
        btnBack1.addEventListener('click', () => {
            showStep(1);
        });
    }

    const btnBack2 = document.getElementById('btn-back-to-step-2');
    if (btnBack2) {
        btnBack2.addEventListener('click', () => {
            showStep(2);
        });
    }
}

function checkStep1Validity() {
    const isValid = state.group && state.day && state.timeslot;
    navigation.toStep2.disabled = !isValid;
}

// 公演データキャッシュ
let performanceData = [];

async function fetchPerformances(group) {
    try {
        const result = await fetchPerformancesFromSupabase(group);

        if (result.success) {
            performanceData = result.data;
            updateDayOptions();
        } else {
            alert('公演データの取得に失敗しました: ' + result.error);
        }
    } catch (e) {
        console.error(e);
        alert('通信エラーが発生しました');
    }
}

function updateDayOptions() {
    // Days in performanceData are IDs (e.g. 1, 2)
    const dayIds = [...new Set(performanceData.map(p => p.day))].sort((a, b) => a - b);

    inputs.day.innerHTML = '<option value="" disabled selected>日程を選択してください</option>';

    dayIds.forEach(dayId => {
        const option = document.createElement('option');
        option.value = dayId;

        // Find label from masterDates
        const dateObj = masterDates.find(d => d.id == dayId);
        const label = dateObj ? dateObj.date_label : `${dayId}日目`;

        option.textContent = label;
        inputs.day.appendChild(option);
    });

    inputs.day.disabled = false;
}

function updateTimeslotOptions() {
    const day = parseInt(state.day);
    // Sort timeslots directly as strings
    const timeslots = performanceData
        .filter(p => p.day == day)
        .map(p => p.timeslot)
        .sort((a, b) => a.localeCompare(b));

    inputs.timeslot.innerHTML = '<option value="" disabled selected>時間帯を選択してください</option>';
    timeslots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot;
        // Timeslot is now the Time Range string itself (e.g. "10:00 - 11:00")
        // No need for lookup or mapping.
        option.textContent = slot;
        inputs.timeslot.appendChild(option);
    });

    inputs.timeslot.disabled = false;
}
// Removed getTimeString as it is no longer needed

// ==========================================
// Step 2: 座席選択
// ==========================================

// ==========================================
// Step 2: 座席選択 (Modal & Zoom)
// ==========================================

const seatMapContainer = document.getElementById('seat-map-container');
const loadingSpinner = document.getElementById('loading-spinner');
const seatModal = document.getElementById('seat-selection-modal');

// Zoom State
let currentZoom = 1.0;
const ZOOM_STEP = 0.2;
const MAX_ZOOM = 2.0;
const MIN_ZOOM = 0.4;

function initStep2() {
    // Open Modal
    const btnOpen = document.getElementById('btn-open-seat-modal');
    if (btnOpen) {
        btnOpen.addEventListener('click', () => {
            openSeatModal();
        });
    }

    // Close Modal
    const btnClose = document.getElementById('btn-close-modal');
    if (btnClose) {
        btnClose.addEventListener('click', () => {
            if (confirm('選択内容は保存されません。閉じますか？')) {
                closeSeatModal();
            }
        });
    }

    const btnConfirm = document.getElementById('btn-confirm-selection');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            closeSeatModal();
            updateSelectedSeatsUI();
        });
    }

    // Zoom Controls
    const btnZoomIn = document.getElementById('btn-zoom-in');
    if (btnZoomIn) {
        btnZoomIn.addEventListener('click', () => {
            if (currentZoom < MAX_ZOOM) {
                currentZoom += ZOOM_STEP;
                updateZoom();
            }
        });
    }

    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomOut) {
        btnZoomOut.addEventListener('click', () => {
            if (currentZoom > MIN_ZOOM) {
                currentZoom -= ZOOM_STEP;
                updateZoom();
            }
        });
    }

    const btnZoomReset = document.getElementById('btn-zoom-reset');
    if (btnZoomReset) {
        btnZoomReset.addEventListener('click', () => {
            currentZoom = 0.8; // Default slightly zoomed out for mobile
            if (window.innerWidth > 600) currentZoom = 1.0;
            updateZoom();
        });
    }
}

function updateZoom() {
    // seatMapContainer.style.transform = `scale(${currentZoom})`; // Old way
    seatMapContainer.style.setProperty('--seat-scale', currentZoom);
}

function openSeatModal() {
    seatModal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent bg scroll

    // Reset Zoom
    currentZoom = window.innerWidth < 600 ? 0.6 : 1.0;
    updateZoom();

    // Load Data if empty or always
    loadSeatMap();
}

function closeSeatModal() {
    seatModal.classList.remove('active');
    document.body.style.overflow = '';
}

async function loadSeatMap() {
    loadingSpinner.style.display = 'block';
    seatMapContainer.innerHTML = ''; // Clear previous
    seatMapContainer.appendChild(loadingSpinner);

    // UI update for modal footer
    updateModalCount();

    try {
        // 直接Supabaseから座席データを取得
        const result = await fetchSeatsFromSupabase(state.group, state.day, state.timeslot);

        if (!result.success) throw new Error(result.error || 'データ取得失敗');

        renderSeatMap(result.data);

    } catch (e) {
        console.error(e);
        alert('座席データの読み込みに失敗しました: ' + e.message);
    } finally {
        loadingSpinner.style.display = 'none';
        updateZoom(); // Ensure zoom is applied to new content
    }
}

// 座席マップを描画する関数
function renderSeatMap(seatList) {
    const container = document.getElementById('seat-map-container');
    container.innerHTML = '';

    // データ形式の正規化 (配列化)
    const seats = Array.isArray(seatList) ? seatList : Object.values(seatList);

    // レイアウト抽出
    const rows = {};
    seats.forEach(seat => {
        const id = seat.seat_id || seat.id;
        if (!id) return;

        // IDから行と番号を抽出 (A1 -> Row:A, Num:1)
        const match = id.match(/^([A-Z]+)(\d+)$/);
        if (match) {
            const rowLabel = match[1];
            const seatNumber = parseInt(match[2]);

            if (!rows[rowLabel]) rows[rowLabel] = [];
            rows[rowLabel].push({
                ...seat,
                seat_id: id,
                seatNumber: seatNumber
            });
        }
    });

    const seatSection = document.createElement('div');
    seatSection.className = 'seat-section';

    // Screen / Stage Element
    const screenEl = document.createElement('div');
    screenEl.className = 'screen';
    screenEl.innerText = 'STAGE';
    screenEl.style.cssText = `
        width: 80%;
        max-width: 600px;
        background: #333;
        color: #fff;
        text-align: center;
        padding: 8px;
        margin: 0 auto 30px auto;
        border-radius: 4px;
        font-weight: bold;
        letter-spacing: 2px;
        font-size: 0.9rem;
    `;

    // Vertical Spacer (Top)
    const topSpacer = document.createElement('div');
    topSpacer.style.height = '120px';
    topSpacer.style.width = '100%';

    // Padding logic to allow scrolling to edges
    const containerWidth = container.clientWidth || window.innerWidth;
    const paddingWidth = Math.max(containerWidth * 0.5, 300);

    const leftPadding = document.createElement('div');
    leftPadding.style.minWidth = paddingWidth + 'px';
    leftPadding.style.height = '1px';

    const rightPadding = document.createElement('div');
    rightPadding.style.minWidth = paddingWidth + 'px';
    rightPadding.style.height = '1px';

    const wrapperRow = document.createElement('div');
    wrapperRow.style.display = 'flex';
    wrapperRow.style.flexDirection = 'row';
    wrapperRow.style.alignItems = 'flex-start';
    wrapperRow.style.justifyContent = 'flex-start';

    // Structure:
    // LeftPadding | MainContent (Screen + Seats) | RightPadding

    const mainContent = document.createElement('div');
    mainContent.style.display = 'flex';
    mainContent.style.flexDirection = 'column';
    mainContent.style.alignItems = 'center';

    mainContent.appendChild(topSpacer);
    mainContent.appendChild(screenEl);
    mainContent.appendChild(seatSection);

    wrapperRow.appendChild(leftPadding);
    wrapperRow.appendChild(mainContent);
    wrapperRow.appendChild(rightPadding);

    container.appendChild(wrapperRow);

    // Scroll to center initially
    const alignMap = () => {
        if (container.scrollWidth > container.clientWidth) {
            container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
        }
        container.scrollTop = 0;
    };

    requestAnimationFrame(() => {
        alignMap();
        setTimeout(alignMap, 50);
        setTimeout(alignMap, 200);
    });

    // 行をソート (A, B, C...)
    const sortedRows = Object.keys(rows).sort();

    sortedRows.forEach(rowLabel => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'seat-row';
        rowDiv.style.display = 'flex';
        rowDiv.style.justifyContent = 'center';
        rowDiv.style.marginBottom = '10px';

        // 座席番号順にソート
        const sortedSeats = rows[rowLabel].sort((a, b) => a.seatNumber - b.seatNumber);

        sortedSeats.forEach(seat => {
            const seatEl = createSeatElement(seat);
            rowDiv.appendChild(seatEl);

            // 通路の挿入 (13, 14の間 と 25, 26の間)
            if (seat.seatNumber === 13 || seat.seatNumber === 25) {
                const passage = document.createElement('div');
                passage.className = 'passage-vertical';
                passage.style.flexShrink = '0';
                rowDiv.appendChild(passage);
            }
        });

        seatSection.appendChild(rowDiv);

        // 横の通路 (F列の後)
        if (rowLabel === 'F') {
            const horizontalPassage = document.createElement('div');
            horizontalPassage.className = 'passage-horizontal';
            horizontalPassage.style.height = '30px'; // 通路高さ
            seatSection.appendChild(horizontalPassage);
        }
    });

    // WrapperRow is already appended to container in previous logic block
    // If not, we should have done it. 
    // Assuming container.appendChild(wrapperRow) happened before the loop.
    // Let's verify and just close.
}

function createSeatElement(seat) {
    const seatEl = document.createElement('div');
    seatEl.className = `seat ${seat.status}`;
    // 自身の選択状態を反映
    if (state.selectedSeats.includes(seat.seat_id)) {
        seatEl.classList.add('selected');
    }

    seatEl.dataset.id = seat.seat_id;
    seatEl.innerText = toDisplaySeatId(seat.seat_id); // UI Translation

    // スタイルはCSSクラスで制御
    seatEl.addEventListener('click', () => handleSeatClick(seat));

    return seatEl;
}

function handleSeatClick(seat) {
    if (seat.status !== 'available') {
        return; // 空席以外は選択不可
    }

    const id = seat.seat_id;
    const index = state.selectedSeats.indexOf(id);

    if (index > -1) {
        // 選択解除
        state.selectedSeats.splice(index, 1);
    } else {
        // 新規選択 (最大数制限)
        if (state.selectedSeats.length >= state.maxSeats) {
            alert(`一度に予約できるのは${state.maxSeats}席までです。`);
            return;
        }
        state.selectedSeats.push(id);
    }

    updateSelectedSeatsUI();

    // UI更新 (非効率だが確実)
    const el = document.querySelector(`.seat[data-id="${id}"]`);
    if (el) {
        el.classList.toggle('selected');
        // selectedクラスがつくとCSSで緑になるはず
        // ただし .status クラス (available) があるので、CSSの詳細度に注意
        // .seat.selected { ... } が .seat.available より優先される必要がある
    }
}

function toggleSeat(seatId, el) {
    const idx = state.selectedSeats.indexOf(seatId);
    if (idx >= 0) {
        // 選択解除
        state.selectedSeats.splice(idx, 1);
        el.classList.remove('selected');
    } else {
        // 選択追加
        if (state.selectedSeats.length >= state.maxSeats) {
            alert(`一度に予約できるのは最大${state.maxSeats}席までです。`);
            return;
        }
        state.selectedSeats.push(seatId);
        el.classList.add('selected');
    }
    updateSelectedSeatsUI();
}

function updateSelectedSeatsUI() {
    const display = document.getElementById('selected-seats-display');
    if (state.selectedSeats.length === 0) {
        display.innerText = 'なし';
        navigation.toStep3.disabled = true;
    } else {
        display.innerText = toDisplaySeatId(state.selectedSeats.join(', '));
        navigation.toStep3.disabled = false;
    }
    updateModalCount();
}

function updateModalCount() {
    const el = document.getElementById('modal-selected-count');
    if (el) el.innerText = state.selectedSeats.length;
}

navigation.toStep3.addEventListener('click', () => {
    // 確認画面へのセットアップ
    document.getElementById('conf-group').innerText = state.group;
    document.getElementById('conf-time').innerText = `${state.day}日目 ${state.timeslot}`;
    document.getElementById('conf-seats').innerText = toDisplaySeatId(state.selectedSeats.join(', '));
    showStep(3);
});


// ==========================================
// Step 3: 情報入力 & 送信
// ==========================================
document.getElementById('reservation-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!confirm('この内容で予約を確定しますか？')) return;

    // Validation
    const name = document.getElementById('res-name').value;
    const email = document.getElementById('res-email').value;
    const gradeClass = getGradeClassValue();
    const club = document.getElementById('res-club-select').value;

    if (!name || !email || !gradeClass || !club) {
        alert('必須項目が入力されていません。\n(お名前、メールアドレス、所属年組、所属部活)');
        return;
    }

    const btn = document.getElementById('btn-submit');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = '送信中...';

    const params = {
        action: 'create_reservation',
        group: state.group,
        day: state.day,
        timeslot: state.timeslot,
        seats: state.selectedSeats.join(','), // Array to CSV
        name: name,
        email: email,
        grade_class: gradeClass,
        club_affiliation: club,
        token: state.token // Admin Invite Token
    };

    try {
        const apiUrl = apiUrlManager.getCurrentUrl();
        console.log("Submitting via JSONP to:", apiUrl);

        fetchJsonp(apiUrl, params, (json) => {
            if (json.success) {
                // 完了画面へ
                document.getElementById('result-booking-id').innerText = json.data.bookingId;
                showStep(4);
            } else {
                alert('予約に失敗しました: ' + json.error);
                btn.disabled = false;
                btn.innerText = originalText;
            }
        });

    } catch (err) {
        console.error(err);
        alert('通信エラーが発生しました。');
        btn.disabled = false;
        btn.innerText = originalText;
    }
});

/**
 * JSONP Fetch Helper
 */
function fetchJsonp(url, params, callback) {
    const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
    window[callbackName] = function (data) {
        delete window[callbackName];
        document.body.removeChild(script);
        callback(data);
    };

    const script = document.createElement('script');

    // Construct query string
    const queryString = Object.keys(params)
        .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
        .join('&');

    script.src = `${url}?${queryString}&callback=${callbackName}`;
    script.onerror = function () {
        delete window[callbackName];
        document.body.removeChild(script);
        alert('APIへの接続に失敗しました (JSONP Error)');
    };

    document.body.appendChild(script);
}


// ==========================================
// 共通: ステップ切り替え
// ==========================================
function showStep(stepNum) {
    // コンテンツ切り替え
    Object.values(pages).forEach(el => el.classList.remove('active'));
    pages[stepNum].classList.add('active');

    // プログレスバー更新
    document.querySelectorAll('.progress-bar .step').forEach(el => {
        const num = parseInt(el.dataset.step);
        if (num <= stepNum) el.classList.add('active');
        else el.classList.remove('active');
    });

    // 上にスクロール
    window.scrollTo(0, 0);
}
