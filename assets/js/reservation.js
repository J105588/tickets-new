/**
 * reservation.js
 * 予約フローを制御するスクリプト
 */

import { apiUrlManager } from './config.js';
import { fetchMasterDataFromSupabase, fetchPerformancesFromSupabase, fetchSeatsFromSupabase } from './supabase-client.js';

// 状態管理
const state = {
    group: '',
    day: '',
    timeslot: '',
    selectedSeats: [], // Array of seat IDs
    maxSeats: 5 // 1回の予約で選択できる最大数
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
    await initializeMasterData();
    populateFormDropdowns();
    initStep1();
});

let masterGroups = [];

async function initializeMasterData() {
    // Supabaseからマスターデータ取得
    const result = await fetchMasterDataFromSupabase();

    if (result.success) {
        masterGroups = result.data.groups;
        populateGroupSelect();
    } else {
        console.error('Master Data Load Error:', result.error);
        document.getElementById('group-select').innerHTML = '<option disabled selected>データの読み込みに失敗しました</option>';
    }
}

function populateGroupSelect() {
    const select = document.getElementById('group-select');
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
        loadSeatMap();
        showStep(2);
    });

    document.getElementById('btn-back-to-step-1').addEventListener('click', () => {
        showStep(1);
    });

    document.getElementById('btn-back-to-step-2').addEventListener('click', () => {
        showStep(2);
    });
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
    const days = [...new Set(performanceData.map(p => p.day))].sort();

    inputs.day.innerHTML = '<option value="" disabled selected>日程を選択してください</option>';
    days.forEach(day => {
        const option = document.createElement('option');
        option.value = day;
        option.textContent = `${day}日目`;
        inputs.day.appendChild(option);
    });

    inputs.day.disabled = false;
}

function updateTimeslotOptions() {
    const day = parseInt(state.day);
    const timeslots = performanceData
        .filter(p => p.day == day)
        .map(p => p.timeslot)
        .sort();

    inputs.timeslot.innerHTML = '<option value="" disabled selected>時間帯を選択してください</option>';
    timeslots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot;
        option.textContent = `${slot}時間帯 (${getTimeString(slot)})`;
        inputs.timeslot.appendChild(option);
    });

    inputs.timeslot.disabled = false;
}

function getTimeString(timeslot) {
    const map = { 'A': '09:00~', 'B': '11:00~', 'C': '13:00~', 'D': '15:00~', 'E': '17:00~' };
    return map[timeslot] || '';
}

// ==========================================
// Step 2: 座席選択
// ==========================================

const seatMapContainer = document.getElementById('seat-map-container');
const loadingSpinner = document.getElementById('loading-spinner');

async function loadSeatMap() {
    loadingSpinner.style.display = 'block';
    seatMapContainer.innerHTML = ''; // Clear previous
    seatMapContainer.appendChild(loadingSpinner);
    state.selectedSeats = [];
    updateSelectedSeatsUI();



    try {
        // 直接Supabaseから座席データを取得
        const result = await fetchSeatsFromSupabase(state.group, state.day, state.timeslot);

        if (!result.success) throw new Error(result.error || 'データ取得失敗');

        // データ形式の変換（必要なら）
        // renderSeatMapは { seat_id, status, ... } の配列を期待していると仮定
        renderSeatMap(result.data);

    } catch (e) {
        console.error(e);
        alert('座席データの読み込みに失敗しました: ' + e.message);
    } finally {
        loadingSpinner.style.display = 'none';
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
    seatSection.style.minWidth = 'fit-content'; // コンテンツ幅に合わせる
    seatSection.style.margin = '0 auto';       // 中央寄せ
    seatSection.style.padding = '20px';

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
                passage.style.width = '30px'; // 通路幅
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

    container.appendChild(seatSection);
}

function createSeatElement(seat) {
    const seatEl = document.createElement('div');
    seatEl.className = `seat ${seat.status}`;
    // 自身の選択状態を反映
    if (state.selectedSeats.includes(seat.seat_id)) {
        seatEl.classList.add('selected');
    }

    seatEl.dataset.id = seat.seat_id;
    seatEl.innerText = seat.seat_id; // ID全体を表示 (A1, A2...)

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
        display.innerText = state.selectedSeats.join(', ');
        navigation.toStep3.disabled = false;
    }
}

navigation.toStep3.addEventListener('click', () => {
    // 確認画面へのセットアップ
    document.getElementById('conf-group').innerText = state.group;
    document.getElementById('conf-time').innerText = `${state.day}日目 ${state.timeslot}`;
    document.getElementById('conf-seats').innerText = state.selectedSeats.join(', ');
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
        club_affiliation: club
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
