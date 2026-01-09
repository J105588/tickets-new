/**
 * admin.js
 * 予約管理 + 設定管理 (Single Unified Dashboard)
 * GAS API版
 */

import { apiUrlManager } from './config.js';

import {
    fetchMasterDataFromSupabase,
    adminGetReservations,
    adminUpdateBooking,
    adminCancelBooking,
    adminResendEmail,
    adminFetchSchedules,     // New
    adminManageSchedule,     // New
    adminDeleteSchedule,     // New
    adminManageMaster,       // New
    adminSendSummaryEmails,   // New
    adminSwapSeats,           // New
    adminResetPerformance,    // New
    adminBackupDatabase,      // Backup
    adminGetBackups,          // Backup
    adminRestoreDatabase,     // Backup
    adminGetMaintenanceSchedule, // Maintenance
    adminSetMaintenanceSchedule, // Maintenance
    toDisplaySeatId,
    toDbSeatId
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


    // 1. Load All Data (Parallel)
    // We launch master data load and initial reservation fetch simultaneously.
    // 'loadMasterData' handles UI rendering for filters.
    // 'adminGetReservations' fetches data.
    const [_, result] = await Promise.all([
        loadMasterData(),
        adminGetReservations({}),
        loadMaintenanceStatus() // Load maintenance schedule
    ]);

    // 2. Render Initial Reservations
    if (result && result.success) {
        currentReservations = result.data;
        renderReservationTable(currentReservations);
    } else {
        console.error('Initial reservation fetch failed', result ? result.error : 'Unknown');
        // If failed, applyFilters will be callable manually or via retry
    }

    // 3. Setup Helpers
    window.switchTab = switchTab;
    window.logout = logout;
    window.loadMasterData = loadMasterData;
    window.applyFilters = applyFilters;

    window.applyFilters = applyFilters;
    window.deleteItem = deleteItem;
    window.deleteDateEntry = (id) => deleteItem('event_dates', id);

    // Filter UI is already populated by loadMasterData inside the promise above.
    // We do NOT call applyFilters() again here to avoid double-fetch, unless we want to ensure DOM sync.
    // But since inputs are empty initially, adminGetReservations({}) is equivalent.

    // 4. Search Input Enter Key
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                applyFilters();
            }
        });
    }

    // 5. Force Auto Refresh (Every 30 seconds)
    setInterval(() => {
        const dashboardTab = document.getElementById('tab-dashboard');
        // Only refresh if dashboard is active to save resources
        if (dashboardTab && dashboardTab.classList.contains('active')) {
            // Check if user is typing in search
            const searchInput = document.getElementById('filter-search');
            if (searchInput && document.activeElement === searchInput && searchInput.value.length > 0) {
                console.log('Skipping auto-refresh while typing');
                return;
            }
            console.log('Auto-refreshing dashboard...');
            applyFilters(true); // Background refresh
        }
    }, 30000);
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



    window.clearFilters = function () {
        document.getElementById('filter-group').value = '';
        document.getElementById('filter-day').value = '';
        document.getElementById('filter-search').value = '';
        applyFilters();
    };

}

// --- Dashboard Logic ---

