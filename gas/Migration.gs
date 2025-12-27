/**
 * Migration.gs
 * データ移行用スクリプト
 */

function migrateTimeslotsToNewFormat() {
  const MAPPING = {
    "オーケストラ部": { "1": "10:00", "2": "14:00" },
    "吹奏楽部": { "1": "11:00", "2": "15:00" },
    "マーチング": { "1": "12:00", "2": "16:00" },
    "音楽部": { "1": "13:00", "2": "17:00" },
    "演劇部": { "1": "14:00", "2": "18:00" },
    "見本演劇": { "1": "15:00", "2": "19:00" }
  };
  
  const TIME_DEFINITIONS = {
    "10:00": { start: "10:00", end: "11:00" },
    "11:00": { start: "11:00", end: "12:00" },
    "12:00": { start: "12:00", end: "13:00" },
    "13:00": { start: "13:00", end: "14:00" },
    "14:00": { start: "14:00", end: "15:00" },
    "15:00": { start: "15:00", end: "16:00" },
    "16:00": { start: "16:00", end: "17:00" },
    "17:00": { start: "17:00", end: "18:00" },
    "18:00": { start: "18:00", end: "19:00" },
    "19:00": { start: "19:00", end: "20:00" }
  };

  const logs = [];
  logs.push("Migration Started: 'A' -> Time Format + TimeSlot Seeding");

  try {
    // 1. Seed Time Slots
    for (const [code, times] of Object.entries(TIME_DEFINITIONS)) {
       const upsertPayload = {
         slot_code: code,
         start_time: times.start,
         end_time: times.end,
         display_order: parseInt(code.replace(':','')), // e.g. 1000
         updated_at: new Date().toISOString()
       };
       // Search existing to get ID or just try insert?
       // Simplest: Check existence by slot_code
       const check = supabaseIntegration._request(`time_slots?slot_code=eq.${code}`);
       if (check.success && check.data.length === 0) {
         const res = supabaseIntegration._request('time_slots', { method: 'POST', body: upsertPayload });
         if (res.success) logs.push(`[CREATED] TimeSlot ${code}`);
         else logs.push(`[ERROR] Create TimeSlot ${code}: ${res.error}`);
       } else {
         logs.push(`[SKIP] TimeSlot ${code} exists`);
       }
    }

    // 2. Update Performances
    for (const [group, days] of Object.entries(MAPPING)) {
      for (const [day, newTime] of Object.entries(days)) {
        // 既存の 'A' の公演を探す
        const query = `performances?group_name=eq.${encodeURIComponent(group)}&day=eq.${day}&timeslot=eq.A&select=id`;
        const res = supabaseIntegration._request(query);
        
        if (res.success && res.data.length > 0) {
          const perfId = res.data[0].id;
          
          // timeslotを更新
          const updateRes = supabaseIntegration._request(`performances?id=eq.${perfId}`, {
            method: 'PATCH',
            body: { timeslot: newTime }
          });
          
          if (updateRes.success) {
            logs.push(`[SUCCESS] Updated ${group} Day ${day}: id=${perfId} -> ${newTime}`);
          } else {
            logs.push(`[ERROR] Failed to update ${group} Day ${day}: ${updateRes.error}`);
          }
        } else {
          logs.push(`[SKIP] No 'A' record found for ${group} Day ${day}`);
        }
      }
    }
  } catch (e) {
    logs.push(`[FATAL] Exception: ${e.message}`);
  }
  
  return { success: true, logs: logs };
}
