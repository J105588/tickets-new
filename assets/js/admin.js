/**
 * admin.js
 * 予約管理ダッシュボードのロジック (Supabase RPC版)
 */

import { apiUrlManager } from './config.js'; // Still needed for admin_resend_email (GAS)
import {
    fetchMasterGroups,
    adminGetReservations,
    adminUpdateBooking,
    adminCancelBooking,
    adminSwapSeats,
    fetchSeatsFromSupabase
} from './supabase-client.js';

let currentReservations = [];
let selectedBooking = null;

document.addEventListener('DOMContentLoaded', async () => {
    // マスタデータ読み込み
    await loadFilterOptions();
    // 初期検索
    applyFilters();

    // Event Listeners for Static Modal Buttons
    document.getElementById('btn-close-detail-modal').addEventListener('click', closeModal);
    document.getElementById('btn-edit-toggle').addEventListener('click', toggleEditMode);
    document.getElementById('btn-save-changes').addEventListener('click', saveChanges);
    document.getElementById('btn-resend-email').addEventListener('click', resendEmail);
    document.getElementById('btn-seat-change').addEventListener('click', promptSeatChange);
    document.getElementById('btn-cancel-res').addEventListener('click', confirmCancel);

    // Auto Refresh Toggle
    document.getElementById('auto-refresh-toggle').addEventListener('change', (e) => {
        if (e.target.checked) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });

    document.getElementById('btn-close-seat-modal').addEventListener('click', closeSeatModal);
    document.getElementById('btn-submit-seat-change').addEventListener('click', submitSeatChange);
});

let refreshInterval = null;

function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        applyFilters(true); // true = isBackground
    }, 5000);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

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
window.applyFilters = function (isBackground = false) {
    const group = document.getElementById('filter-group').value;
    const day = document.getElementById('filter-date').value;
    const year = document.getElementById('filter-year').value;

    fetchReservations({ group, day, year }, isBackground);
};

window.refreshData = function () {
    applyFilters(false);
};

async function fetchReservations(filters, isBackground = false) {
    const tbody = document.getElementById('reservation-table-body');

    // Only show loading if NOT background refresh
    if (!isBackground) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">読み込み中...</td></tr>';
    }

    // RPC Call
    const result = await adminGetReservations(filters);

    if (result.success) {
        currentReservations = result.data; // array
        renderTable(currentReservations);
    } else {
        if (!isBackground) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">エラー: ${result.error}</td></tr>`;
        } else {
            console.error('Auto-refresh failed:', result.error);
        }
    }
}

