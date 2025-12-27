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

/**
 * マスタデータを削除 (deleteMaster)
 * @param {string} table - groups, event_dates, time_slots
 * @param {number} id
 */
function deleteMaster(table, id) {
  // テーブル名検証
  const allowed = ['groups', 'event_dates', 'time_slots'];
  if (!allowed.includes(table)) {
    return { success: false, error: 'Invalid table for delete: ' + table };
  }

  try {
    const options = {
      method: 'DELETE',
      useServiceRole: true
    };
    
    // id=eq.X
    return supabaseIntegration._request(`${table}?id=eq.${id}`, options);
    
  } catch (e) {
    return { success: false, error: e.message };
  }
}


// ==========================================
// スケジュール管理 (Schedule Management)
// ==========================================

/**
 * 全スケジュール（公演設定）を取得
 * 団体名、日付、時間帯を含む
 */
function getAllSchedules() {
  try {
    // 必要な情報を結合して取得
    // Supabaseの結合クエリを使用: performances -> groups, event_dates
    // MEMO: 単純な結合が難しいため、個別取得してマージするか、Viewを作成するのがベストだが、
    // ここではGAS側でマージする方式をとる（データ量も少ないため）
    
    // 1. 公演データ
    const perfRes = supabaseIntegration._request('performances?order=id.asc');
    if (!perfRes.success) throw new Error('公演データの取得に失敗: ' + perfRes.error);
    
    // 2. マスタデータ (キャッシュ活用または再取得)
    const master = getMasterData();
    if (!master.success) throw new Error(master.error);
    
    const groups = master.data.groups;
    const dates = master.data.dates;
    
    // 3. マージ
    const schedules = perfRes.data.map(perf => {
       // group_name is directly stored in performances in this system
       // day is day number (1, 2...)
       
       return {
         id: perf.id,
         group_name: perf.group_name,
         day: perf.day, // 1, 2
         timeslot: perf.timeslot, // "10:00" or "A"
         created_at: perf.created_at
       };
    });

    return { success: true, data: schedules };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * スケジュール（公演）を保存（作成または更新）
 * @param {Object} data - { id?, group_name, day, timeslot }
 */
function saveSchedule(data) {
  try {
     // IDがあれば更新、なければ新規作成（同一団体・日程の重複チェックは行わない＝複数許可）
     
     if (data.id) {
        // 更新 (Update)
        const updateRes = supabaseIntegration._request(`performances?id=eq.${data.id}`, {
           method: 'PATCH',
           body: { 
             group_name: data.group_name, // 変更可能に
             day: data.day,               // 変更可能に
             timeslot: data.timeslot,
             updated_at: new Date().toISOString()
           },
           useServiceRole: true
        });
        return updateRes;
     } else {
        // 新規作成 (Create)
        const createRes = supabaseIntegration._request('performances', {
           method: 'POST',
           body: {
             group_name: data.group_name,
             day: data.day,
             timeslot: data.timeslot,
             created_at: new Date().toISOString(),
             updated_at: new Date().toISOString()
           },
           useServiceRole: true
        });
        
        // 新規作成時は座席も生成する
        if (createRes.success && createRes.data && createRes.data.length > 0) {
           const newPerfId = createRes.data[0].id;
           generateSeatsForPerformance(newPerfId); 
        }
        
        return createRes;
     }

  } catch (e) {
    if (e.message.indexOf('duplicate key value') !== -1 || e.message.indexOf('23505') !== -1) {
      return { success: false, error: 'この公演（団体・日程・時間帯）は既に登録されています。' };
    }
    return { success: false, error: e.message };
  }
}

/**
 * スケジュール（公演）を削除
 * @param {number} id
 */
function deleteSchedule(id) {
  try {
     // 関連する座席データも削除する必要があるが、Supabase側でCASCADE設定されているか確認。
     // GAS側で明示的に消すのが安全。
     // まず座席削除
     const seatsDel = supabaseIntegration._request(`seats?performance_id=eq.${id}`, {
        method: 'DELETE',
        useServiceRole: true
     });
     
     if (!seatsDel.success) {
       // 座席削除失敗しても公演削除トライするか？一応エラー返す
       return { success: false, error: '関連座席の削除に失敗しました: ' + seatsDel.error };
     }

     // 公演削除
     const perfDel = supabaseIntegration._request(`performances?id=eq.${id}`, {
        method: 'DELETE',
        useServiceRole: true
     });
     
     return perfDel;

  } catch (e) {
    return { success: false, error: e.message };
  }
}
