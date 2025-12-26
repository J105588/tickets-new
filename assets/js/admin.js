/**
 * admin.js
 * 予約管理ダッシュボードのロジック
 */

import { apiUrlManager, SUPABASE_CONFIG } from './config.js';
import { fetchMasterGroups } from './supabase-client.js';

let currentReservations = [];
let selectedBooking = null;

document.addEventListener('DOMContentLoaded', async () => {
    // マスタデータ読み込み
    await loadFilterOptions();
    // 初期検索
    applyFilters();
});

// フィルタオプションの読み込み
async function loadFilterOptions() {
    const groupSelect = document.getElementById('filter-group');
    const groups = await fetchMasterGroups();

    groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.name;
        opt.innerText = g.name;
        groupSelect.appendChild(opt);
    });
}

// データ検索
window.applyFilters = function () {
    const group = document.getElementById('filter-group').value;
    const day = document.getElementById('filter-date').value;
    const year = document.getElementById('filter-year').value;

    fetchReservations({ group, day, year });
};

window.refreshData = function () {
    applyFilters();
};

function fetchReservations(filters) {
    const tbody = document.getElementById('reservation-table-body');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">読み込み中...</td></tr>';

    const params = {
        action: 'admin_get_reservations',
        ...filters
    };

    const apiUrl = apiUrlManager.getCurrentUrl();

    fetchJsonp(apiUrl, params, (json) => {
        if (json.success) {
            currentReservations = json.data;
            renderTable(json.data);
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">エラー: ${json.error}</td></tr>`;
        }
    });
}