function renderTable(data) {
    const tbody = document.getElementById('reservation-table-body');
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">予約が見つかりません</td></tr>';
        return;
    }

    data.forEach(item => {
        const perf = item.performances || {};
        // RPC aggregates seats as array of objects {seat_id: "A1"}
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

function getStatusBadge(status) {
    switch (status) {
        case 'confirmed': return '<span class="badge bg-green">予約済</span>';
        case 'checked_in': return '<span class="badge bg-blue">入場済</span>';
        case 'cancelled': return '<span class="badge bg-red">キャンセル</span>';
        default: return `<span class="badge">${status}</span>`;
    }
}

// 詳細モーダル
function openDetail(id) {
    console.log('openDetail called with ID:', id);
    selectedBooking = currentReservations.find(r => r.id == id);

    if (!selectedBooking) {
        console.error('Booking not found in currentReservations for ID:', id);
        return;
    }
    const perf = selectedBooking.performances || {};
    const seats = selectedBooking.seats ? selectedBooking.seats.map(s => s.seat_id).join(', ') : '-';
    const notes = selectedBooking.notes || '';

    // Status Options
    const statusOptions = `
        <option value="confirmed" ${selectedBooking.status === 'confirmed' ? 'selected' : ''}>予約済 (confirmed)</option>
        <option value="checked_in" ${selectedBooking.status === 'checked_in' ? 'selected' : ''}>入場済 (checked_in)</option>
        <option value="cancelled" ${selectedBooking.status === 'cancelled' ? 'selected' : ''}>キャンセル (cancelled)</option>
    `;

    // Render as inputs but disabled initially
    const html = `
        <div class="detail-grid" style="display:grid; grid-template-columns: 1fr 2fr; gap: 10px; margin-bottom: 20px;">
            <div style="color:#666; display:flex; align-items:center;">ID</div>
            <div style="font-weight:bold">#${selectedBooking.id} <small>(${selectedBooking.passcode})</small></div>
            
            <label for="edit-status" style="color:#666; display:flex; align-items:center;">ステータス</label>
            <select id="edit-status" class="form-select" disabled>
                ${statusOptions}
            </select>
            
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
    const editBtn = document.getElementById('btn-edit-toggle');
    editBtn.style.display = 'inline-block';
    editBtn.innerText = '編集';
    document.getElementById('btn-save-changes').style.display = 'none';

    document.getElementById('detail-modal').classList.add('active');
};

function closeModal() {
    document.getElementById('detail-modal').classList.remove('active');
    selectedBooking = null;
    // Reset edit mode state
    const nameInput = document.getElementById('edit-name');
    if (nameInput) nameInput.disabled = true;
};

// 編集モード切替
function toggleEditMode() {
    const inputs = document.querySelectorAll('#modal-body input, #modal-body textarea, #modal-body select');
    // Check first input disabled state
    const isEditing = !inputs[0].disabled;

    if (isEditing) {
        // Now canceling edit -> revert
        openDetail(selectedBooking.id);
    } else {
        // Enable editing
        inputs.forEach(input => input.disabled = false);
        document.getElementById('edit-name').focus();
        document.getElementById('btn-edit-toggle').innerText = 'キャンセル';
        document.getElementById('btn-save-changes').style.display = 'inline-block';
    }
};

async function saveChanges() {
    if (!selectedBooking) return;

    const updates = {
        id: selectedBooking.id,
        name: document.getElementById('edit-name').value,
        email: document.getElementById('edit-email').value,
        grade_class: document.getElementById('edit-grade').value,
        club_affiliation: document.getElementById('edit-club').value,
        notes: document.getElementById('edit-notes').value,
        status: document.getElementById('edit-status').value
    };

    if (!updates.name) return alert('名前は必須です');

    const btn = document.getElementById('btn-save-changes');
    btn.innerText = '保存中...';
    btn.disabled = true;

    // Direct RPC
    const res = await adminUpdateBooking(updates);

    if (res.success) {
        alert('保存しました');
        closeModal();
        refreshData();
    } else {
        alert('保存失敗: ' + res.error);
        btn.innerText = '変更を保存';
        btn.disabled = false;
    }
};

// アクション: メール再送 (これだけはGAS APIを使う)
function resendEmail() {
    if (!selectedBooking) return;
    if (!confirm('確認メールを再送しますか？')) return;

    const btn = document.getElementById('btn-resend-email');
    const org = btn.innerText;
    btn.innerText = '送信中...';
    btn.disabled = true;

    // Call GAS via JSONP
    const url = apiUrlManager.getCurrentUrl();
    fetchJsonp(url, { action: 'admin_resend_email', id: selectedBooking.id }, (res) => {
        alert(res.success ? 'メールを再送しました' : '送信失敗: ' + res.error);
        btn.innerText = org;
        btn.disabled = false;
    });
};

async function confirmCancel() {
    if (!selectedBooking) return;
    if (selectedBooking.status === 'cancelled') return alert('既にキャンセルされています');
    if (!confirm('本当に予約を取り消しますか？\n（強制キャンセル）')) return;

    // RPC Force Cancel
    const res = await adminCancelBooking(selectedBooking.id);

    if (res.success) {
        alert('キャンセルしました');
        closeModal();
        refreshData();
    } else {
        alert('失敗: ' + res.error);
    }
};

// --- Seat Change Logic (Adapted from reservation.js) ---

let selectedNewSeats = [];

function openSeatChangeModal() {
    if (!selectedBooking) return;
    const perf = selectedBooking.performances;

    document.getElementById('seat-modal').classList.add('active');
    document.getElementById('seat-map-container').innerHTML = '<div style="text-align:center; padding:20px;">座席データ読み込み中...</div>';

    // Initialize with current seats
    if (selectedBooking.seats) {
        selectedNewSeats = selectedBooking.seats.map(s => s.seat_id);
    } else {
        selectedNewSeats = [];
    }
    updateNewSeatsUI();

    fetchSeatsFromSupabase(perf.group_name, perf.day, perf.timeslot)
        .then(res => {
            if (res.success) {
                renderSeatMap(res.data);
            } else {
                document.getElementById('seat-map-container').innerHTML = `<div style="color:red;text-align:center;">エラー: ${res.error}</div>`;
            }
        });
};

function closeSeatModal() {
    document.getElementById('seat-modal').classList.remove('active');
};

function renderSeatMap(seatsData) {
    const container = document.getElementById('seat-map-container');
    container.innerHTML = '';

    const rows = {};
    // Store original seat IDs for permission check
    const originalSeatIds = selectedBooking.seats ? selectedBooking.seats.map(s => s.seat_id) : [];

    seatsData.forEach(seat => {
        const id = seat.seat_id;
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
            // Base Class
            seatEl.className = `seat ${seat.status}`;

            const isOriginal = originalSeatIds.includes(seat.id);
            const isSelected = selectedNewSeats.includes(seat.id);

            // Visual State Logic
            if (isSelected) {
                seatEl.classList.add('selected');
                seatEl.classList.add('my-seat-selection');
            } else if (isOriginal) {
                // Was original, but currently deselected -> Show as "ghost"
                seatEl.style.border = '2px dashed blue';
                seatEl.style.backgroundColor = '#fff';
                seatEl.style.color = '#333';
                seatEl.style.opacity = '1';
                seatEl.style.cursor = 'pointer';
            }

            seatEl.innerText = seat.id;
            seatEl.dataset.id = seat.id;

            // Interaction Logic
            // Clickable if: Available OR Originally Mine OR Currently Selected
            const isInteractable = (seat.status === 'available') || isOriginal || isSelected;

            if (isInteractable) {
                seatEl.style.cursor = 'pointer';
                seatEl.onclick = () => handleSeatClick(seat, seatEl);
            } else {
                seatEl.style.cursor = 'default';
                seatEl.style.opacity = '0.5';
            }

            rowDiv.appendChild(seatEl);

            if (seat.seatNumber === 13 || seat.seatNumber === 25) {
                const p = document.createElement('div');
                p.style.width = '30px';
                rowDiv.appendChild(p);
            }
        });
        seatSection.appendChild(rowDiv);

        if (rowLabel === 'F') {
            const p = document.createElement('div'); p.style.height = '30px';
            seatSection.appendChild(p);
        }
    });
    container.appendChild(seatSection);
}

function handleSeatClick(seat, el) {
    const id = seat.id;
    const originalSeatIds = selectedBooking.seats ? selectedBooking.seats.map(s => s.seat_id) : [];

    if (selectedNewSeats.includes(id)) {
        // Deselect
        selectedNewSeats = selectedNewSeats.filter(s => s !== id);
        el.classList.remove('selected');
        el.classList.remove('my-seat-selection');

        // If it was original, restore "ghost" styling immediately
        if (originalSeatIds.includes(id)) {
            el.style.backgroundColor = '#fff';
            el.style.color = '#333';
            el.style.border = '2px dashed blue';
            el.style.opacity = '1';
        }
    } else {
        // Select
        // Allow if available OR if it is one of the original seats
        if (seat.status !== 'available' && !originalSeatIds.includes(id)) return;

        selectedNewSeats.push(id);
        el.classList.add('selected');
        el.classList.add('my-seat-selection');

        // Remove ghost styling override
        el.style.backgroundColor = '';
        el.style.color = '';
        el.style.border = '';
    }
    updateNewSeatsUI();
}

function updateNewSeatsUI() {
    const disp = document.getElementById('new-seats-display');
    disp.innerText = selectedNewSeats.length > 0 ? selectedNewSeats.join(', ') : 'なし (全席開放)';
}

async function submitSeatChange() {
    // If 0 seats, it means releasing all seats?
    // User might want to just cancel logic, but if they explicitly deselected all, 
    // maybe they want to make it a seat-less booking? 
    // Let's allow 0 seats with a warning.

    const count = selectedNewSeats.length;
    if (count === 0) {
        if (!confirm('全ての座席を選択解除しました。このまま保存しますか？\n（予約は座席なし状態になります）')) return;
    } else {
        if (!confirm(`座席を ${selectedNewSeats.join(', ')} に変更しますか？`)) return;
    }

    // RPC Swap Seats
    const res = await adminSwapSeats(selectedBooking.id, selectedNewSeats);

    if (res.success) {
        alert('座席を変更しました');
        closeSeatModal();
        closeModal();
        refreshData();
    } else {
        alert('変更失敗: ' + (res.error || '不明なエラー'));
    }
};

function promptSeatChange() {
    openSeatChangeModal();
};

// JSONP for Email Resend (Legacy)
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

// Global expose
window.openDetail = openDetail;
window.toggleEditMode = toggleEditMode;
window.saveChanges = saveChanges;
window.resendEmail = resendEmail;
window.confirmCancel = confirmCancel;
window.promptSeatChange = promptSeatChange;
window.submitSeatChange = submitSeatChange;
window.closeModal = closeModal;
window.closeSeatModal = closeSeatModal;
window.logout = function () {
    sessionStorage.removeItem('admin_session');
    window.location.href = 'admin-login.html';
};
