/**
 * reservation-status.js
 * 予約確認・QR表示用スクリプト
 */

import { apiUrlManager } from './config.js';
import { subscribeToSeatUpdates } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Check URL parameters for auto-login
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('id');
    const passcode = params.get('pass');

    if (bookingId && passcode) {
        document.getElementById('booking-id').value = bookingId;
        document.getElementById('passcode').value = passcode;
        fetchBookingDetails(bookingId, passcode);
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
        const seatStr = data.seats.map(s => `${s.seat_id}`).join(', ');
        document.getElementById('disp-seats').innerText = seatStr;
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
}

async function cancelBooking(id, passcode) {
    if (!confirm('本当に予約をキャンセルしますか？\nこの操作は取り消せません。')) return;

    const btn = document.getElementById('btn-cancel');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = '処理中...';

    const params = {
        action: 'cancel_reservation',
        id: id,
        passcode: passcode
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
        console.error(e);
        alert('通信エラーが発生しました');
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
