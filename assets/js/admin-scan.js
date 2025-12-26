/**
 * admin-scan.js
 * スタンドアローン QRスキャナー＆チェックイン
 */

import { apiUrlManager } from './config.js';
import { fetchMasterDataFromSupabase } from './supabase-client.js';

const state = {
    group: '',
    day: '',
    timeslot: '',
    scanner: null,
    isScanning: false,
    currentBooking: null
};

// UI Elements
const setupSection = document.getElementById('setup-section');
const scanSection = document.getElementById('scan-section');
const targetGroup = document.getElementById('target-group');
const targetDay = document.getElementById('target-day');
const targetTimeslot = document.getElementById('target-timeslot');

// Init
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Master Data
    await initializeMasterData();

    // 2. Setup inputs
    initSetup();

    // 3. Event Listeners
    document.getElementById('btn-change-mode').addEventListener('click', exitScanMode);

    // Tab switching
    document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    // Manual check
    document.getElementById('btn-manual-check').addEventListener('click', handleManualCheck);

    // Confirm actions
    document.getElementById('btn-confirm-checkin').addEventListener('click', executeCheckIn);
    document.getElementById('btn-cancel-checkin').addEventListener('click', hideResultModal);
});

let masterGroups = [];

function initSetup() {
    const inputs = {
        group: targetGroup,
        day: targetDay,
        timeslot: targetTimeslot,
        startBtn: document.getElementById('btn-start-scan')
    };

    // Group Change
    inputs.group.addEventListener('change', (e) => {
        state.group = e.target.value;
        state.day = '';
        state.timeslot = '';

        // Reset downstream
        inputs.day.innerHTML = '<option value="" disabled selected>読み込み中...</option>';
        inputs.day.disabled = true;
        inputs.timeslot.innerHTML = '<option value="" disabled selected>-</option>';
        inputs.timeslot.disabled = true;

        checkSetupValidity(inputs);
        fetchScannablePerformances(state.group, inputs);
    });

    // Day Change
    inputs.day.addEventListener('change', (e) => {
        state.day = e.target.value;
        state.timeslot = '';
        updateTimeslotOptionsForScan(inputs);
        checkSetupValidity(inputs);
    });

    // Timeslot Change
    inputs.timeslot.addEventListener('change', (e) => {
        state.timeslot = e.target.value;
        checkSetupValidity(inputs);
    });

    // Start Button
    inputs.startBtn.addEventListener('click', () => {
        if (!inputs.startBtn.disabled) {
            startScanMode();
        }
    });
}

function populateGroupSelect() {
    targetGroup.innerHTML = '<option value="" disabled selected>団体を選択してください</option>';
    masterGroups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.name;
        opt.textContent = g.name;
        targetGroup.appendChild(opt);
    });
}

async function initializeMasterData() {
    const result = await fetchMasterDataFromSupabase();

    if (result.success) {
        masterGroups = result.data.groups;
        populateGroupSelect();
    } else {
        console.error('Master Data Load Error:', result.error);
        targetGroup.innerHTML = '<option disabled selected>データ読み込み失敗</option>';
    }
}

function startScanMode() {
    setupSection.style.display = 'none';
    scanSection.style.display = 'block';

    // Update Header Info
    document.getElementById('disp-target-group').innerText = state.group;
    document.getElementById('disp-target-time').innerText = `${state.day}日目 / ${state.timeslot}時間帯`;

    // Start Camera by default (if active tab is camera)
    const activeTab = document.querySelector('.tab.active').dataset.tab;
    if (activeTab === 'camera') startScanner();
}

function exitScanMode() {
    stopScanner();
    setupSection.style.display = 'block';
    scanSection.style.display = 'none';
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`.tab[data-tab="${tabName}"]`).forEach(b => b.classList.add('active'));

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'camera') startScanner();
    else stopScanner();
}

