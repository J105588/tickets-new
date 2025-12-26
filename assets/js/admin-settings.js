/**
 * admin-settings.js
 * マスタデータ設定画面の制御
 */

import { apiUrlManager } from './config.js';

let masterData = {
    groups: [],
    dates: [],
    timeslots: []
};

document.addEventListener('DOMContentLoaded', () => {
    fetchMasterData();
});

async function fetchMasterData() {
    try {
        const apiUrl = apiUrlManager.getCurrentUrl();
        const url = `${apiUrl}?action=get_master_data`;
        const response = await fetch(url);
        const json = await response.json();

        if (json.success) {
            masterData = json.data;
            renderAll();
            document.getElementById('loading').style.display = 'none';
            document.getElementById('main-content').style.display = 'block';
        } else {
            alert('データ読み込み失敗: ' + json.error);
        }
    } catch (e) {
        console.error(e);
        alert('通信エラー');
    }
}

function renderAll() {
    renderGroups();
    renderDates();
    renderSlots();
}

function renderGroups() {
    const tbody = document.querySelector('#groups-table tbody');
    tbody.innerHTML = '';

    masterData.groups.forEach(g => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${g.display_order}</td>
            <td>${g.name}</td>
            <td>
                <span class="${g.is_active ? 'status-active' : 'status-inactive'}">
                    ${g.is_active ? '有効' : '無効'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-secondary">編集</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderDates() {
    const tbody = document.querySelector('#dates-table tbody');
    tbody.innerHTML = '';

    masterData.dates.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.display_order}</td>
            <td>${d.date_label}</td>
            <td>
                <span class="${d.is_active ? 'status-active' : 'status-inactive'}">
                    ${d.is_active ? '有効' : '無効'}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderSlots() {
    const tbody = document.querySelector('#slots-table tbody');
    tbody.innerHTML = '';

    masterData.timeslots.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${s.slot_code}</td>
            <td>${s.start_time} - ${s.end_time}</td>
            <td>
                <button class="btn btn-sm btn-outline-secondary">編集</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.showAddGroupModal = function () {
    alert('この機能はまだ実装されていません。\nデータベースのgroupsテーブルを直接編集するか、今後のアップデートをお待ちください。');
};
