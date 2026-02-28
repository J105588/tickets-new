/**
 * admin-scan.js
 * スタンドアローン QRスキャナー＆チェックイン (高速版)
 */

import { apiUrlManager } from './config.js';
import { fetchMasterDataFromSupabase, checkInReservation, getBookingForScan, toDisplaySeatId } from './supabase-client.js';

const state = {
    group: '',
    day: '',
    timeslot: '',
    scanner: null,
    isScanning: false,
    currentBooking: null
};

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

const globalLoader = document.getElementById('global-loader');
function showLoader() {
    if (globalLoader) globalLoader.style.display = 'flex';
}
function hideLoader() {
    if (globalLoader) globalLoader.style.display = 'none';
}

// UI Elements
const setupSection = document.getElementById('setup-section');
const scanSection = document.getElementById('scan-section');
const targetGroup = document.getElementById('target-group');
const targetDay = document.getElementById('target-day');
const targetTimeslot = document.getElementById('target-timeslot');

// Init
document.addEventListener('DOMContentLoaded', async () => {
    // 0. Session Check (Idle Timeout)
    const session = sessionStorage.getItem('admin_session');
    let lastActive = sessionStorage.getItem('admin_last_active');

    // Fallback
    if (session && !lastActive) {
        lastActive = new Date().getTime().toString();
        sessionStorage.setItem('admin_last_active', lastActive);
    }

    const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    const loginOverlay = document.getElementById('login-overlay');

    const showLoginOverlay = () => {
        if (loginOverlay) loginOverlay.style.display = 'flex';
    };

    const hideLoginOverlay = () => {
        if (loginOverlay) loginOverlay.style.display = 'none';
    };

    let isInitialized = false;
    async function updateActivityAndInit() {
        const updateActivity = () => {
            sessionStorage.setItem('admin_last_active', new Date().getTime().toString());
        };

        if (!isInitialized) {
            let activityThrottle = false;
            ['mousedown', 'keydown', 'touchstart'].forEach(evt => {
                document.addEventListener(evt, () => {
                    if (!activityThrottle) {
                        updateActivity();
                        activityThrottle = true;
                        setTimeout(() => activityThrottle = false, 10000);
                    }
                });
            });
            updateActivity();

            // 1. Master Data
            showLoader();
            await initializeMasterData();
            hideLoader();

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

            isInitialized = true;
        }
    }

    if (!session) {
        showLoginOverlay();
    } else {
        const now = new Date().getTime();
        if (now - parseInt(lastActive) > SESSION_TIMEOUT_MS) {
            alert('一定時間操作がなかったため、ログアウトしました。');
            sessionStorage.removeItem('admin_session');
            sessionStorage.removeItem('admin_verified_at');
            sessionStorage.removeItem('admin_last_active');
            showLoginOverlay();
        } else {
            updateActivityAndInit();
        }
    }

    // Login Form Handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const passwordInput = document.getElementById('admin-password');
            const password = passwordInput.value.trim();
            const btn = document.getElementById('btn-login');
            const errorMsg = document.getElementById('login-error-msg');

            if (!password) {
                alert('パスワードを入力してください');
                return;
            }

            btn.disabled = true;
            btn.innerText = '確認中...';
            errorMsg.style.display = 'none';
            errorMsg.innerText = '';

            try {
                const apiUrl = apiUrlManager.getCurrentUrl();
                showLoader();
                fetchJsonpLogin(apiUrl, { action: 'verify_admin_password', password: password }, async (res) => {
                    hideLoader();
                    if (res && res.success) {
                        sessionStorage.setItem('admin_session', 'active');
                        sessionStorage.setItem('admin_verified_at', new Date().toISOString());
                        sessionStorage.setItem('admin_last_active', new Date().getTime().toString());
                        btn.innerText = 'ログイン成功';
                        btn.style.background = '#10b981';
                        setTimeout(() => {
                            hideLoginOverlay();
                            updateActivityAndInit();
                        }, 500);
                    } else {
                        errorMsg.style.display = 'block';
                        errorMsg.innerText = res.error || 'パスワードが違います';
                        btn.disabled = false;
                        btn.innerText = 'ログイン';
                        passwordInput.value = '';
                        passwordInput.focus();
                    }
                });
            } catch (err) {
                hideLoader();
                errorMsg.style.display = 'block';
                errorMsg.innerText = 'System Error: ' + err.message;
                btn.disabled = false;
                btn.innerText = 'ログイン';
            }
        });
    }

    // Helper for JSONP Login
    function fetchJsonpLogin(url, params, callback, timeout = 10000) {
        const callbackName = 'jsonp_login_' + Math.round(100000 * Math.random());
        let isCompleted = false;
        window[callbackName] = function (data) {
            if (isCompleted) return;
            isCompleted = true;
            delete window[callbackName];
            const el = document.getElementById(callbackName);
            if (el) document.body.removeChild(el);
            callback(data);
        };
        const script = document.createElement('script');
        const queryString = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
        script.src = `${url}?${queryString}&callback=${callbackName}`;
        script.id = callbackName;
        script.onerror = () => {
            if (isCompleted) return;
            isCompleted = true;
            delete window[callbackName];
            const el = document.getElementById(callbackName);
            if (el) document.body.removeChild(el);
            callback({ success: false, error: 'Network Error (Script Load Failed)' });
        };
        document.body.appendChild(script);
        setTimeout(() => {
            if (!isCompleted) {
                isCompleted = true;
                delete window[callbackName];
                const el = document.getElementById(callbackName);
                if (el) document.body.removeChild(el);
                callback({ success: false, error: 'Request Timed Out (Backend may be sleeping or undeployed)' });
            }
        }, timeout);
    }

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

    const config = { fps: 15, qrbox: { width: 250, height: 250 } }; // FPS increased for speed

    state.html5QrcodeScanner.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanFailure
    ).then(() => {
        state.isScanning = true;
    }).catch(err => {
        console.error("Camera start failed", err);
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
    // Show Loading
    showResultModal('照会中...', '<div class="spinner"></div><p style="text-align:center">確認中...</p>');
    state.currentBooking = null;

    // Direct Supabase RPC Call (Fast)
    const result = await getBookingForScan(id, passcode);

    if (result.success) {
        state.currentBooking = result.data;
        renderConfirmation(result.data);
    } else {
        // Fallback to error
        // Fallback to error
        showResultModal('エラー', `<p style="color:var(--danger);text-align:center;font-weight:bold;font-size:1.2rem;">${result.error || 'データが見つかりません'}</p>`, 'error');
        document.getElementById('btn-confirm-checkin').style.display = 'none';

        // Auto-close error after 2s
        setTimeout(() => {
            if (document.getElementById('result-overlay').style.display === 'flex') {
                hideResultModal();
            }
        }, 2000);
    }
}

function renderConfirmation(booking) {
    const perf = booking.performances || {};
    // seats is now an array of objects from RPC
    const rawSeats = booking.seats && booking.seats.length > 0 ? booking.seats.map(s => s.seat_id).join(', ') : '-';
    const seats = toDisplaySeatId(rawSeats);

    // Status Logic
    const isTargetMatch = (perf.group_name === state.group && perf.timeslot === state.timeslot && perf.day == state.day);

    let html = `
        <div style="font-size:1.4rem; font-weight:800; margin-bottom:0.5rem; text-align:center;">${escapeHTML(booking.name)} 様</div>
        <div style="font-size:1rem; color:var(--text-sub); margin-bottom:1.5rem; text-align:center;">
             ${escapeHTML(booking.grade_class || '')} 
        </div>
        
        <div style="background:#f8fafc; padding:1rem; border-radius:12px; margin-bottom:1rem;">
             <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:8px;">
                <span style="color:var(--text-sub)">公演</span>
                <span style="font-weight:600">${escapeHTML(perf.group_name)}</span>
             </div>
             <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:8px;">
                <span style="color:var(--text-sub)">日時</span>
                <span style="font-weight:600">${perf.day}日目 ${perf.timeslot}</span>
             </div>
             <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span style="color:var(--text-sub)">座席</span>
                <span style="font-weight:800; font-size:1.2rem; color:var(--primary)">${seats}</span>
             </div>
        </div>
        
        <div style="text-align:center; margin-top:10px;">
            ${getStatusBadge(booking.status)}
        </div>
    `;

    const btn = document.getElementById('btn-confirm-checkin');

    // Reset buttons
    btn.className = 'btn-lg btn-success'; // Reset style
    btn.style.display = 'inline-block'; // Default to visible

    if (!isTargetMatch) {
        html += `<div style="background:#fee2e2; color:#b91c1c; padding:1.2rem; border-radius:8px; margin-top:15px; font-weight:bold; text-align:center; border:2px solid #ef4444;">
            <i class="fas fa-exclamation-triangle" style="font-size:1.5rem; margin-bottom:5px; display:block;"></i>
            公演情報が一致しません<br>
            <span style="font-size:0.9rem; color:#7f1d1d; display:block; margin-top:5px;">
                チケット: ${perf.group_name} ${perf.day}日目 ${perf.timeslot}<br>
                設定: ${state.group} ${state.day}日目 ${state.timeslot}
            </span>
        </div>`;
        btn.style.display = 'none'; // DISABLE CHECKIN for mismatch
        showResultModal('入場不可', html, 'error');
        // Auto-close error after 3s
        setTimeout(() => {
            const overlay = document.getElementById('result-overlay');
            // Only close if it's still the mismatch error (simple check)
            if (overlay.style.display === 'flex' && document.getElementById('res-title').innerText === '入場不可') {
                hideResultModal();
            }
        }, 3000);
        return;
    }

    if (booking.status === 'checked_in') {
        // Auto-close enabled for already checked-in (1.5s)
        renderSuccessState('既にチェックイン済みです', true);
        return;
    } else if (booking.status === 'cancelled') {
        html += `<div style="color:var(--danger); font-weight:bold; margin-top:10px; font-size:1.2rem; text-align:center;">キャンセルされた予約です</div>`;
        btn.style.display = 'none';
        showResultModal('エラー', html, 'error');
        // Auto-close error after 3s
        setTimeout(() => { if (state.currentBooking && state.currentBooking.id === booking.id) hideResultModal(); }, 3000);
    } else {
        btn.style.display = 'inline-block';
        showResultModal('予約確認', html, 'normal');
    }
}

async function executeCheckIn() {
    if (!state.currentBooking) return;
    const booking = state.currentBooking;
    const btn = document.getElementById('btn-confirm-checkin');

    btn.disabled = true;
    btn.innerText = '送信中...';
    showLoader();

    const result = await checkInReservation(booking.id, booking.passcode);
    hideLoader();

    btn.disabled = false;
    btn.innerText = 'チェックイン';

    if (result.success) {
        renderSuccessState('入場OK', true);
    } else {
        alert('失敗: ' + (result.error || '不明なエラー'));
    }
}


// --- Large Success UI ---
function renderSuccessState(msg, autoClose) {
    const html = `
        <div style="padding:2rem 0; text-align:center; animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
            <i class="fas fa-check-circle" style="font-size: 6rem; color: var(--success); margin-bottom: 20px; display:block;"></i>
            <div style="font-size: 2rem; font-weight: 800; color: var(--text-main); line-height:1.2;">${msg}</div>
        </div>
    `;

    // Hide buttons for pure success view
    document.getElementById('btn-confirm-checkin').style.display = 'none';
    document.getElementById('btn-cancel-checkin').style.display = 'none';

    showResultModal('', html, 'success'); // No title needed for big icon

    if (autoClose) {
        setTimeout(() => {
            hideResultModal();
            // Restore buttons for next time
            document.getElementById('btn-confirm-checkin').style.display = 'inline-block';
            document.getElementById('btn-cancel-checkin').style.display = 'inline-block';
        }, 1500); // 1.5s Close
    }
}


function showResultModal(title, contentHtml, type = 'normal') {
    const overlay = document.getElementById('result-overlay');
    const card = overlay.querySelector('.result-card');

    // Reset classes
    card.classList.remove('success', 'error', 'warning');
    if (type !== 'normal') {
        card.classList.add(type);
    }

    overlay.style.display = 'flex';
    document.getElementById('res-title').innerText = title;
    document.getElementById('res-content').innerHTML = contentHtml;
}

function hideResultModal() {
    document.getElementById('result-overlay').style.display = 'none';
    state.currentBooking = null;

    // Reset card classes
    const card = document.querySelector('#result-overlay .result-card');
    card.classList.remove('success', 'error', 'warning');

    // Restore buttons
    document.getElementById('btn-confirm-checkin').style.display = 'inline-block';
    document.getElementById('btn-cancel-checkin').style.display = 'inline-block';
}


function getStatusBadge(status) {
    // Larger badges for scanner
    const map = {
        'confirmed': '<span class="status-badge status-confirmed" style="font-size:1.1rem; padding:6px 16px;">予約済</span>',
        'checked_in': '<span class="status-badge status-checked_in" style="font-size:1.1rem; padding:6px 16px;">入場済</span>',
        'cancelled': '<span class="status-badge status-cancelled" style="font-size:1.1rem; padding:6px 16px;">無効</span>'
    };
    return map[status] || status;
}


// --- Helper / Logic Reuse ---

let performanceScanData = [];
async function fetchScannablePerformances(group, inputs) {
    try {
        const apiUrl = apiUrlManager.getCurrentUrl();
        showLoader();
        fetchJsonp(apiUrl, { action: 'get_performances', group }, (json) => {
            hideLoader();
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
    } catch (e) { hideLoader(); console.error(e); }
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

// JSONP Helper (Still needed for performance fetching via GAS if not ported yet)
// JSONP Helper (Still needed for performance fetching via GAS if not ported yet)
function fetchJsonp(url, params, callback, timeout = 10000) {
    const callbackName = 'jsonp_scan_' + Math.round(100000 * Math.random());
    let isCompleted = false;
    window[callbackName] = function (data) {
        if (isCompleted) return;
        isCompleted = true;
        delete window[callbackName];
        if (script.parentNode) document.body.removeChild(script);
        callback(data);
    };
    const script = document.createElement('script');
    const queryString = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    script.src = `${url}?${queryString}&callback=${callbackName}`;
    script.id = callbackName;
    script.onerror = () => {
        if (isCompleted) return;
        isCompleted = true;
        delete window[callbackName];
        if (script.parentNode) document.body.removeChild(script);
        callback({ success: false, error: 'Network Error (Script Load Failed)' });
    };
    document.body.appendChild(script);
    setTimeout(() => {
        if (!isCompleted) {
            isCompleted = true;
            delete window[callbackName];
            if (script.parentNode) document.body.removeChild(script);
            callback({ success: false, error: 'Request Timed Out' });
        }
    }, timeout);
}
