/**
 * reservation.js
 * 予約フローを制御するスクリプト
 */

import { apiUrlManager } from './config.js';

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
    initStep1();
});

let masterGroups = [];

async function initializeMasterData() {
    try {
        const apiUrl = apiUrlManager.getCurrentUrl();
        const url = `${apiUrl}?action=get_master_data`;
        const response = await fetch(url);
        const json = await response.json();

        if (json.success) {
            masterGroups = json.data.groups;
            populateGroupSelect();
        } else {
            console.error('Master Data Load Error:', json.error);
            // Fallback: Show error in select
            document.getElementById('group-select').innerHTML = '<option disabled selected>データの読み込みに失敗しました</option>';
        }
    } catch (e) {
        console.error(e);
        document.getElementById('group-select').innerHTML = '<option disabled selected>通信エラー発生</option>';
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
}

function checkStep1Validity() {
    const isValid = state.group && state.day && state.timeslot;
    navigation.toStep2.disabled = !isValid;
}

// 公演データキャッシュ
let performanceData = [];

async function fetchPerformances(group) {
    try {
        const apiUrl = apiUrlManager.getCurrentUrl();
        const url = `${apiUrl}?action=get_performances&group=${encodeURIComponent(group)}`;
        const response = await fetch(url);
        const json = await response.json();

        if (json.success) {
            performanceData = json.data;
            updateDayOptions();
        } else {
            alert('公演データの取得に失敗しました: ' + json.error);
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
        // API呼び出し (GAS Web App)
        // 注意: api.jsが実装されている前提、なければfetchを直書き
        const apiUrl = apiUrlManager.getCurrentUrl(); // config.jsから取得
        const url = `${apiUrl}?action=get_seats&group=${encodeURIComponent(state.group)}&day=${state.day}&timeslot=${state.timeslot}`;

        const response = await fetch(url);
        const json = await response.json();

        if (!json.success) throw new Error(json.error || 'データ取得失敗');

        renderSeatMap(json.data); // dataは座席オブジェクトのマップまたは配列

    } catch (e) {
        console.error(e);
        alert('座席データの読み込みに失敗しました。');
    } finally {
        loadingSpinner.style.display = 'none';
    }
}

function renderSeatMap(seatMap) {
    // 簡易的な座席マップ描画 (seats-main.jsからロジックを借用・簡易化)
    // ここでは単純にA-E列などを並べる実装例

    // データが配列かオブジェクトか確認
    const seats = Array.isArray(seatMap) ? seatMap : Object.values(seatMap);

    // 行ごとにグループ化
    const rows = {};
    seats.forEach(seat => {
        // seat.id (A1) -> row A
        const row = seat.id.charAt(0);
        if (!rows[row]) rows[row] = [];
        rows[row].push(seat);
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'seat-layout-wrapper';
    wrapper.style.textAlign = 'center';
    wrapper.style.padding = '20px';

    Object.keys(rows).sort().forEach(rowKey => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'seat-row';
        rowDiv.style.marginBottom = '10px';

        // 座席番号順にソート
        rows[rowKey].sort((a, b) => {
            const numA = parseInt(a.id.substring(1));
            const numB = parseInt(b.id.substring(1));
            return numA - numB;
        });

        rows[rowKey].forEach(seat => {
            const seatEl = document.createElement('div');
            seatEl.className = `seat ${seat.status}`;
            seatEl.dataset.id = seat.id;
            seatEl.innerText = seat.id;
            seatEl.style.display = 'inline-block';
            seatEl.style.width = '30px';
            seatEl.style.height = '30px';
            seatEl.style.margin = '2px';
            seatEl.style.fontSize = '10px';
            seatEl.style.lineHeight = '30px';
            seatEl.style.border = '1px solid #ccc';
            seatEl.style.borderRadius = '4px';
            seatEl.style.cursor = 'pointer';

            // スタイル適用 (cssクラスに依存)
            // .seat.available { background: white; }
            // .seat.reserved { background: yellow; }

            if (seat.status === 'available') {
                seatEl.onclick = () => toggleSeat(seat.id, seatEl);
            } else {
                seatEl.style.opacity = '0.5';
                seatEl.style.cursor = 'not-allowed';
            }

            rowDiv.appendChild(seatEl);
        });
        wrapper.appendChild(rowDiv);
    });

    seatMapContainer.appendChild(wrapper);
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

    const btn = document.getElementById('btn-submit');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = '送信中...';

    const formData = {
        action: 'create_reservation', // GAS側の分岐用
        group: state.group,
        day: state.day,
        timeslot: state.timeslot,
        seats: state.selectedSeats,
        name: document.getElementById('res-name').value,
        email: document.getElementById('res-email').value,
        grade_class: document.getElementById('res-grade').value,
        club_affiliation: document.getElementById('res-club').value
    };

    try {
        const apiUrl = apiUrlManager.getCurrentUrl();
        const response = await fetch(apiUrl, {
            method: 'POST',
            body: JSON.stringify(formData) // POST payload
        });
        const json = await response.json();

        if (json.success) {
            // 完了画面へ
            document.getElementById('result-booking-id').innerText = json.data.bookingId; // APIが返すID
            showStep(4);
        } else {
            alert('予約に失敗しました: ' + json.error);
            btn.disabled = false;
            btn.innerText = originalText;
        }
    } catch (err) {
        console.error(err);
        alert('通信エラーが発生しました。');
        btn.disabled = false;
        btn.innerText = originalText;
    }
});


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
