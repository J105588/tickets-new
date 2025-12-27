import { loadSidebar, toggleSidebar, showModeChangeModal } from './sidebar.js';
import { DemoMode } from './config.js';
import GasAPI from './optimized-api.js';

(async () => {
  try {
    if (window.systemLockReady && typeof window.systemLockReady.then === 'function') {
      await window.systemLockReady;
    }
  } catch (_) { }

  // DEMO Init
  try { DemoMode.ensureDemoParamInLocation(); } catch (_) { }
  loadSidebar();
  try { if (DemoMode.isActive()) DemoMode.showNotificationIfNeeded(true); } catch (_) { }

  // Global Exports
  window.toggleSidebar = toggleSidebar;
  window.showModeChangeModal = showModeChangeModal;

  // Render Groups
  await renderGroups();

})();

import { fetchMasterDataFromSupabase } from './supabase-client.js';

// ... (existing imports)

async function renderGroups() {
  const container = document.querySelector('.grid-container');
  if (!container) return;

  // Show loading
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>読み込み中...</p></div>';

  let data = null;

  // 1. Try Direct Supabase Fetch (Fastest)
  try {
    const sbRes = await fetchMasterDataFromSupabase();
    if (sbRes.success) {
      console.log('Fetched data from Supabase directly');
      data = sbRes.data;
    }
  } catch (e) {
    console.warn('Supabase direct fetch failed, falling back to GAS:', e);
  }

  // 2. Fallback to GAS API if Supabase failed
  if (!data) {
    try {
      const res = await GasAPI.getMasterData();
      if (res.success) {
        console.log('Fetched data from GAS');
        data = res.data;
      } else {
        console.error('GAS master data fetch failed:', res.error);
      }
    } catch (e) {
      console.error('GAS fetch error:', e);
    }
  }

  if (data) {
    const groups = data.groups || [];
    if (groups.length === 0) {
      container.innerHTML = '<p>表示可能な公演団体がありません。</p>';
      return;
    }

    container.innerHTML = ''; // Request clear
    const sorted = groups.filter(g => g.is_active).sort((a, b) => a.display_order - b.display_order);

    sorted.forEach(g => {
      const a = document.createElement('a');
      a.className = 'grid-item';
      // Pass group name as parameter. 
      // Note: Existing logic uses Name. Future might transition to ID.
      a.href = `pages/timeslot.html?group=${encodeURIComponent(g.name)}`;
      a.textContent = g.name;
      container.appendChild(a);
    });
  } else {
    container.innerHTML = '<p class="error">データの読み込みに失敗しました。</p>';
  }
}