window.applyFilters = async function (isBackground = false) {
    const group = document.getElementById('filter-group').value;
    const day = document.getElementById('filter-day').value;
    const search = document.getElementById('filter-search').value.trim();

    if (!isBackground) {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'block';
        document.getElementById('reservation-table').style.opacity = '0.5';
    }

    // Toggle Clear Button Visibility
    const btnClear = document.getElementById('btn-clear-filters');
    if (btnClear) {
        if (group || day || search) {
            btnClear.style.display = 'inline-block';
        } else {
            btnClear.style.display = 'none';
        }
    }

    // Default pagination: Get latest 100
    // Future: Implement 'Load More' button by tracking page offset
    const result = await adminGetReservations({ group, day, search, limit: 100, page: 0 });

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

        const rawSeats = r.seats ? r.seats.map(s => s.seat_id).join(', ') : '-';
        const seats = toDisplaySeatId(rawSeats);
        const p = r.performances || r.performance; // Handle both
        const groupInfo = p ? `${p.group_name}` : '-';
        const dateInfo = p ? `Day ${p.day} ${p.timeslot}` : '-';

        // Safe DOM Construction
        // Col 1: ID
        const tdId = document.createElement('td');
        tdId.textContent = r.id; // Safe
        if (r.reservation_id) {
            const br = document.createElement('br');
            const spanUuid = document.createElement('span');
            spanUuid.style.fontSize = '0.8em';
            spanUuid.style.color = '#888';
            spanUuid.textContent = r.reservation_id; // Safe
            tdId.appendChild(br);
            tdId.appendChild(spanUuid);
        }
        tr.appendChild(tdId);

        // Col 2: Name (VULNERABLE POINT FIXED)
        const tdName = document.createElement('td');
        tdName.textContent = r.name; // Safe
        tr.appendChild(tdName);

        // Col 3: Email (VULNERABLE POINT FIXED)
        const tdEmail = document.createElement('td');
        tdEmail.textContent = r.email; // Safe
        tr.appendChild(tdEmail);

        // Col 4: Group
        const tdGroup = document.createElement('td');
        tdGroup.textContent = groupInfo;
        if (p) {
            const br = document.createElement('br');
            const spanDate = document.createElement('span');
            spanDate.style.fontSize = '0.8em';
            spanDate.style.color = '#666';
            spanDate.textContent = dateInfo;
            tdGroup.appendChild(br);
            tdGroup.appendChild(spanDate);
        }
        tr.appendChild(tdGroup);

        // Col 5: Seats
        const tdSeats = document.createElement('td');
        tdSeats.textContent = seats;
        tr.appendChild(tdSeats);

        // Col 6: Status
        const tdStatus = document.createElement('td');
        const spanStatus = document.createElement('span');
        spanStatus.className = `status-badge ${statusClass}`;
        spanStatus.textContent = statusText;
        tdStatus.appendChild(spanStatus);
        tr.appendChild(tdStatus);

        // Col 7: Action
        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'btn-outline btn-sm';
        btn.textContent = '詳細/編集';
        btn.onclick = () => openEditModal(r.id);
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);
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
                <button class="btn-sm" style="background:#f59e0b;" onclick="resetPerformance(${s.id})">初期化</button>
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

    // Populate Seat Input
    const rawSeats = selectedBooking.seats ? selectedBooking.seats.map(s => s.seat_id).join(', ') : '';
    document.getElementById('edit-seat').value = toDisplaySeatId(rawSeats);

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

window.changeSeat = async function () {
    if (!selectedBooking) return;
    const displaySeatsStr = document.getElementById('edit-seat').value.trim();
    if (!displaySeatsStr) return alert('座席IDを入力してください');

    // Convert Display -> DB
    const dbSeatsStr = toDbSeatId(displaySeatsStr);

    if (!confirm(`座席を「${displaySeatsStr}」に変更しますか？\n（システムID: ${dbSeatsStr}）\n\n注意: 旧座席は開放されます。新座席が空いていない場合はエラーになります。`)) return;

    const btn = document.querySelector('button[onclick="changeSeat()"]');
    const originalText = btn.innerText;
    btn.innerText = '変更中...';
    btn.disabled = true;

    // Split by comma or space
    const newSeats = dbSeatsStr.split(/[,、\s]+/).map(s => s.trim()).filter(s => s);

    const res = await adminSwapSeats(selectedBooking.id, newSeats);

    if (res.success) {
        alert('座席を変更しました');
        closeModal('modal-edit'); // Close to refresh data cleanly via applyFilters
        applyFilters();
    } else {
        alert('変更失敗: ' + res.error);
    }

    btn.innerText = originalText;
    btn.disabled = false;
};

window.selectFromMap = function () {
    if (!selectedBooking) return;
    // booking details
    const p = selectedBooking.performances || selectedBooking.performance || {};
    if (!p.group_name || !p.day || !p.timeslot) {
        alert('公演情報が不足しているため座席表を開けません');
        return;
    }

    // Construct URL
    const params = new URLSearchParams();
    params.set('group', p.group_name);
    params.set('day', p.day);
    params.set('timeslot', p.timeslot);
    params.set('admin', 'true');
    params.set('rebook', selectedBooking.id);

    params.set('rebook', selectedBooking.id);
    params.set('embed', 'true'); // New param for embed mode

    // Set iframe src and open modal
    const iframe = document.getElementById('seat-map-frame');
    iframe.src = `../pages/seats.html?${params.toString()}`;

    document.getElementById('modal-seat-map').classList.add('active');
};