// Scanner
function startScanner() {
    if (state.isScanning) return;
    const readerId = "reader";

    if (!state.html5QrcodeScanner) {
        state.html5QrcodeScanner = new Html5Qrcode(readerId);
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    state.html5QrcodeScanner.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanFailure
    ).then(() => {
        state.isScanning = true;
    }).catch(err => {
        console.error("Camera start failed", err);
        // alert('カメラの起動に失敗しました');
    });
}

function stopScanner() {
    if (state.html5QrcodeScanner && state.isScanning) {
        state.html5QrcodeScanner.stop().then(() => {
            state.isScanning = false;
        }).catch(err => console.error("Stop failed", err));
    }
}

function onScanSuccess(decodedText) {
    // Prevent multiple triggers if modal is open
    if (document.getElementById('result-overlay').style.display === 'flex') return;

    // Parse TICKET:{id}:{pass}
    let id, pass;
    if (decodedText.startsWith('TICKET:')) {
        const parts = decodedText.split(':');
        id = parts[1];
        pass = parts[2];
    } else if (!isNaN(decodedText)) {
        id = decodedText;
        pass = null;
    } else {
        return;
    }

    fetchBookingAndConfirm(id, pass);
}

function onScanFailure(error) {
    // ignore
}

// Check-In Logic
async function handleManualCheck() {
    const id = document.getElementById('manual-id').value;
    const pass = document.getElementById('manual-pass').value;
    if (!id) return;
    fetchBookingAndConfirm(id, pass);
}

async function fetchBookingAndConfirm(id, passcode) {
    // Show Loading in Modal
    showResultModal('照会中...', '<p>データを取得しています...</p>');
    state.currentBooking = null;

    try {
        const apiUrl = apiUrlManager.getCurrentUrl();
        // Since we need to support JSONP for GAS
        fetchJsonp(apiUrl, { action: 'get_booking_details', id, passcode: passcode || '' }, (json) => {
            if (json.success) {
                state.currentBooking = json.data;
                renderConfirmation(json.data);
            } else {
                showResultModal('エラー', `<p style="color:var(--danger)">${json.error || 'データが見つかりません'}</p>`);
                document.getElementById('btn-confirm-checkin').style.display = 'none';
            }
        });

    } catch (e) {
        showResultModal('エラー', '<p>通信エラーが発生しました</p>');
        document.getElementById('btn-confirm-checkin').style.display = 'none';
    }
}

function renderConfirmation(booking) {
    const perf = booking.performances || {};
    const seats = booking.seats ? booking.seats.map(s => s.seat_id).join(', ') : '-';

    // Status Logic
    const isTargetMatch = (perf.group_name === state.group && perf.timeslot === state.timeslot && perf.day == state.day);

    let html = `
        <div style="font-size:1.1rem; font-weight:bold; margin-bottom:0.5rem;">${booking.name} 様</div>
        <div style="font-size:0.9rem; color:var(--text-sub); margin-bottom:1rem;">
             ${booking.grade_class || ''} 
        </div>
        <div style="display:grid; grid-template-columns:auto 1fr; gap:0.5rem; font-size:0.95rem;">
            <div style="color:var(--text-sub)">公演:</div>
            <div>${perf.group_name} <br> ${perf.day}日目 ${perf.timeslot}</div>
            
            <div style="color:var(--text-sub)">座席:</div>
            <div style="font-weight:bold">${seats}</div>
            
            <div style="color:var(--text-sub)">状態:</div>
            <div>${getStatusBadge(booking.status)}</div>
        </div>
    `;

    if (!isTargetMatch) {
        html += `<div style="background:#fff3cd; color:#856404; padding:0.5rem; border-radius:4px; margin-top:10px; font-size:0.9rem;">
            ⚠ 公演日時が異なります (${perf.group_name} ${perf.timeslot})
        </div>`;
    }

    const btn = document.getElementById('btn-confirm-checkin');

    if (booking.status === 'checked_in') {
        html += `<div style="color:var(--primary); font-weight:bold; margin-top:10px;">既にチェックイン済みです</div>`;
        btn.style.display = 'none';
    } else if (booking.status === 'cancelled') {
        html += `<div style="color:var(--danger); font-weight:bold; margin-top:10px;">キャンセルされた予約です</div>`;
        btn.style.display = 'none';
    } else {
        btn.style.display = 'inline-block';
    }

    showResultModal('予約確認', html);
}

