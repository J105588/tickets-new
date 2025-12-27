/**
 * admin.js
 * 予約管理 + 設定管理 (Single Unified Dashboard)
 * GAS API版
 */

import {
    fetchMasterDataFromSupabase,
    adminGetReservations,
    adminUpdateBooking,
    adminCancelBooking,
    adminResendEmail,
    adminFetchSchedules,     // New
    adminManageSchedule,     // New
    adminDeleteSchedule,     // New
    adminManageMaster        // New
} from './supabase-client.js';

let currentReservations = [];
let masterData = {
    groups: [],
    dates: [],
    timeslots: [],
    schedules: []
};

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    // 0. Session Check (Idle Timeout)
    const session = sessionStorage.getItem('admin_session');
    let lastActive = sessionStorage.getItem('admin_last_active');

    // Fallback for existing sessions without last_active
    if (session && !lastActive) {
        lastActive = new Date().getTime().toString();
        sessionStorage.setItem('admin_last_active', lastActive);
    }

    const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout

    if (!session) {
        window.location.href = 'admin-login.html';
        return;
    }

    const now = new Date().getTime();
    if (now - parseInt(lastActive) > SESSION_TIMEOUT_MS) {
        alert('一定時間操作がなかったため、ログアウトしました。');
        sessionStorage.removeItem('admin_session');
        sessionStorage.removeItem('admin_verified_at');
        sessionStorage.removeItem('admin_last_active');
        window.location.href = 'admin-login.html';
        return;
    }

    // Update activity timestamp on user interaction
    const updateActivity = () => {
        sessionStorage.setItem('admin_last_active', new Date().getTime().toString());
    };

    // Throttle updates to avoid excessive storage writes (e.g., every 10s)
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

    // Update usage on valid load
    updateActivity();


    // 1. Load All Data (Filters + Settings)
    await loadMasterData();

    // 2. Setup Helpers
    window.switchTab = switchTab;
    window.logout = logout;

    // 3. Initial Search
    applyFilters();
});

// --- Data Loading ---

async function loadMasterData() {
    const loader = document.getElementById('loading');
    if (loader) loader.style.display = 'block';

    const [mRes, sRes] = await Promise.all([
        fetchMasterDataFromSupabase(),
        adminFetchSchedules()
    ]);

    if (mRes.success) {
        masterData.groups = mRes.data.groups || [];
        masterData.dates = mRes.data.dates || [];
        masterData.timeslots = mRes.data.timeslots || [];
    } else {
        alert('マスタデータ取得失敗: ' + mRes.error);
    }

    if (sRes.success) {
        masterData.schedules = sRes.data || [];
    } else {
        console.error('Schedules fetch error', sRes.error);
    }

    // Update UI
    applyFilterOptions();
    renderSettingsTables();

    if (loader) loader.style.display = 'none';
}

function applyFilterOptions() {
    // 1. Groups Filter
    const groupSelect = document.getElementById('filter-group');
    if (groupSelect) {
        groupSelect.innerHTML = '<option value="">全ての団体</option>';
        masterData.groups.forEach(g => {
            if (g.is_active) {
                const opt = document.createElement('option');
                opt.value = g.name;
                opt.innerText = g.name;
                groupSelect.appendChild(opt);
            }
        });
    }

    // 2. Days Filter (DB Driven)
    const daySelect = document.getElementById('filter-day');
    if (daySelect) {
        daySelect.innerHTML = '<option value="">全て</option>';
        masterData.dates.forEach(d => {
            if (d.is_active !== false) { // Default true
                const opt = document.createElement('option');
                // Assuming d.id is 1, 2 or we use date_label.
                // Filter usually expects "1" or "2" (day number).
                // If masterData.dates has 'day_num' or 'id' effectively mapping to day number:
                // Let's assume ID is the day number for simplicity if not specified, 
                // OR check if there is a 'day_number' column. 
                // Previous code hardcoded value="1", value="2".
                // We will use d.id as the value for now, assuming IDs 1, 2...
                opt.value = d.id;
                opt.innerText = d.date_label || `Day ${d.id}`;
                daySelect.appendChild(opt);
            }
        });
    }

    // 3. Timeslots Filter
    const timeSelect = document.getElementById('filter-timeslot');
    if (timeSelect) {
        timeSelect.innerHTML = '<option value="">全ての時間帯</option>';
        // Sort timeslots
        const sorted = [...masterData.timeslots].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
        sorted.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.slot_code;
            opt.innerText = `${t.slot_code} (${t.start_time}-${t.end_time})`;
            timeSelect.appendChild(opt);
        });
    }
}