function renderTable(data) {
    const tbody = document.getElementById('reservation-table-body');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">予約が見つかりません</td></tr>';
        return;
    }

    data.forEach(item => {
        const perf = item.performances || {};
        const seats = item.seats ? item.seats.map(s => s.seat_id).join(', ') : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${item.id}</td>
            <td>
                <div style="font-weight:600">${item.name}</div>
                <div style="font-size:0.85rem; color:#666">${item.email}</div>
            </td>
            <td>
                <div>${item.grade_class || '-'}</div>
                <div style="font-size:0.85rem; color:#666">${item.club_affiliation || ''}</div>
            </td>
            <td>
                <div>${perf.group_name || '-'}</div>
                <div style="font-size:0.85rem; color:#666">${perf.day}日目 ${perf.timeslot}</div>
            </td>
            <td>${seats}</td>
            <td>${getStatusBadge(item.status)}</td>
            <td>
                <button class="btn-icon action-edit-btn" type="button"><i class="fas fa-edit"></i></button>
            </td>
        `;

        // Direct Event Attachment
        const editBtn = tr.querySelector('.action-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                openDetail(item.id);
            });
        }

        tbody.appendChild(tr);
    });
}
// Removed delegated listener


function getStatusBadge(status) {
    switch (status) {
        case 'confirmed': return '<span class="badge bg-green">予約済</span>';
        case 'checked_in': return '<span class="badge bg-blue">入場済</span>';
        case 'cancelled': return '<span class="badge bg-red">キャンセル</span>';
        default: return `<span class="badge">${status}</span>`;
    }
}

// 詳細モーダル
// 詳細モーダル
function openDetail(id) {
    selectedBooking = currentReservations.find(r => r.id == id);
    if (!selectedBooking) return;

    const perf = selectedBooking.performances || {};
    const seats = selectedBooking.seats ? selectedBooking.seats.map(s => s.seat_id).join(', ') : '-';
    const notes = selectedBooking.notes || '';

    // Render as inputs but disabled initially
    const html = `
        <div class="detail-grid" style="display:grid; grid-template-columns: 1fr 2fr; gap: 10px; margin-bottom: 20px;">
            <div style="color:#666; display:flex; align-items:center;">ID</div>
            <div style="font-weight:bold">#${selectedBooking.id} <small>(${selectedBooking.passcode})</small></div>
            
            <div style="color:#666; display:flex; align-items:center;">ステータス</div>
            <div>${getStatusBadge(selectedBooking.status)}</div>
            
            <label for="edit-name" style="color:#666; display:flex; align-items:center;">氏名</label>
            <input type="text" id="edit-name" class="form-control" value="${selectedBooking.name}" disabled>
            
            <label for="edit-email" style="color:#666; display:flex; align-items:center;">メール</label>
            <input type="email" id="edit-email" class="form-control" value="${selectedBooking.email}" disabled>
            
            <label for="edit-grade" style="color:#666; display:flex; align-items:center;">学年・クラス</label>
            <input type="text" id="edit-grade" class="form-control" value="${selectedBooking.grade_class || ''}" disabled placeholder="例: 1-1">
            
            <label for="edit-club" style="color:#666; display:flex; align-items:center;">所属（部活等）</label>
            <input type="text" id="edit-club" class="form-control" value="${selectedBooking.club_affiliation || ''}" disabled>
            
            <hr style="grid-column: 1/-1; width:100%; border:0; border-top:1px solid #eee; margin:10px 0;">
            
            <div style="color:#666">公演</div>
            <div>${perf.group_name} (${perf.day}日目 ${perf.timeslot})</div>
            
            <div style="color:#666">座席</div>
            <div>${seats}</div>
            
            <label for="edit-notes" style="color:#666; display:flex; align-items:center;">メモ</label>
            <textarea id="edit-notes" class="form-control" disabled rows="3">${notes}</textarea>
        </div>
    `;

    document.getElementById('modal-body').innerHTML = html;

    // reset buttons
    document.getElementById('btn-edit-toggle').style.display = 'inline-block';
    document.getElementById('btn-save-changes').style.display = 'none';

    document.getElementById('detail-modal').classList.add('active');
};

function closeModal() {
    document.getElementById('detail-modal').classList.remove('active');
    selectedBooking = null;
    // Reset edit mode state if needed
};

// 編集モード切替
function toggleEditMode() {
    const inputs = document.querySelectorAll('#modal-body input, #modal-body textarea');
    const isEditing = !inputs[0].disabled;

    if (isEditing) {
        // Cancel editing (re-render or just disable)
        openDetail(selectedBooking.id); // Re-render to reset values
    } else {
        // Enable editing
        inputs.forEach(input => input.disabled = false);
        document.getElementById('edit-name').focus();
        document.getElementById('btn-edit-toggle').innerText = 'キャンセル';
        document.getElementById('btn-save-changes').style.display = 'inline-block';
    }
};

function saveChanges() {
    if (!selectedBooking) return;

    const updates = {
        name: document.getElementById('edit-name').value,
        email: document.getElementById('edit-email').value,
        grade_class: document.getElementById('edit-grade').value,
        club_affiliation: document.getElementById('edit-club').value,
        notes: document.getElementById('edit-notes').value
    };

    if (!updates.name) return alert('名前は必須です');

    const btn = document.getElementById('btn-save-changes');
    btn.innerText = '保存中...';
    btn.disabled = true;

    callApi('admin_update_reservation', { id: selectedBooking.id, ...updates }, (res) => {
        if (res.success) {
            alert('保存しました');
            closeModal();
            refreshData(); // Refresh table to show changes
        } else {
            alert('保存失敗: ' + res.error);
            btn.innerText = '変更を保存';
            btn.disabled = false;
        }
    });
};

// アクション
function resendEmail() {
    if (!selectedBooking) return;
    if (!confirm('確認メールを再送しますか？')) return;

    const btn = window.event ? window.event.target : document.activeElement;
    const org = btn.innerText;
    btn.innerText = '送信中...';
    btn.disabled = true;

    callApi('admin_resend_email', { id: selectedBooking.id }, (res) => {
        alert(res.success ? 'メールを再送しました' : '送信失敗: ' + res.error);
        btn.innerText = org;
        btn.disabled = false;
    });
};

function confirmCancel() {
    if (!selectedBooking) return;
    if (selectedBooking.status === 'cancelled') return alert('既にキャンセルされています');
    if (!confirm('本当に予約を取り消しますか？\n（強制キャンセル）')) return;

    callApi('admin_cancel_reservation', { id: selectedBooking.id }, (res) => {
        if (res.success) {
            alert('キャンセルしました');
            closeModal();
            refreshData();
        } else {
            alert('失敗: ' + res.error);
        }
    });
};

// 座席変更関連
let selectedNewSeats = [];

function openSeatChangeModal() {
    if (!selectedBooking) return;
    const perf = selectedBooking.performances;

    document.getElementById('seat-modal').classList.add('active');
    document.getElementById('seat-map-container').innerHTML = '<div style="text-align:center; padding:20px;">座席データ読み込み中...</div>';
    selectedNewSeats = [];
    updateNewSeatsUI();

    callApi('get_seats', {
        group: perf.group_name,
        day: perf.day,
        timeslot: perf.timeslot
    }, (res) => {
        if (res.success) {
            renderSeatMap(res.seatMap);
        } else {
            document.getElementById('seat-map-container').innerHTML = `<div style="color:red;text-align:center;">エラー: ${res.error}</div>`;
        }
    });
};

function closeSeatModal() {
    document.getElementById('seat-modal').classList.remove('active');
};

function renderSeatMap(seatMap) {
    const container = document.getElementById('seat-map-container');
    container.innerHTML = '';

    const seats = Object.values(seatMap);
    const rows = {};

    seats.forEach(seat => {
        const id = seat.id || seat.seat_id;
        const match = id.match(/^([A-Z]+)(\d+)$/);
        if (match) {
            const rowLabel = match[1];
            const seatNumber = parseInt(match[2]);
            if (!rows[rowLabel]) rows[rowLabel] = [];
            rows[rowLabel].push({ ...seat, seatNumber, id });
        }
    });

    const seatSection = document.createElement('div');
    seatSection.className = 'seat-section';
    seatSection.style.minWidth = 'fit-content';
    seatSection.style.margin = '0 auto';

    const sortedRows = Object.keys(rows).sort();
    sortedRows.forEach(rowLabel => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'seat-row';
        rowDiv.style.display = 'flex';
        rowDiv.style.justifyContent = 'center';
        rowDiv.style.marginBottom = '10px';

        const sortedSeats = rows[rowLabel].sort((a, b) => a.seatNumber - b.seatNumber);

        sortedSeats.forEach(seat => {
            const seatEl = document.createElement('div');
            let statusClass = seat.status;

            // Highlight my current seats
            const isMySeat = selectedBooking.seats.some(s => s.seat_id === seat.id);
            if (isMySeat) {
                statusClass = 'my-seat';
                seatEl.style.border = '2px solid blue'; // visible indicator
            }

            seatEl.className = `seat ${statusClass}`;
            seatEl.innerText = seat.id;
            seatEl.dataset.id = seat.id;

            if (statusClass === 'available') {
                seatEl.style.cursor = 'pointer';
                seatEl.onclick = () => handleSeatClick(seat, seatEl);
            } else {
                seatEl.style.cursor = 'default';
                seatEl.style.opacity = isMySeat ? '1' : '0.5';
            }

            rowDiv.appendChild(seatEl);

            if (seat.seatNumber === 13 || seat.seatNumber === 25) {
                const p = document.createElement('div');
                p.style.width = '30px';
                rowDiv.appendChild(p);
            }
        });
        seatSection.appendChild(rowDiv);
        if (rowLabel === 'F') { // Horizontal aisle
            const p = document.createElement('div'); p.style.height = '30px';
            seatSection.appendChild(p);
        }
    });
    container.appendChild(seatSection);
}

function handleSeatClick(seat, el) {
    const id = seat.id;
    if (selectedNewSeats.includes(id)) {
        selectedNewSeats = selectedNewSeats.filter(s => s !== id);
        el.classList.remove('selected');
    } else {
        selectedNewSeats.push(id);
        el.classList.add('selected');
    }
    updateNewSeatsUI();
}

function updateNewSeatsUI() {
    const disp = document.getElementById('new-seats-display');
    disp.innerText = selectedNewSeats.length > 0 ? selectedNewSeats.join(', ') : '未選択';
}

function submitSeatChange() {
    if (selectedNewSeats.length === 0) return alert('座席を選択してください');
    if (!confirm(`座席を ${selectedNewSeats.join(', ')} に変更しますか？`)) return;

    callApi('admin_change_seats', {
        id: selectedBooking.id,
        seats: selectedNewSeats.join(',')
    }, (res) => {
        if (res.success) {
            alert('座席を変更しました');
            closeSeatModal();
            closeModal();
            refreshData();
        } else {
            alert('変更失敗: ' + (res.error || '不明なエラー'));
        }
    });
};

// Deprecated replace
function promptSeatChange() {
    openSeatChangeModal();
};


// API Helper
function callApi(action, params, callback) {
    const url = apiUrlManager.getCurrentUrl();
    fetchJsonp(url, { action, ...params }, callback);
}

function fetchJsonp(url, params, callback) {
    const callbackName = 'jsonp_admin_' + Math.round(100000 * Math.random());
    window[callbackName] = function (data) {
        delete window[callbackName];
        document.body.removeChild(script);
        callback(data);
    };

    const script = document.createElement('script');
    const queryString = Object.keys(params)
        .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
        .join('&');
    script.src = `${url}?${queryString}&callback=${callbackName}`;
    document.body.appendChild(script);
}

// Mobile support
window.toggleSidebar = function () {
    document.getElementById('sidebar').classList.toggle('active');
};

// グローバル公開（必要な場合）
window.openDetail = openDetail;
window.toggleEditMode = toggleEditMode;
window.saveChanges = saveChanges;
window.resendEmail = resendEmail;
window.confirmCancel = confirmCancel;
window.promptSeatChange = promptSeatChange;
window.submitSeatChange = submitSeatChange;
window.closeModal = closeModal;
window.closeSeatModal = closeSeatModal;

