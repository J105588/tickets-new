/**
 * reservation-status.js
 * 予約確認・QR表示用スクリプト
 */

import { apiUrlManager } from './config.js';
import { subscribeToSeatUpdates, subscribeToReservationUpdates, getBookingForScan, toDisplaySeatId } from './supabase-client.js';


function initReservationStatus() {
    // 1. Check URL parameters for auto-login
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('id');
    const passcode = params.get('pass');

    const idInput = document.getElementById('booking-id');
    const passInput = document.getElementById('passcode');

    // Reset inputs first to prevent browser autofill/restoration artifacts
    if (idInput) idInput.value = '';
    if (passInput) passInput.value = '';

    if (bookingId && passcode) {
        if (idInput) idInput.value = bookingId;
        if (passInput) passInput.value = passcode;
        fetchBookingDetails(bookingId, passcode);
    }
}

document.addEventListener('DOMContentLoaded', initReservationStatus);

// Handle BFCache (Back-Forward Cache) restores
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        initReservationStatus();
    }
});

// Login Form Submit
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('booking-id').value;
    const pass = document.getElementById('passcode').value;
    fetchBookingDetails(id, pass);
});

async function fetchBookingDetails(id, passcode) {
    const btn = document.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = '確認中...';

    try {
        const apiUrl = apiUrlManager.getCurrentUrl();
        // Use JSONP for GET request as well to avoid CORS issues completely
        const params = {
            action: 'get_booking_details',
            id: id,
            passcode: passcode
        };

        fetchJsonp(apiUrl, params, (json) => {
            if (json.success) {
                showDetails(json.data);
            } else {
                alert('確認失敗: ' + (json.error || '情報が見つかりません'));
                btn.disabled = false;
                btn.innerText = '確認する';
            }
        });

    } catch (e) {
        console.error(e);
        alert('通信エラーが発生しました');
        btn.disabled = false;
        btn.innerText = '確認する';
    }
}

function showDetails(data) {
    // Hide login, show details
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('details-section').style.display = 'block';

    // Populate Data
    document.getElementById('disp-program-name').innerText = data.performances?.group_name || '公演予約';
    document.getElementById('disp-id').innerText = data.id;
    document.getElementById('disp-passcode').innerText = data.passcode;

    // Status Badge
    const badge = document.getElementById('status-badge');
    badge.className = `badge status-${data.status.replace('_', '-')}`;
    badge.innerText = getStatusText(data.status);

    // User Info
    document.getElementById('disp-name').innerText = data.name;
    document.getElementById('disp-affiliation').innerText =
        `${data.grade_class || ''} ${data.club_affiliation || ''}`;

    // Seats
    if (data.seats && data.seats.length > 0) {
        const rawSeats = data.seats.map(s => s.seat_id).join(', ');
        document.getElementById('disp-seats').innerText = toDisplaySeatId(rawSeats);
    }

    // Datetime
    if (data.performances) {
        document.getElementById('disp-datetime').innerText =
            `${data.performances.day}日目 ${data.performances.timeslot} (09:00〜)`;
    }

    // QR Code Generation
    // QR Content: JSON string {id: 123, pass: "1234"} or just ID?
    // Security: Only ID allows anyone to create a generic QR. 
    // Including passcode verifies the QR is legitimate from the user.
    // However, the admin scanner only needs ID to find the record, 
    // and then the ADMIN validates the person.
    // Let's encode: "TICKET:{id}:{passcode}"
    const qrContent = `TICKET:${data.id}:${data.passcode}`;

    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: qrContent,
        width: 180,
        height: 180
    });
    // Cancel Button
    const cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) {
        if (data.status === 'confirmed') {
            cancelBtn.style.display = 'inline-block';
            cancelBtn.onclick = () => cancelBooking(data.id, data.passcode);
        } else {
            cancelBtn.style.display = 'none';
        }
    }
    // Subscribe to Realtime Updates
    if (data.id) {
        subscribeToSeatUpdates(data.id, (newSeat) => {
            console.log('Seat update:', newSeat);
            if (newSeat.status === 'checked_in') {
                updateUIAsCheckedIn();
            }
        });

        subscribeToReservationUpdates(data.id, (newBooking) => {
            console.log('Booking update:', newBooking);
            if (newBooking.status === 'checked_in') {
                updateUIAsCheckedIn();
            } else if (newBooking.status === 'cancelled') {
                updateUIAsCancelled();
            }
        });

        // POLLING FALLBACK: Check every 3 seconds "pseudo-instantly"
        // This ensures updates even if WebSocket drops or is blocked
        const pollingInterval = setInterval(async () => {
            // Stop polling if already checked in (UI updated)
            if (document.getElementById('status-badge').className.includes('checked_in')) {
                clearInterval(pollingInterval);
                return;
            }

            const res = await getBookingForScan(data.id);
            if (res.success && res.data.status === 'checked_in') {
                updateUIAsCheckedIn();
                clearInterval(pollingInterval);
            }
        }, 3000);
    }

    // Initial check
    if (data.status === 'checked_in') {
        updateUIAsCheckedIn();
    } else if (data.status === 'cancelled') {
        updateUIAsCancelled();
    }
}