// --- Dashboard Logic ---

window.applyFilters = async function (isBackground = false) {
    const group = document.getElementById('filter-group').value;
    const day = document.getElementById('filter-day').value;
    const timeslot = document.getElementById('filter-timeslot').value;
    const search = document.getElementById('filter-search').value;

    if (!isBackground) {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'block';
        document.getElementById('reservation-table').style.opacity = '0.5';
    }

    const result = await adminGetReservations({ group, day, timeslot, search });

    if (!isBackground) {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
        document.getElementById('reservation-table').style.opacity = '1';
    }

    if (result.success) {
        currentReservations = result.data;
        renderReservationTable(currentReservations);
    } else {
        if (!isBackground) alert('データ取得エラー: ' + result.error);
    }
};

function renderReservationTable(data) {
    const tbody = document.querySelector('#reservation-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem;">該当する予約はありません</td></tr>';
        return;
    }

    data.forEach(r => {
        const tr = document.createElement('tr');
        let statusClass = '';
        let statusText = r.status;
        if (r.status === 'confirmed') { statusClass = 'status-confirmed'; statusText = '予約済'; }
        else if (r.status === 'checked_in') { statusClass = 'status-checked-in'; statusText = '入場済'; }
        else if (r.status === 'cancelled') { statusClass = 'status-cancelled'; statusText = 'キャンセル'; }

        const seats = r.seats ? r.seats.map(s => s.seat_id).join(', ') : '-';
        const p = r.performances || r.performance; // Handle both just in case
        const groupInfo = `${p ? p.group_name : '-'} <br> <span style="font-size:0.8em; color:#666;">Day ${p ? p.day : '-'} ${p ? p.timeslot : '-'}</span>`;

        tr.innerHTML = `
            <td>${r.id} <br> <span style="font-size:0.8em; color:#888;">${r.reservation_id || ''}</span></td>
            <td>${r.name}</td>
            <td>${r.email}</td>
            <td>${groupInfo}</td>
            <td>${seats}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                <button class="btn-outline btn-sm" onclick="openEditModal(${r.id})">詳細/編集</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Settings Logic (Merged) ---

function renderSettingsTables() {
    renderGroups();
    renderDates();
    // renderTimeslots(); // Removed
    renderSchedules();
}

function renderGroups() {
    const tbody = document.querySelector('#table-groups tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const sorted = [...masterData.groups].sort((a, b) => a.display_order - b.display_order);

    sorted.forEach(g => {
        const tr = document.createElement('tr');
        const statusBadge = g.is_active ? '<span class="badge badge-active">有効</span>' : '<span class="badge badge-inactive">無効</span>';
        tr.innerHTML = `
            <td>${g.display_order}</td>
            <td>${g.name}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn-sm" onclick="openGroupModal(${g.id})">編集</button>
                <button class="btn-danger btn-sm" onclick="deleteItem('groups', ${g.id})">削除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderDates() {
    const tbody = document.querySelector('#table-dates tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const sorted = [...masterData.dates].sort((a, b) => a.display_order - b.display_order);

    sorted.forEach(d => {
        const tr = document.createElement('tr');
        const statusBadge = d.is_active !== false ? '<span class="badge badge-active">有効</span>' : '<span class="badge badge-inactive">無効</span>';
        tr.innerHTML = `
            <td>${d.display_order}</td>
            <td>${d.date_label}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn-sm" onclick="openDateModal(${d.id})">編集</button>
                <button class="btn-danger btn-sm" onclick="deleteItem('event_dates', ${d.id})">削除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderSchedules() {
    const tbody = document.querySelector('#table-schedules tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const sorted = [...masterData.schedules].sort((a, b) => {
        if (a.day !== b.day) return a.day - b.day;
        // Try to sort by time if possible
        if (a.timeslot !== b.timeslot) return a.timeslot.localeCompare(b.timeslot);
        return a.group_name.localeCompare(b.group_name);
    });

    sorted.forEach(s => {
        const tr = document.createElement('tr');
        // Timeslot is now just a string
        const timeDisplay = s.timeslot;

        tr.innerHTML = `
            <td>${s.group_name}</td>
            <td>${s.day} (ID:${s.day})</td>
            <td><span class="badge">${timeDisplay}</span></td>
            <td>
                <button class="btn-sm" onclick="openScheduleModal('${s.id}')">編集</button>
                <button class="btn-danger btn-sm" onclick="deleteScheduleEntry(${s.id})">削除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Modals (Common) ---

window.closeModal = function (id) {
    document.getElementById(id).classList.remove('active');
};

// --- Modals (Dashboard) ---

let selectedBooking = null;

window.openEditModal = function (id) {
    selectedBooking = currentReservations.find(r => r.id === id);
    if (!selectedBooking) return;

    document.getElementById('edit-id').value = selectedBooking.id;
    document.getElementById('edit-name').value = selectedBooking.name;
    document.getElementById('edit-email').value = selectedBooking.email;
    document.getElementById('edit-grade').value = selectedBooking.grade_class || '';
    document.getElementById('edit-club').value = selectedBooking.club_affiliation || '';
    document.getElementById('edit-notes').value = selectedBooking.notes || '';
    document.getElementById('edit-status').value = selectedBooking.status;

    const btnCancel = document.getElementById('btn-cancel-reservation');
    if (selectedBooking.status === 'cancelled') {
        btnCancel.disabled = true;
        btnCancel.textContent = 'キャンセル済';
        btnCancel.onclick = null;
    } else {
        btnCancel.disabled = false;
        btnCancel.textContent = 'キャンセル処理';
        btnCancel.onclick = () => handleCancel(selectedBooking.id);
    }

    document.getElementById('modal-edit').classList.add('active');
};

window.saveChanges = async function () {
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

    const res = await adminUpdateBooking(updates);
    if (res.success) {
        alert('保存しました');
        closeModal('modal-edit');
        applyFilters();
    } else {
        alert('保存失敗: ' + res.error);
    }
    btn.innerText = '変更を保存';
    btn.disabled = false;
};

async function handleCancel(id) {
    if (!confirm('本当にキャンセルしますか？')) return;
    const res = await adminCancelBooking(id);
    if (res.success) {
        alert('キャンセルしました');
        closeModal('modal-edit');
        applyFilters();
    } else {
        alert('エラー: ' + res.error);
    }
}

window.resendEmail = function () {
    if (!selectedBooking) return;
    if (!confirm('確認メールを再送しますか？')) return;
    const btn = document.getElementById('btn-resend-email');
    btn.innerText = '送信中...';
    // Use JSONP wrapper (assuming implemented in client or adminResendEmail wrapper uses it)
    // adminResendEmail in supabase-client.js uses jsonpRequest
    adminResendEmail(selectedBooking.id).then(res => {
        alert(res.success ? 'メールを再送しました' : '送信失敗: ' + res.error);
        btn.innerText = 'メール再送';
    });
};

// --- Modals (Settings) ---

// Group
window.openGroupModal = function (id = null) {
    const item = id ? masterData.groups.find(g => g.id === id) : {};
    document.getElementById('group-id').value = id || '';
    document.getElementById('group-name').value = item.name || '';
    document.getElementById('group-order').value = item.display_order || 10;
    const activeSel = document.getElementById('group-status');
    if (activeSel) activeSel.value = item.is_active === false ? 'inactive' : 'active';

    // Delete Button visibility
    const delBtn = document.getElementById('btn-delete-group');
    if (delBtn) {
        delBtn.style.display = id ? 'inline-block' : 'none';
        delBtn.onclick = () => deleteItem('groups', id);
    }

    document.getElementById('modal-group').classList.add('active');
};
window.saveGroup = async function () {
    const id = document.getElementById('group-id').value;
    const data = {
        name: document.getElementById('group-name').value,
        display_order: parseInt(document.getElementById('group-order').value),
        is_active: document.getElementById('group-status').value === 'active'
    };
    if (id) data.id = parseInt(id);
    if (!data.name) return alert('名前は必須です');

    // Check local duplicate for names if needed, or rely on DB
    const res = await adminManageMaster('groups', 'save', data);
    if (res.success) {
        alert('保存しました');
        closeModal('modal-group');
        loadMasterData();
    } else {
        alert('エラー: ' + res.error);
    }
};

// Date
window.openDateModal = function (id = null) {
    const item = id ? masterData.dates.find(d => d.id === id) : {};
    document.getElementById('date-id').value = id || '';
    document.getElementById('date-label').value = item.date_label || '';
    document.getElementById('date-order').value = item.display_order || 10;
    const activeSel = document.getElementById('date-status');
    if (activeSel) activeSel.value = item.is_active === false ? 'inactive' : 'active';

    const delBtn = document.getElementById('btn-delete-date');
    if (delBtn) {
        delBtn.style.display = id ? 'inline-block' : 'none';
        delBtn.onclick = () => deleteItem('event_dates', id);
    }

    document.getElementById('modal-date').classList.add('active');
};
window.saveDate = async function () {
    const id = document.getElementById('date-id').value;
    const data = {
        date_label: document.getElementById('date-label').value,
        display_order: parseInt(document.getElementById('date-order').value),
        is_active: document.getElementById('date-status').value === 'active'
    };
    if (id) data.id = parseInt(id);
    if (!data.date_label) return alert('ラベルは必須です');

    const res = await adminManageMaster('event_dates', 'save', data);
    if (res.success) {
        alert('保存しました');
        closeModal('modal-date');
        loadMasterData();
    } else {
        alert('エラー: ' + res.error);
    }
}

// Schedule
window.openScheduleModal = function (id = null) {
    // Populate dropdowns from masterData
    const selGroup = document.getElementById('schedule-group-id');
    selGroup.innerHTML = '';
    masterData.groups.forEach(g => {
        if (g.is_active) {
            const opt = document.createElement('option');
            opt.value = g.name;  // Note: Backend uses Name for uniqueness mostly, but ideally ID. Current Impl uses Name.
            opt.innerText = g.name;
            selGroup.appendChild(opt);
        }
    });

    // Populate DATES (Dynamic)
    const selDay = document.getElementById('schedule-day');
    selDay.innerHTML = '';
    const activeDates = masterData.dates.filter(d => d.is_active !== false).sort((a, b) => a.display_order - b.display_order);
    activeDates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id; // Using ID as the "Day" value since we migrated to support flexible days
        opt.innerText = d.date_label || `Day ${d.id}`;
        selDay.appendChild(opt);
    });

    // Timeslot is now MANUAL INPUT, no population needed

    const item = id ? masterData.schedules.find(s => s.id == id) : {};
    document.getElementById('schedule-id').value = item?.id || '';
    if (item.group_name) selGroup.value = item.group_name;
    // Map day value. 
    // If item.day is integer (e.g. 1, 2), it should match opt.value if we use ID.
    // Ensure item.day matches the select values.
    document.getElementById('schedule-day').value = item.day || (activeDates[0] ? activeDates[0].id : '');

    // Set Input Value
    document.getElementById('schedule-timeslot').value = item.timeslot || '';

    // Max Seats (if applicable, current modal has it)
    if (document.getElementById('schedule-max-seats')) {
        document.getElementById('schedule-max-seats').value = item.max_seats || '';
    }

    const delBtn = document.getElementById('btn-delete-schedule');
    if (delBtn) {
        delBtn.style.display = id ? 'inline-block' : 'none';
        delBtn.onclick = () => deleteScheduleEntry(id);
    }

    document.getElementById('modal-schedule').classList.add('active');
};
window.saveSchedule = async function () {
    const id = document.getElementById('schedule-id').value;
    const timeslotVal = document.getElementById('schedule-timeslot').value;

    if (!timeslotVal) return alert('時間帯は必須です (例: 10:00)');

    const data = {
        group_name: document.getElementById('schedule-group-id').value,
        day: parseInt(document.getElementById('schedule-day').value),
        timeslot: timeslotVal
    };
    if (id) data.id = parseInt(id);

    if (document.getElementById('schedule-max-seats')) {
        const max = parseInt(document.getElementById('schedule-max-seats').value);
        if (!isNaN(max)) data.max_seats = max;
    }

    const res = await adminManageSchedule(data);
    if (res.success) {
        alert('保存しました');
        closeModal('modal-schedule');
        loadMasterData();
    } else {
        alert('エラー: ' + res.error);
    }
};

window.deleteScheduleEntry = async function (id) {
    if (!confirm('本当に削除しますか？')) return;
    const res = await adminDeleteSchedule(id);
    if (res.success) {
        alert('削除しました');
        loadMasterData();
    } else {
        alert('エラー: ' + res.error);
    }
};

window.deleteItem = async function (table, id) {
    if (!confirm('本当に削除しますか？')) return;
    const res = await adminManageMaster(table, 'delete', { id });
    if (res.success) {
        alert('削除しました');
        loadMasterData();
    } else {
        alert('エラー: ' + res.error);
    }
};

// --- Utils ---

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById('tab-' + tabId).classList.add('active');
    // Find button - simple query selector
    const btns = document.querySelectorAll('.tab-btn');
    if (tabId === 'dashboard') btns[0].classList.add('active');
    if (tabId === 'settings') btns[1].classList.add('active');
}

function logout() {
    sessionStorage.removeItem('admin_session');
    window.location.href = 'admin-login.html';
}
