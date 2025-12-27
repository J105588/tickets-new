// timeslot-main.js
import GasAPI from './optimized-api.js'; // Updated import
import { DemoMode } from './config.js';
import { loadSidebar, toggleSidebar } from './sidebar.js';

// --- Global State ---
let availableSchedules = [];
let masterDates = [];
let masterTimeslots = [];

(async () => {
  // Demo / Init checks
  try { if (window.systemLockReady && typeof window.systemLockReady.then === 'function') await window.systemLockReady; } catch (_) { }
  try { DemoMode.ensureDemoParamInLocation(); } catch (_) { }
  try { if (DemoMode.isActive() || DemoMode.isGeneproActive()) DemoMode.showNotificationIfNeeded(); } catch (_) { }

  const urlParams = new URLSearchParams(window.location.search);
  const requestedGroup = urlParams.get('group') || '';

  // Demo Guard
  const ok = DemoMode.guardGroupAccessOrRedirect(requestedGroup, `timeslot.html?group=${encodeURIComponent(DemoMode.demoGroup)}`);
  if (!ok) return;
  const groupName = DemoMode.enforceGroup(requestedGroup);

  document.getElementById('group-name').textContent = groupName;
  loadSidebar();

  // Load Data
  await loadDynamicSchedule(groupName);

  // Globals
  window.toggleSidebar = toggleSidebar;
  window.selectTimeslot = selectTimeslot;
})();

import { fetchMasterDataFromSupabase, fetchPerformancesFromSupabase } from './supabase-client.js';

// ... (existing imports)

async function loadDynamicSchedule(groupName) {
  const container = document.getElementById('timeslot-container');
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>データ読み込み中...</p></div>';

  let mData = null;
  let sData = null;

  // 1. Try Direct Supabase Fetch
  try {
    const [mRes, pRes] = await Promise.all([
      fetchMasterDataFromSupabase(),
      fetchPerformancesFromSupabase(groupName)
    ]);

    if (mRes.success && pRes.success) {
      console.log('Fetched schedule from Supabase directly');
      mData = mRes.data;
      sData = pRes.data; // This is filtered performances for the group
    }
  } catch (e) {
    console.warn('Supabase direct fetch failed:', e);
  }

  // 2. Fallback to GAS API
  if (!mData || !sData) {
    console.log('Falling back to GAS API for schedule...');
    try {
      const [mRes, sRes] = await Promise.all([
        GasAPI.getMasterData(),
        GasAPI._callApi('get_all_schedules', [])
      ]);

      if (mRes.success && sRes.success) {
        mData = mRes.data;
        // Filter all schedules manually since GAS returns everything
        sData = (sRes.data || []).filter(s => s.group_name === groupName);
      } else {
        console.error('GAS fetch failed', mRes.error, sRes.error);
      }
    } catch (e) {
      console.error('GAS execution error:', e);
    }
  }

  if (mData && sData) {
    masterDates = mData.dates || [];
    masterTimeslots = mData.timeslots || [];
    availableSchedules = sData;

    if (availableSchedules.length === 0) {
      container.innerHTML = '<div class="no-data">現在、予約可能な公演はありません。</div>';
      return;
    }

    renderDynamicUI(container);
  } else {
    container.innerHTML = '<div class="error">スケジュール情報の取得に失敗しました。</div>';
  }
}

function renderDynamicUI(container) {
  container.innerHTML = '';

  // Group by Day
  // Day in schedule is an ID (e.g. 1, 2) or label? 
  // In our admin logic, we saved it as integer ID.
  // MasterData.dates has id, date_label.

  // Map schedules to Days
  const schedulesByDay = {};
  availableSchedules.forEach(s => {
    if (!schedulesByDay[s.day]) schedulesByDay[s.day] = [];
    schedulesByDay[s.day].push(s);
  });

  // Render Logic: Iterate Master Dates (to keep order) and check if we have schedules
  const sortedDates = masterDates
    .filter(d => d.is_active !== false)
    .sort((a, b) => a.display_order - b.display_order);

  if (sortedDates.length === 0) {
    // Fallback if no master dates but we have schedules (legacy support)
    // Just Use keys from schedulesByDay
    Object.keys(schedulesByDay).forEach(dayId => {
      renderDaySection(container, dayId, `Day ${dayId}`, schedulesByDay[dayId]);
    });
    return;
  }

  sortedDates.forEach(date => {
    const daySchedules = schedulesByDay[date.id];
    if (daySchedules && daySchedules.length > 0) {
      renderDaySection(container, date.id, date.date_label, daySchedules);
    }
  });
}

function renderDaySection(container, dayId, dayLabel, schedules) {
  const section = document.createElement('section');
  section.className = 'timeslot-section';

  const h2 = document.createElement('h2');
  h2.className = 'day-title';
  h2.textContent = dayLabel;
  section.appendChild(h2);

  const grid = document.createElement('div');
  grid.className = 'grid-container';

  // Sort schedules by timeslot code/time
  // We need to resolve timeslot code order.
  // Map timeslot code to MasterTimeslot object for sorting
  const enriched = schedules.map(s => {
    const ts = masterTimeslots.find(t => t.slot_code === s.timeslot);
    return {
      ...s,
      start_time: ts ? ts.start_time : s.timeslot // Fallback
    };
  });

  enriched.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  enriched.forEach(s => {
    const btn = document.createElement('a');
    btn.className = 'grid-item';
    btn.href = 'javascript:void(0)';

    // Find timeslot details for label
    const ts = masterTimeslots.find(t => t.slot_code === s.timeslot);
    // Display only Time Range
    const timeLabel = ts ? `${ts.start_time} - ${ts.end_time}` : s.timeslot;

    btn.textContent = timeLabel;
    btn.onclick = (e) => {
      e.preventDefault();
      selectTimeslot(dayId, s.timeslot);
    };
    grid.appendChild(btn);
  });

  section.appendChild(grid);
  container.appendChild(section);
}

function selectTimeslot(day, timeslot) {
  const urlParams = new URLSearchParams(window.location.search);
  let group = urlParams.get('group');
  if (DemoMode.isActive()) group = DemoMode.enforceGroup(group);

  // Check mode
  const isAdmin = urlParams.get('admin') === 'true';
  const currentMode = localStorage.getItem('currentMode') || 'normal';

  if (currentMode === 'normal') {
    alert('権限がありません：通常モードでは時間帯を開けません。');
    return;
  }

  let targetPage = 'seats.html';
  let params = `?group=${encodeURIComponent(group)}&day=${day}&timeslot=${encodeURIComponent(timeslot)}`;
  if (isAdmin) params += '&admin=true';
  if (DemoMode.isActive()) params += '&demo=1';

  if (currentMode === 'walkin') targetPage = 'walkin.html';

  window.location.href = targetPage + params;
}
