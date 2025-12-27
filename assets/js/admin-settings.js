/**
 * admin-settings.js
 * (GAS API版 - 完全リライト)
 */

import {
    fetchMasterDataFromSupabase,
    adminFetchSchedules,
    adminManageSchedule,
    adminDeleteSchedule,
    adminManageMaster
} from './supabase-client.js';

let masterData = {
    groups: [],
    dates: [],
    timeslots: [],
    schedules: []
};

document.addEventListener('DOMContentLoaded', async () => {
    await loadAllData();
});

async function loadAllData() {
    // Show loading
    // const loader = document.getElementById('loading'); // if exists

    const [mRes, sRes] = await Promise.all([
        fetchMasterDataFromSupabase(),
        adminFetchSchedules()
    ]);

    if (mRes.success) {
        masterData.groups = mRes.data.groups || [];
        masterData.dates = mRes.data.dates || [];
        masterData.timeslots = mRes.data.timeslots || [];
    } else {
        alert('マスタデータ取得エラー: ' + mRes.error);
    }

    if (sRes.success) {
        masterData.schedules = sRes.data || [];
    } else {
        console.error('Schedules fetch error:', sRes.error);
    }

    renderGroups();
    renderTimeslots();
    renderSchedules();
}

// --- Renderers ---

function renderGroups() {
    const tbody = document.querySelector('#table-groups tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Sort
    const sorted = [...masterData.groups].sort((a, b) => a.display_order - b.display_order);

    sorted.forEach(g => {
        const tr = document.createElement('tr');
        const statusBadge = g.is_active
            ? '<span class="badge badge-active">有効</span>'
            : '<span class="badge badge-inactive">無効</span>';

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

function renderTimeslots() {
    const tbody = document.querySelector('#table-timeslots tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const sorted = [...masterData.timeslots].sort((a, b) => {
        // Sort by start_time string
        return (a.start_time || '').localeCompare(b.start_time || '');
    });

    sorted.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${t.slot_code}</strong></td>
            <td>${t.start_time || ''} - ${t.end_time || ''}</td>
            <td>
                <button class="btn-sm" onclick="openTimeslotModal(${t.id})">編集</button>
                <button class="btn-danger btn-sm" onclick="deleteItem('time_slots', ${t.id})">削除</button>
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
        return a.group_name.localeCompare(b.group_name);
    });

    sorted.forEach(s => {
        const tr = document.createElement('tr');
        // s.timeslot is code string
        tr.innerHTML = `
            <td>${s.group_name}</td>
            <td>${s.day}日目</td>
            <td><span class="badge">${s.timeslot}</span></td>
            <td>
                <button class="btn-sm" onclick="openScheduleModal('${s.id}')">編集</button>
                <button class="btn-danger btn-sm" onclick="deleteScheduleEntry(${s.id})">削除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Modals & Actions ---

window.closeModal = (id) => {
    document.getElementById(id).classList.remove('active');
};

// Groups
window.openGroupModal = (id = null) => {
    const modal = document.getElementById('modal-group');
    const item = id ? masterData.groups.find(g => g.id === id) : {};

    document.getElementById('group-id').value = id || '';
    document.getElementById('group-name').value = item.name || '';
    document.getElementById('group-order').value = item.display_order || 10;

    // Check if active selector exists or if we should use boolean
    const activeSel = document.getElementById('group-active');
    if (activeSel) {
        activeSel.value = item.is_active === false ? 'false' : 'true';
    }

    modal.classList.add('active');
};

window.saveGroup = async () => {
    const id = document.getElementById('group-id').value;
    const data = {
        name: document.getElementById('group-name').value,
        display_order: parseInt(document.getElementById('group-order').value),
        is_active: document.getElementById('group-active').value === 'true'
    };
    if (id) data.id = parseInt(id);

    if (!data.name) return alert('名前は必須です');

    const res = await adminManageMaster('groups', 'save', data);
    if (res.success) {
        alert('保存しました');
        closeModal('modal-group');
        loadAllData();
    } else {
        alert('エラー: ' + res.error);
    }
};

// Timeslots
window.openTimeslotModal = (id = null) => {
    const modal = document.getElementById('modal-timeslot');
    // find strict equality for number, or loose for string id
    const item = id ? masterData.timeslots.find(t => t.id == id) : {};

    document.getElementById('slot-id').value = id || '';
    document.getElementById('slot-code').value = item.slot_code || '';
    document.getElementById('slot-start').value = item.start_time || '';
    document.getElementById('slot-end').value = item.end_time || '';

    modal.classList.add('active');
};

window.saveTimeslot = async () => {
    const id = document.getElementById('slot-id').value;
    const data = {
        slot_code: document.getElementById('slot-code').value,
        start_time: document.getElementById('slot-start').value,
        end_time: document.getElementById('slot-end').value,
        display_order: 10 // default
    };
    if (id) data.id = parseInt(id);

    if (!data.slot_code) return alert('コードは必須です');

    const res = await adminManageMaster('time_slots', 'save', data);
    if (res.success) {
        alert('保存しました');
        closeModal('modal-timeslot');
        loadAllData();
    } else {
        alert('エラー: ' + res.error);
    }
};

// Schedules
window.openScheduleModal = (id = null) => {
    const modal = document.getElementById('modal-schedule');
    // Populate dropdowns first
    const selGroup = document.getElementById('sched-group');
    const selTimeslot = document.getElementById('sched-timeslot');

    selGroup.innerHTML = '';
    masterData.groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.name;
        opt.textContent = g.name;
        selGroup.appendChild(opt);
    });

    selTimeslot.innerHTML = '';
    masterData.timeslots.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.slot_code;
        opt.textContent = `${t.slot_code} (${t.start_time}-${t.end_time})`;
        selTimeslot.appendChild(opt);
    });

    // Determine values
    let item = {};
    if (id) {
        item = masterData.schedules.find(s => s.id == id);
    }

    document.getElementById('sched-id').value = item?.id || '';
    if (item && item.group_name) selGroup.value = item.group_name;
    document.getElementById('sched-day').value = item?.day || '1';
    if (item && item.timeslot) selTimeslot.value = item.timeslot;

    modal.classList.add('active');
};

window.saveSchedule = async () => {
    const id = document.getElementById('sched-id').value;
    const data = {
        group_name: document.getElementById('sched-group').value,
        day: parseInt(document.getElementById('sched-day').value),
        timeslot: document.getElementById('sched-timeslot').value
    };
    if (id) data.id = parseInt(id);

    const res = await adminManageSchedule(data);
    if (res.success) {
        alert('保存しました');
        closeModal('modal-schedule');
        loadAllData();
    } else {
        alert('エラー: ' + res.error);
    }
};

window.deleteScheduleEntry = async (id) => {
    if (!confirm('本当に削除しますか？\n（関連する座席データも削除されます）')) return;
    const res = await adminDeleteSchedule(id);
    if (res.success) {
        alert('削除しました');
        loadAllData();
    } else {
        alert('エラー: ' + res.error);
    }
};

// Generic Delete for Master
window.deleteItem = async (table, id) => {
    if (!confirm('本当に削除しますか？')) return;
    const res = await adminManageMaster(table, 'delete', { id: id });
    if (res.success) {
        alert('削除しました');
        loadAllData();
    } else {
        alert('エラー: ' + res.error);
    }
};