function showResultModal(title, contentHtml) {
    const overlay = document.getElementById('result-overlay');
    overlay.style.display = 'flex';
    document.getElementById('res-title').innerText = title;
    document.getElementById('res-content').innerHTML = contentHtml;
}

function hideResultModal() {
    document.getElementById('result-overlay').style.display = 'none';
    state.currentBooking = null;
}

function executeCheckIn() {
    if (!state.currentBooking) return;
    const booking = state.currentBooking;
    const btn = document.getElementById('btn-confirm-checkin');
    btn.disabled = true;
    btn.innerText = '送信中...';

    const apiUrl = apiUrlManager.getCurrentUrl();
    fetchJsonp(apiUrl, {
        action: 'check_in',
        id: booking.id,
        passcode: booking.passcode
    }, (json) => {
        btn.disabled = false;
        btn.innerText = 'チェックイン';

        if (json.success) {
            hideResultModal();
            showToast(`${booking.name} 様 チェックイン完了`);
        } else {
            alert('失敗: ' + json.error);
        }
    });
}

function showToast(msg) {
    const el = document.getElementById('toast');
    el.innerText = msg;
    el.style.display = 'block';
    // Animation handled by css, reset simply
    const newOne = el.cloneNode(true);
    el.parentNode.replaceChild(newOne, el);
    newOne.style.display = 'block';
}

function getStatusBadge(status) {
    const map = {
        'confirmed': '<span class="status-badge status-confirmed">予約済</span>',
        'checked_in': '<span class="status-badge status-checked_in">来場済</span>',
        'cancelled': '<span class="status-badge status-cancelled">無効</span>'
    };
    return map[status] || status;
}


// --- Helper / Logic Reuse ---

let performanceScanData = [];
async function fetchScannablePerformances(group, inputs) {
    try {
        const apiUrl = apiUrlManager.getCurrentUrl();
        fetchJsonp(apiUrl, { action: 'get_performances', group }, (json) => {
            if (json.success) {
                performanceScanData = json.data;
                const days = [...new Set(performanceScanData.map(p => p.day))].sort();

                inputs.day.innerHTML = '<option value="" disabled selected>日程を選択</option>';
                days.forEach(day => {
                    const option = document.createElement('option');
                    option.value = day;
                    option.textContent = `${day}日目`;
                    inputs.day.appendChild(option);
                });
                inputs.day.disabled = false;
            } else {
                alert('データ取得失敗');
            }
        });
    } catch (e) { console.error(e); }
}

function updateTimeslotOptionsForScan(inputs) {
    const day = parseInt(state.day);
    const timeslots = performanceScanData
        .filter(p => p.day == day)
        .map(p => p.timeslot)
        .sort();

    inputs.timeslot.innerHTML = '<option value="" disabled selected>時間を選択</option>';
    timeslots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot;
        option.textContent = slot; // Just show 'A', 'B' etc
        inputs.timeslot.appendChild(option);
    });
    inputs.timeslot.disabled = false;
}

function checkSetupValidity(inputs) {
    const isValid = state.group && state.day && state.timeslot;
    inputs.startBtn.disabled = !isValid;
}

// JSONP Helper
function fetchJsonp(url, params, callback) {
    const callbackName = 'jsonp_scan_' + Math.round(100000 * Math.random());
    window[callbackName] = function (data) {
        delete window[callbackName];
        document.body.removeChild(script);
        callback(data);
    };
    const script = document.createElement('script');
    const queryString = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    script.src = `${url}?${queryString}&callback=${callbackName}`;
    document.body.appendChild(script);
}
