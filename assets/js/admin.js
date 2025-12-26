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
                <button class="btn-icon" onclick="openDetail(${item.id})"><i class="fas fa-edit"></i></button>
            </td>
        `;
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
window.openDetail = function (id) {
    selectedBooking = currentReservations.find(r => r.id === id);
    if (!selectedBooking) return;

    const perf = selectedBooking.performances || {};
    const seats = selectedBooking.seats ? selectedBooking.seats.map(s => s.seat_id).join(', ') : '-';

    const html = `
        <div style="display:grid; grid-template-columns: 1fr 2fr; gap: 10px; margin-bottom: 20px;">
            <div style="color:#666">ID</div>
            <div style="font-weight:bold">#${selectedBooking.id} <small>(${selectedBooking.passcode})</small></div>
            
            <div style="color:#666">ステータス</div>
            <div>${getStatusBadge(selectedBooking.status)}</div>
            
            <div style="color:#666">氏名</div>
            <div>${selectedBooking.name}</div>
            
            <div style="color:#666">メール</div>
            <div>${selectedBooking.email}</div>
            
             <div style="color:#666">所属</div>
            <div>${selectedBooking.grade_class || ''} ${selectedBooking.club_affiliation || ''}</div>
            
            <hr style="grid-column: 1/-1; width:100%; border:0; border-top:1px solid #eee; margin:10px 0;">
            
            <div style="color:#666">公演</div>
            <div>${perf.group_name} (${perf.day}日目 ${perf.timeslot})</div>
            
            <div style="color:#666">座席</div>
            <div>${seats}</div>
            
            <div style="color:#666">メモ</div>
            <div>${selectedBooking.notes || 'なし'}</div>
        </div>
    `;

    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('detail-modal').classList.add('active');
};

window.closeModal = function () {
    document.getElementById('detail-modal').classList.remove('active');
    selectedBooking = null;
};

// アクション
window.resendEmail = function () {
    if (!selectedBooking) return;
    if (!confirm('確認メールを再送しますか？')) return;

    const btn = event.target;
    const org = btn.innerText;
    btn.innerText = '送信中...';
    btn.disabled = true;

    callApi('admin_resend_email', { id: selectedBooking.id }, (res) => {
        alert(res.success ? 'メールを再送しました' : '送信失敗: ' + res.error);
        btn.innerText = org;
        btn.disabled = false;
    });
};

window.confirmCancel = function () {
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

window.promptSeatChange = function () {
    if (!selectedBooking) return;
    // 簡易実装: ID入力を求める（本来は座席マップダイアログが必要）
    const newSeatsStr = prompt('新しい座席IDを入力してください (カンマ区切り)\n例: A1,A2', '');
    if (!newSeatsStr) return;

    // バリデーション等が必要だが省略

    callApi('admin_change_seats', { id: selectedBooking.id, seats: newSeatsStr }, (res) => {
        if (res.success) {
            alert('座席を変更しました');
            closeModal();
            refreshData();
        } else {
            alert('変更失敗: ' + res.error);
        }
    });
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
