/**
 * reservation-status.js
 * 予約確認・QR表示用スクリプト
 */

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
        const url = `${apiUrl}?action=get_booking_details&id=${id}&passcode=${passcode}`;

        const response = await fetch(url);
        const json = await response.json();

        if (json.success) {
            showDetails(json.data);
        } else {
            alert('確認失敗: ' + (json.error || '情報が見つかりません'));
            btn.disabled = false;
            btn.innerText = '確認する';
        }
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
}

function getStatusText(status) {
    switch (status) {
        case 'confirmed': return '予約確定';
        case 'checked_in': return 'チェックイン済';
        case 'cancelled': return 'キャンセル';
        default: return status;
    }
}