// Listen for messages from iframe
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'REBOOK_COMPLETE') {
        if (event.data.success) {
            alert('座席変更が完了しました');
            closeModal('modal-seat-map');
            closeModal('modal-edit'); // Close edit modal too
            applyFilters(); // Refresh list
        } else {
            alert('座席変更エラー: ' + (event.data.error || 'Unknown'));
        }
    }
});

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
    if (item.date_label) document.getElementById('date-label').value = item.date_label;
    if (item.date_value) document.getElementById('date-value').value = item.date_value;
    document.getElementById('date-order').value = item.display_order || 0;
    if (item.is_active !== undefined) document.getElementById('date-status').value = item.is_active ? 'active' : 'inactive';

    const delBtn = document.getElementById('btn-delete-date');
    if (delBtn) {
        delBtn.style.display = id ? 'inline-block' : 'none';
        delBtn.onclick = () => deleteDateEntry(id);
    }

    document.getElementById('modal-date').classList.add('active');
};
window.saveDate = async function () {
    const id = document.getElementById('date-id').value;

    const data = {
        date_label: document.getElementById('date-label').value,
        date_value: document.getElementById('date-value').value, // YYYY-MM-DD string
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

window.deleteItem = async function (type, id) {
    if (!confirm('本当に削除しますか？\n(関連する予約データ等がある場合、整合性エラーになる可能性があります)')) return;

    try {
        const res = await adminManageMaster(type, 'delete', { id: id });
        if (res.success) {
            alert('削除しました');
            // Close generic modals if open
            if (type === 'groups') closeModal('modal-group');
            if (type === 'event_dates') closeModal('modal-date');

            loadMasterData();
        } else {
            alert('削除エラー: ' + res.error);
        }
    } catch (e) {
        alert('システムエラー: ' + e.message);
    }
};



window.resetPerformance = async function (id) {
    const item = masterData.schedules.find(s => s.id == id);
    if (!item) return;

    const confirmMsg = `【重要】本当に初期化しますか？\n\n対象: ${item.group_name} ${item.day} ${item.timeslot}\n\n・全座席が「空席」に戻ります\n・全ての予約データが「完全に削除」されます\n・この操作は取り消せません\n\n実行するには、以下に「RESET」と入力してください。`;

    const input = prompt(confirmMsg);
    if (input !== 'RESET') {
        if (input !== null) alert('入力内容が一致しないためキャンセルしました');
        return;
    }

    // Double check
    if (!confirm('最終確認: 本当に初期化してよろしいですか？')) return;

    // Execute
    // Use resetPerformance wrapper
    // UI Feedback
    const btn = document.querySelector(`button[onclick="resetPerformance(${id})"]`);
    const originalText = btn ? btn.innerText : '初期化';
    if (btn) {
        btn.innerText = '処理中...';
        btn.disabled = true;
    }

    try {
        const res = await adminResetPerformance(id);
        if (res.success) {
            alert(res.message || '初期化しました');
            loadMasterData(); // Refresh all
        } else {
            alert('初期化エラー: ' + res.error);
        }
    } catch (e) {
        alert('エラーが発生しました: ' + e.message);
    } finally {
        if (btn) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
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
    if (tabId === 'settings') {
        btns[1].classList.add('active');
        if (window.loadDeadlineSettings) window.loadDeadlineSettings();
        if (window.loadBackupsForUI) window.loadBackupsForUI();
    }
}

window.sendSummaryEmails = async function () {
    if (!currentReservations || currentReservations.length === 0) {
        alert('送信対象の予約がありません。フィルタを確認してください。');
        return;
    }

    if (!confirm(`現在表示されている ${currentReservations.length} 件の予約情報からまとめメールを作成して送信します。\n\n・名前が一致する予約を束ねます\n・重複するメールアドレスには1通のみ送信します\n\n実行しますか？`)) return;

    // 1. Group by Name
    const groups = {}; // name -> { bookings: [], emails: Set() }

    currentReservations.forEach(r => {
        // Normalize name? Assuming exact match for now.
        const name = r.name.trim();
        if (!groups[name]) {
            groups[name] = { name: name, bookings: [], emails: new Set() };
        }
        groups[name].bookings.push(r);
        if (r.email) groups[name].emails.add(r.email.trim());
    });

    const jobList = Object.values(groups).map(g => ({
        name: g.name,
        emails: Array.from(g.emails),
        bookings: g.bookings.map(b => ({
            id: b.id,
            group_name: b.performances ? b.performances.group_name : '', // Assuming joined
            day: b.performances ? b.performances.day : '',
            timeslot: b.performances ? b.performances.timeslot : '',
            seat: b.seats ? toDisplaySeatId(b.seats.map(s => s.seat_id).join(',')) : '指定なし',
            status: b.status,     // Add status
            passcode: b.passcode, // Add passcode
            created_at: b.created_at // Add created_at
        }))
    }));

    console.log(`Sending summary emails to ${jobList.length} unique names.`);

    // 2. Distribute and Send
    const urls = apiUrlManager.getAllUrls();
    const batchSize = 3; // Small batch for GAS execution time safety
    const jobs = [...jobList];
    let results = { success: 0, failure: 0 };

    // Progress UI (Simple)
    const btn = document.querySelector('button[onclick="sendSummaryEmails()"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 送信中...';

    try {
        // Process in chunks
        for (let i = 0; i < jobs.length; i += batchSize) {
            const chunk = jobs.slice(i, i + batchSize);
            // Select URL (Round Robin)
            const urlIndex = (i / batchSize) % urls.length;
            const targetUrl = urls[urlIndex];

            console.log(`Sending batch ${i} - ${i + batchSize} to ${targetUrl}`);

            // Execute
            const res = await adminSendSummaryEmails(chunk, targetUrl);

            if (res.success) {
                results.success += (res.count || chunk.length);
            } else {
                console.error('Batch failed:', res.error);
                results.failure += chunk.length; // Count as failed
            }
        }

        alert(`送信完了\n成功: ${results.success}件\n失敗: ${results.failure}件`);

    } catch (e) {
        alert('送信中にエラーが発生しました: ' + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};


// --- Logout & Session Security ---

function logout() {
    sessionStorage.removeItem('admin_session');
    sessionStorage.removeItem('admin_verified_at');
    sessionStorage.removeItem('admin_last_active');

    // Replace history to trap back button
    window.location.replace('admin-login.html');
}

// Function to enforce session validity
function checkSessionSecurity() {
    const session = sessionStorage.getItem('admin_session');
    // If we are on admin.html and no session exists, redirect immediately
    // Note: checking path to ensure we don't loop if logic moves to common file
    if (!session && window.location.pathname.includes('admin.html')) {
        console.warn('Session missing, redirecting to login');
        window.location.replace('admin-login.html');
    }
}

// 1. Back/Forward Cache (BFCache) Restore
window.addEventListener('pageshow', (event) => {
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        checkSessionSecurity();
    }
});

// 2. iOS PWA / Mobile Tab Visibility (App Resume)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        checkSessionSecurity();
    }
});

// 3. Window Focus (Alt-Tab / Desktop)
window.addEventListener('focus', () => {
    checkSessionSecurity();
});

// --- Invitation Link ---
window.generateInviteLink = async function () {
    const mins = document.getElementById('invite-minutes').value;
    const btn = document.querySelector('button[onclick="generateInviteLink()"]');
    const originalText = btn.innerText;

    btn.innerText = '発行中...';
    btn.disabled = true;

    try {
        const res = await adminGenerateInviteToken(mins);
        if (res.success) {
            const baseUrl = window.location.href.replace('admin.html', 'reservation.html');
            // Query params handling
            const cleanBaseUrl = baseUrl.split('?')[0];
            const fullUrl = `${cleanBaseUrl}?token=${res.token}`;

            document.getElementById('invite-url').value = fullUrl;
            document.getElementById('invite-result').style.display = 'block';
        } else {
            alert('発行失敗: ' + res.error);
        }
    } catch (e) {
        alert('エラー: ' + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

window.copyInviteLink = function () {
    const el = document.getElementById('invite-url');
    el.select();
    document.execCommand('copy');
    alert('コピーしました');
};

// --- Global Deadline ---
window.loadDeadlineSettings = async function () {
    try {
        const res = await GasAPI.adminDeadlineSettings('get');
        if (res.success && res.deadline) {
            // datetime-local expects YYYY-MM-DDTHH:mm
            // Supabase/GAS might return ISO string (UTC) or ISO-like string.
            // iOS requires strict format and local time representation.
            try {
                const d = new Date(res.deadline);
                if (!isNaN(d.getTime())) {
                    const pad = n => n.toString().padStart(2, '0');
                    const year = d.getFullYear();
                    const month = pad(d.getMonth() + 1);
                    const day = pad(d.getDate());
                    const hour = pad(d.getHours());
                    const minute = pad(d.getMinutes());
                    // Local ISO-like string: YYYY-MM-DDTHH:mm
                    const localIso = `${year}-${month}-${day}T${hour}:${minute}`;
                    document.getElementById('global-deadline').value = localIso;
                } else {
                    // Fallback to simple slicing if date parsing fails
                    let val = res.deadline;
                    if (val.length > 16) val = val.substring(0, 16);
                    document.getElementById('global-deadline').value = val;
                }
            } catch (e) {
                console.error('Date parsing failed', e);
            }
        } else {
            console.log('Deadline not set or error', res.error);
        }
    } catch (e) {
        console.error('Failed to load deadline', e);
    }
};

window.saveDeadlineSettings = async function () {
    const val = document.getElementById('global-deadline').value;
    if (!val) {
        if (!confirm('期限をクリア（無期限）にしますか？')) return;
    }

    try {
        const res = await GasAPI.adminDeadlineSettings(val);
        if (res.success) {
            alert('保存しました');
        } else {
            alert('保存失敗: ' + res.error);
        }
    } catch (e) {
        alert('エラー: ' + e.message);
    }
};

// --- BACKUP & RESTORE UI ---

async function loadBackupsForUI() {
    const tbody = document.querySelector('#table-backups tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> 読み込み中...</td></tr>';

    const res = await adminGetBackups();
    tbody.innerHTML = '';

    if (!res.success) {
        tbody.innerHTML = `<tr><td colspan="3" style="color:red;">エラー: ${res.error}</td></tr>`;
        return;
    }

    if (!res.backups || res.backups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">バックアップはありません</td></tr>';
        return;
    }

    res.backups.forEach(backup => {
        const tr = document.createElement('tr');
        const dateStr = new Date(backup.created).toLocaleString();
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><a href="${backup.url}" target="_blank">${backup.name}</a></td>
            <td>
                <button class="btn-danger btn-sm" onclick="restoreBackupForUI('${backup.id}')">復元</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function createBackupForUI() {
    if (!confirm('現在のデータベースのバックアップを作成しますか？\n（数秒〜数十秒かかる場合があります）')) return;

    const btn = document.querySelector('button[onclick="createBackupForUI()"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 作成中...';

    const res = await adminBackupDatabase();

    btn.disabled = false;
    btn.innerHTML = originalText;

    if (res.success) {
        alert(`バックアップが完了しました。\n保存先: ${res.name}`);
        loadBackupsForUI();
    } else {
        alert(`バックアップに失敗しました: ${res.error}`);
    }
}

async function restoreBackupForUI(backupId) {
    if (!confirm('【警告】\n選択したバックアップからデータベースを復元します。\n\n・現在のデータは全て上書き（削除）されます。\n・この操作は取り消せません。\n\n本当に実行しますか？')) return;

    const userInput = prompt('確認のため "RESTORE" と入力してください:');
    if (userInput !== 'RESTORE') {
        alert('入力が一致しないためキャンセルしました。');
        return;
    }

    const restoreKey = prompt('セキュリティのため、復元用キー(RESTORE_KEY)を入力してください:');
    if (!restoreKey) {
        alert('キーが入力されなかったためキャンセルしました。');
        return;
    }

    const btn = document.querySelector(`button[onclick="restoreBackupForUI('${backupId}')"]`);
    if (btn) btn.disabled = true;

    const loading = document.createElement('div');
    loading.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);color:white;display:flex;justify-content:center;align-items:center;z-index:9999;flex-direction:column;";
    loading.innerHTML = '<div><i class="fas fa-spinner fa-spin fa-3x"></i></div><div style="margin-top:20px;">復元中... ページを閉じないでください</div>';
    document.body.appendChild(loading);

    const res = await adminRestoreDatabase(backupId, restoreKey);

    document.body.removeChild(loading);
    if (btn) btn.disabled = false;

    if (res.success) {
        alert('復元が完了しました。ページをリロードします。');
        location.reload();
    } else {
        alert(`復元に失敗しました: ${res.error}`);
    }
}

window.createBackupForUI = createBackupForUI;
window.loadBackupsForUI = loadBackupsForUI;
window.restoreBackupForUI = restoreBackupForUI;


// --- Scheduled Maintenance ---

async function loadMaintenanceStatus() {
    const statusText = document.getElementById('maint-status-text');
    const startInput = document.getElementById('maint-start');
    const endInput = document.getElementById('maint-end');

    if (!statusText) return; // UI might not exist yet if partial load

    try {
        const res = await adminGetMaintenanceSchedule();
        if (res.success) {
            if (res.enabled) {
                const now = new Date();
                const start = res.start ? new Date(res.start) : new Date(0);
                const end = res.end ? new Date(res.end) : null;

                let statusStr = '';
                if (now < start) {
                    statusStr = `予約中 (開始: ${new Date(res.start).toLocaleString()})`;
                    statusText.className = 'badge bg-warning text-dark';
                } else if (!end || now <= end) {
                    statusStr = 'メンテナンス中 (LOCKED)';
                    statusText.className = 'badge bg-danger';
                } else {
                    statusStr = '終了 (無効化待ち)';
                    statusText.className = 'badge bg-secondary';
                }

                if (end) statusStr += ` ～ ${new Date(res.end).toLocaleString()}`;

                statusText.textContent = statusStr;

                // Helper to format Date to "YYYY-MM-DDTHH:mm" in LOCAL time
                const toLocalISOString = (date) => {
                    const pad = (n) => n < 10 ? '0' + n : n;
                    return date.getFullYear() +
                        '-' + pad(date.getMonth() + 1) +
                        '-' + pad(date.getDate()) +
                        'T' + pad(date.getHours()) +
                        ':' + pad(date.getMinutes());
                };

                // Set inputs to current values (Local Time)
                if (res.start && startInput) startInput.value = toLocalISOString(new Date(res.start));
                if (res.end && endInput) endInput.value = toLocalISOString(new Date(res.end));

            } else {
                statusText.textContent = '未設定 (稼働中)';
                statusText.className = 'badge bg-success';
                if (startInput) startInput.value = '';
                if (endInput) endInput.value = '';
            }
        } else {
            statusText.textContent = '取得エラー';
        }
    } catch (e) {
        console.error(e);
        statusText.textContent = 'エラー';
    }
}

async function saveMaintenanceSchedule() {
    const startVal = document.getElementById('maint-start').value;
    const endVal = document.getElementById('maint-end').value;

    if (!startVal) {
        alert('開始日時を設定してください。\n（即時開始したい場合は現在時刻を指定）');
        return;
    }

    const start = new Date(startVal);
    const end = endVal ? new Date(endVal) : null;

    if (end && start >= end) {
        alert('終了日時は開始日時より後に設定してください。');
        return;
    }

    if (!confirm('メンテナンススケジュールを設定しますか？\n設定された時間帯は全ての利用者がアクセスできなくなります。')) return;

    const password = prompt('設定のため、最高管理者パスワードを入力してください:');
    if (!password) return;

    // Convert to ISO string for storage
    const startIso = start.toISOString();
    const endIso = end ? end.toISOString() : null;

    try {
        const res = await adminSetMaintenanceSchedule(true, startIso, endIso, password);
        if (res.success) {
            alert('設定しました。');
            loadMaintenanceStatus();
        } else {
            alert(`失敗しました: ${res.error || res.message}`);
        }
    } catch (e) {
        alert(`エラー: ${e.message}`);
    }
}

async function clearMaintenanceSchedule() {
    if (!confirm('メンテナンス設定を解除しますか？\nシステムは即座に通常稼働に戻ります。')) return;

    const password = prompt('解除のため、最高管理者パスワードを入力してください:');
    if (!password) return;

    try {
        const res = await adminSetMaintenanceSchedule(false, null, null, password);
        if (res.success) {
            alert('解除しました。');
            loadMaintenanceStatus();
        } else {
            alert(`失敗しました: ${res.error || res.message}`);
        }
    } catch (e) {
        alert(`エラー: ${e.message}`);
    }
}

window.loadMaintenanceStatus = loadMaintenanceStatus;
window.saveMaintenanceSchedule = saveMaintenanceSchedule;
window.clearMaintenanceSchedule = clearMaintenanceSchedule;