function updateUIAsCancelled() {
    const badge = document.getElementById('status-badge');
    badge.className = 'badge status-cancelled';
    badge.innerText = 'キャンセル';

    // Replace QR with Cross mark
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = `
        <div style="text-align: center; color: var(--danger, #ef4444); animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
            <i class="fas fa-times-circle" style="font-size: 5rem; margin-bottom: 10px;"></i>
            <div style="font-weight:bold; font-size:1.2rem; color:var(--text-color);">無効な予約</div>
        </div>
    `;

    // Update helper text
    const note = document.querySelector('.qr-note');
    if (note) note.style.display = 'none';

    // Hide cancel button
    const cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) cancelBtn.style.display = 'none';
}

function updateUIAsCheckedIn() {
    const badge = document.getElementById('status-badge');
    badge.className = 'badge status-checked-in';
    badge.innerText = 'チェックイン済';

    // Replace QR with Checkmark
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = `
        <div style="text-align: center; color: var(--success, #10b981); animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
            <i class="fas fa-check-circle" style="font-size: 5rem; margin-bottom: 10px;"></i>
            <div style="font-weight:bold; font-size:1.2rem; color:var(--text-color);">チェックイン完了</div>
        </div>
    `;

    // Update helper text
    const note = document.querySelector('.qr-note');
    if (note) note.style.display = 'none';

    // Hide cancel button
    const cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) cancelBtn.style.display = 'none';
}



async function cancelBooking(id, passcode) {
    if (!confirm('本当に予約をキャンセルしますか？\nこの操作は取り消せません。')) return;

    const btn = document.getElementById('btn-cancel');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = '処理中...';

    // 1. Collect Metadata
    let ip = 'unknown';
    const userAgent = navigator.userAgent;

    try {
        const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
        if (ipRes.ok) {
            const ipData = await ipRes.json();
            ip = ipData.ip;
        }
    } catch (e) {
        console.warn('Failed to fetch IP:', e);
    }

    const params = {
        action: 'cancel_reservation',
        id: id,
        passcode: passcode,
        ip: ip,
        user_agent: userAgent
    };

    try {
        const apiUrl = apiUrlManager.getCurrentUrl();
        fetchJsonp(apiUrl, params, (json) => {
            if (json.success) {
                alert('予約をキャンセルしました。');
                location.reload();
            } else {
                alert('キャンセル失敗: ' + (json.error || '不明なエラー'));
                btn.disabled = false;
                btn.innerText = originalText;
            }
        });
    } catch (e) {
        console.error('API Error:', e);
        alert('通信エラーが発生しました。もう一度お試しください。');
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

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

function getStatusText(status) {
    switch (status) {
        case 'confirmed': return '予約確定';
        case 'checked_in': return 'チェックイン済';
        case 'cancelled': return 'キャンセル';
        default: return status;
    }
}
