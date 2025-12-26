/**
 * MasterDataAPI.gs
 * マスタデータ（団体、日程、時間帯）のCRUD操作を提供するAPI
 */

// ==========================================
// マスタデータ一括取得 (Get Master Data)
// ==========================================

/**
 * 画面表示に必要な全マスタデータを取得する
 * 予約画面や管理画面の初期化に使用
 */
function getMasterData() {
  try {
    const groupsRes = supabaseIntegration._request('groups?is_active=eq.true&order=display_order.asc');
    const datesRes = supabaseIntegration._request('event_dates?is_active=eq.true&order=display_order.asc');
    const slotsRes = supabaseIntegration._request('time_slots?order=display_order.asc');
    
    // エラーチェック (どれか失敗したらエラーとして扱うか、空配列で返すか。今回は堅牢にエラー報告)
    if (!groupsRes.success) throw new Error('団体データの取得に失敗: ' + groupsRes.error);
    if (!datesRes.success) throw new Error('日程データの取得に失敗: ' + datesRes.error);
    if (!slotsRes.success) throw new Error('時間帯データの取得に失敗: ' + slotsRes.error);

    return {
      success: true,
      data: {
        groups: groupsRes.data,
        dates: datesRes.data,
        timeslots: slotsRes.data
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// 個別CRUD (管理者用 - 必要に応じて実装)
// ==========================================

/**
 * 団体を追加・更新
 */
function saveGroup(data) {
  // data: { id?: number, name: string, display_order?: number, is_active?: boolean }
  // Upsert logic
  const payload = {
    name: data.name,
    display_order: data.display_order,
    is_active: data.is_active,
    updated_at: new Date().toISOString()
  };
  if (data.id) payload.id = data.id;
  
  const options = {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' }, // upsert
    body: payload,
    useServiceRole: true // Admin operation needs privileges
  };
  
  return supabaseIntegration._request('groups', options);
}

/**
 * 日程を追加・更新
 */
function saveEventDate(data) {
  const payload = {
    date_label: data.date_label,
    display_order: data.display_order,
    is_active: data.is_active,
    updated_at: new Date().toISOString()
  };
  if (data.id) payload.id = data.id;
  
  const options = {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: payload,
    useServiceRole: true
  };
  
  return supabaseIntegration._request('event_dates', options);
}

/**
 * 時間帯を追加・更新
 */
function saveTimeSlot(data) {
  const payload = {
    slot_code: data.slot_code,
    start_time: data.start_time,
    end_time: data.end_time,
    display_order: data.display_order,
    updated_at: new Date().toISOString()
  };
  if (data.id) payload.id = data.id;
  
  const options = {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: payload,
    useServiceRole: true
  };
  
  return supabaseIntegration._request('time_slots', options);
}
