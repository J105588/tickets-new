// CodeWithSupabase.gs
// 既存のCode.gsをSupabase対応に更新したバージョン

// ===============================================================
// === API処理 (POSTリクエスト) - Supabase対応版 ===
// ===============================================================

function doPost(e) {
  let response;
  let callback = e.parameter && e.parameter.callback;

  // プリフライトリクエストの場合の処理
  if (e.method === "OPTIONS") {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "3600"
    };
    return ContentService.createTextOutput("")
      .setMimeType(ContentService.MimeType.TEXT)
      .setHeaders(headers);
  }

  try {
    const body = e.postData.contents;
    const params = {};
    body.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      params[key] = JSON.parse(decodeURIComponent(value.replace(/\+/g, ' ')));
    });

    const funcName = params.func;
    const funcParams = params.params || [];

    if (!funcName) {
      throw new Error("呼び出す関数が指定されていません。(funcが必要です)");
    }

    const functionMap = {
      'getSeatData': getSeatDataSupabase,
      'getSeatDataMinimal': getSeatDataMinimalSupabase,
      'reserveSeats': reserveSeatsSupabase,
      'checkInSeat': checkInSeatSupabase,
      'checkInMultipleSeats': checkInMultipleSeatsSupabase,
      'assignWalkInSeat': assignWalkInSeatSupabase,
      'assignWalkInSeats': assignWalkInSeatsSupabase,
      'assignWalkInConsecutiveSeats': assignWalkInConsecutiveSeatsSupabase,
      'verifyModePassword': verifyModePassword,
      'updateSeatData': updateSeatDataSupabase,
      'updateMultipleSeats': updateMultipleSeatsSupabase,
      'getAllTimeslotsForGroup': getAllTimeslotsForGroup,
      'testApi': testApiSupabase,
      'reportError': reportError,
      'getSystemLock': getSystemLock,
      'setSystemLock': setSystemLock,
      'execDangerCommand': execDangerCommand,
      'initiateDangerCommand': initiateDangerCommand,
      'confirmDangerCommand': confirmDangerCommand,
      'listDangerPending': listDangerPending,
      'performDangerAction': performDangerAction,
      'debugSpreadsheetStructure': debugSpreadsheetStructure,
      'getOrCreateLogSheet': getOrCreateLogSheet,
      'getOrCreateClientAuditSheet': getOrCreateClientAuditSheet,
      'appendClientAuditEntries': appendClientAuditEntries,
      'getOperationLogs': getOperationLogs,
      'getLogStatistics': getLogStatistics,
      'recordClientAudit': recordClientAudit,
      'getClientAuditLogs': getClientAuditLogs,
      'getClientAuditStatistics': getClientAuditStatistics,
      'getFullTimeslots': getFullTimeslotsSupabase,
      'getFullCapacityTimeslots': getFullCapacityTimeslotsSupabase,
      'setFullCapacityNotification': setFullCapacityNotification,
      'getFullCapacityNotificationSettings': getFullCapacityNotificationSettings,
      'sendFullCapacityEmail': sendFullCapacityEmail,
      'sendStatusNotificationEmail': sendStatusNotificationEmail,
      'getDetailedCapacityAnalysis': getDetailedCapacityAnalysisSupabase,
      'getCapacityStatistics': getCapacityStatisticsSupabase,
      'getGroupsSupabase': getGroupsSupabase,
      'isValidSeatId': isValidSeatId,
      'safeLogOperation': safeLogOperation
    };

    if (functionMap[funcName]) {
      response = functionMap[funcName].apply(null, funcParams);
      
      // ログ記録
      try {
        const userAgent = e.parameter.userAgent || 'Unknown';
        const ipAddress = e.parameter.ipAddress || 'Unknown';
        logOperation(funcName, funcParams, response, userAgent, ipAddress);
      } catch (logError) {
        Logger.log('Log recording failed for ' + funcName + ': ' + logError.message);
      }
    } else {
      throw new Error("無効な関数名です: " + funcName);
    }

  } catch (err) {
    response = { error: err.message };
  }

  // callback が無ければ純JSONで返却
  if (!callback) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(headers);
  }

  // JSONP形式でレスポンスを返す
  let output = callback + '(' + JSON.stringify(response) + ')';
  return ContentService.createTextOutput(output)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// ===============================================================
// === ページ表示処理 (GETリクエスト) - Supabase対応版 ===
// ===============================================================

/**
 * WebアプリケーションにGETリクエストが来たときに実行されるメイン関数。
 * POSTリクエストと同様に関数呼び出しを処理する。
 */
function doGet(e) {
  let response;
  let callback = e.parameter.callback; // コールバック関数名を取得

  try {
    const funcName = e.parameter.func;
    const paramsStr = e.parameter.params;
    
    if (!funcName) {
      // APIの状態情報を返す（関数呼び出しがない場合）
      response = {
        status: 'OK',
        message: 'Seat Management API is running (Supabase Version)',
        version: '3.0', // Supabase版
        supabase: true,
        migration: 'complete'
      };
    } else {
      // パラメータを解析
      const funcParams = paramsStr ? JSON.parse(decodeURIComponent(paramsStr)) : [];
      
      console.log('doGet: 関数呼び出し', { funcName, funcParams });
      
      const functionMap = {
        'getSeatData': getSeatDataSupabase,
        'getSeatDataMinimal': getSeatDataMinimalSupabase,
        'reserveSeats': reserveSeatsSupabase,
        'checkInSeat': checkInSeatSupabase,
        'checkInMultipleSeats': checkInMultipleSeatsSupabase,
        'assignWalkInSeat': assignWalkInSeatSupabase,
        'assignWalkInSeats': assignWalkInSeatsSupabase,
        'assignWalkInConsecutiveSeats': assignWalkInConsecutiveSeatsSupabase,
        'verifyModePassword': verifyModePassword,
        'updateSeatData': updateSeatDataSupabase,
        'updateMultipleSeats': updateMultipleSeatsSupabase,
        'getAllTimeslotsForGroup': getAllTimeslotsForGroup,
        'testApi': testApiSupabase,
        'reportError': reportError,
        'getSystemLock': getSystemLock,
        'setSystemLock': setSystemLock,
        'execDangerCommand': execDangerCommand,
        'initiateDangerCommand': initiateDangerCommand,
        'confirmDangerCommand': confirmDangerCommand,
        'listDangerPending': listDangerPending,
        'performDangerAction': performDangerAction,
        'debugSpreadsheetStructure': debugSpreadsheetStructure,
        'getOrCreateLogSheet': getOrCreateLogSheet,
        'getOrCreateClientAuditSheet': getOrCreateClientAuditSheet,
        'appendClientAuditEntries': appendClientAuditEntries,
        'recordClientAudit': recordClientAudit,
        'getClientAuditLogs': getClientAuditLogs,
        'getClientAuditStatistics': getClientAuditStatistics,
        'getFullTimeslots': getFullTimeslotsSupabase,
        'getFullCapacityTimeslots': getFullCapacityTimeslotsSupabase,
        'setFullCapacityNotification': setFullCapacityNotification,
        'getFullCapacityNotificationSettings': getFullCapacityNotificationSettings,
        'sendFullCapacityEmail': sendFullCapacityEmail,
        'sendStatusNotificationEmail': sendStatusNotificationEmail,
        'getDetailedCapacityAnalysis': getDetailedCapacityAnalysisSupabase,
        'getCapacityStatistics': getCapacityStatisticsSupabase,
        'getGroupsSupabase': getGroupsSupabase,
        'isValidSeatId': isValidSeatId,
        'safeLogOperation': safeLogOperation
      };

      if (functionMap[funcName]) {
        response = functionMap[funcName].apply(null, funcParams);
        
        // ログ記録（既存システムに影響を与えないよう安全に実装）
        try {
          const userAgent = e.parameter.userAgent || 'Unknown';
          const ipAddress = e.parameter.ipAddress || 'Unknown';
          logOperation(funcName, funcParams, response, userAgent, ipAddress);
        } catch (logError) {
          // ログ記録に失敗しても既存システムに影響を与えない
          Logger.log('Log recording failed for ' + funcName + ': ' + logError.message);
        }
      } else {
        throw new Error("無効な関数名です: " + funcName);
      }
    }
  } catch (err) {
    console.error('doGet処理エラー:', err);
    response = { success: false, error: err.message };
    
    // エラーログ記録
    try {
      const userAgent = e.parameter.userAgent || 'Unknown';
      const ipAddress = e.parameter.ipAddress || 'Unknown';
      logOperation('doGet_error', { error: err.message }, response, userAgent, ipAddress);
    } catch (logError) {
      Logger.log('Error log recording failed: ' + logError.message);
    }
  }

  // JSONP形式でレスポンスを返す
  let output = callback + '(' + JSON.stringify(response) + ')';
  return ContentService.createTextOutput(output)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// ===============================================================
// === Supabase対応のAPI関数 ===
// ===============================================================

/**
 * Supabaseから座席データを取得する
 */
async function getSeatDataSupabase(group, day, timeslot, isAdmin = false, isSuperAdmin = false) {
  try {
    // 公演IDを取得または作成
    const performanceResult = await getOrCreatePerformance(group, day, timeslot);
    if (!performanceResult.success) {
      return { success: false, error: performanceResult.error };
    }
    
    const performanceId = performanceResult.data.id;
    
    // 座席データを取得
    const seatsResult = await supabaseIntegration.getSeats(performanceId);
    if (!seatsResult.success) {
      return { success: false, error: '座席データの取得に失敗しました' };
    }
    
    // 座席データを整形（既存のスプレッドシート形式に合わせる）
    const seatMap = {};
    seatsResult.data.forEach(seat => {
      const seatId = seat.seat_id;
      const seatData = {
        id: seatId,
        status: mapSupabaseStatusToLegacy(seat.status),
        columnC: mapStatusToColumnC(seat.status),
        columnD: seat.reserved_by || '',
        columnE: seat.checked_in_at ? '済' : ''
      };
      
      // 管理者の場合のみ名前を追加
      if (isAdmin || isSuperAdmin) {
        seatData.name = seat.reserved_by || null;
      }
      
      seatMap[seatId] = seatData;
    });
    
    // 座席マップが空の場合は、デフォルトの座席を生成
    if (Object.keys(seatMap).length === 0) {
      Logger.log('座席データが空のため、デフォルト座席を生成します');
      // デフォルトの座席構造を生成（A1-E6の範囲）
      const defaultSeats = generateDefaultSeatMap();
      Object.assign(seatMap, defaultSeats);
    }
    
    Logger.log(`Supabase座席データを正常に取得: [${group}-${day}-${timeslot}], 座席数: ${Object.keys(seatMap).length}`);
    return { success: true, seatMap: seatMap };
    
  } catch (e) {
    Logger.log(`getSeatDataSupabase Error for ${group}-${day}-${timeslot}: ${e.message}`);
    return { success: false, error: `座席データの取得に失敗しました: ${e.message}` };
  }
}

/**
 * 最小限の座席データを取得する（Supabase版）
 */
function getSeatDataMinimalSupabase(group, day, timeslot, isAdmin = false) {
  try {
    const performanceResult = getOrCreatePerformance(group, day, timeslot);
    if (!performanceResult.success) {
      return { success: false, error: performanceResult.error };
    }
    
    const performanceId = performanceResult.data.id;
    const seatsResult = supabaseIntegration.getSeats(performanceId);
    
    if (!seatsResult.success) {
      return { success: false, error: '座席データの取得に失敗しました' };
    }
    
    const seatMap = {};
    seatsResult.data.forEach(seat => {
      const seatId = seat.seat_id;
      seatMap[seatId] = {
        id: seatId,
        status: mapSupabaseStatusToLegacy(seat.status)
      };
    });
    
    return { success: true, seatMap: seatMap };
    
  } catch (e) {
    Logger.log(`getSeatDataMinimalSupabase Error for ${group}-${day}-${timeslot}: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * 座席を予約する（Supabase版）
 */
function reserveSeatsSupabase(group, day, timeslot, selectedSeats) {
  if (!Array.isArray(selectedSeats) || selectedSeats.length === 0) {
    return { success: false, message: '予約する座席が選択されていません。' };
  }

  try {
    const performanceResult = getOrCreatePerformance(group, day, timeslot);
    if (!performanceResult.success) {
      return { success: false, message: performanceResult.error };
    }
    
    const performanceId = performanceResult.data.id;
    
    // 座席の予約
    const reserveResult = supabaseIntegration.reserveSeats(performanceId, selectedSeats, '予約者');
    if (!reserveResult.success) {
      return { success: false, message: '座席の予約に失敗しました' };
    }
    
    Logger.log(`Supabase座席予約完了: ${selectedSeats.join(', ')}`);
    return { success: true, message: `予約が完了しました。\n座席: ${selectedSeats.join(', ')}` };
    
  } catch (e) {
    Logger.log(`reserveSeatsSupabase Error for ${group}-${day}-${timeslot}: ${e.message}`);
    return { success: false, message: `予約エラー: ${e.message}` };
  }
}

/**
 * 座席をチェックインする（Supabase版）
 */
function checkInSeatSupabase(group, day, timeslot, seatId) {
  if (!seatId) {
    return { success: false, message: '座席IDが指定されていません' };
  }

  try {
    const performanceResult = getOrCreatePerformance(group, day, timeslot);
    if (!performanceResult.success) {
      return { success: false, message: performanceResult.error };
    }
    
    const performanceId = performanceResult.data.id;
    
    // 座席のチェックイン
    const checkInResult = supabaseIntegration.checkInSeats(performanceId, [seatId]);
    if (!checkInResult.success) {
      return { success: false, message: 'チェックインに失敗しました' };
    }
    
    Logger.log(`Supabase座席チェックイン完了: ${seatId}`);
    return { success: true, message: `${seatId} をチェックインしました。` };
    
  } catch (e) {
    Logger.log(`checkInSeatSupabase Error for ${group}-${day}-${timeslot}: ${e.message}`);
    return { success: false, message: e.message };
  }
}

/**
 * 複数の座席をチェックインする（Supabase版）
 */
function checkInMultipleSeatsSupabase(group, day, timeslot, seatIds) {
  if (!Array.isArray(seatIds) || seatIds.length === 0) {
    return { success: false, message: 'チェックインする座席が選択されていません。' };
  }

  try {
    const performanceResult = getOrCreatePerformance(group, day, timeslot);
    if (!performanceResult.success) {
      return { success: false, message: performanceResult.error };
    }
    
    const performanceId = performanceResult.data.id;
    
    // 複数座席のチェックイン
    const checkInResult = supabaseIntegration.checkInSeats(performanceId, seatIds);
    if (!checkInResult.success) {
      return { success: false, message: 'チェックインに失敗しました' };
    }
    
    Logger.log(`Supabase複数座席チェックイン完了: ${seatIds.join(', ')}`);
    return { success: true, message: `${seatIds.length}件の座席をチェックインしました。` };
    
  } catch (e) {
    Logger.log(`checkInMultipleSeatsSupabase Error for ${group}-${day}-${timeslot}: ${e.message}`);
    return { success: false, message: `チェックインエラー: ${e.message}` };
  }
}

/**
 * 当日券を発行する（Supabase版）
 */
function assignWalkInSeatSupabase(group, day, timeslot) {
  try {
    const performanceResult = getOrCreatePerformance(group, day, timeslot);
    if (!performanceResult.success) {
      return { success: false, message: performanceResult.error };
    }
    
    const performanceId = performanceResult.data.id;
    
    // 当日券の割り当て
    const walkInResult = supabaseIntegration.assignWalkInSeats(performanceId, 1);
    if (!walkInResult.success) {
      return { success: false, message: '当日券の割り当てに失敗しました' };
    }
    
    const assignedSeat = walkInResult.data[0].seatId;
    Logger.log(`Supabase当日券発行完了: ${assignedSeat}`);
    return { success: true, message: `当日券を発行しました！\n\nあなたの座席は 【${assignedSeat}】 です。`, seatId: assignedSeat };
    
  } catch (e) {
    Logger.log(`assignWalkInSeatSupabase Error for ${group}-${day}-${timeslot}: ${e.message}`);
    return { success: false, message: `エラーが発生しました: ${e.message}` };
  }
}

/**
 * 複数の当日券を発行する（Supabase版）
 */
function assignWalkInSeatsSupabase(group, day, timeslot, count) {
  if (!count || count < 1 || count > 6) {
    return { success: false, message: '有効な枚数を指定してください（1〜6枚）' };
  }

  try {
    const performanceResult = getOrCreatePerformance(group, day, timeslot);
    if (!performanceResult.success) {
      return { success: false, message: performanceResult.error };
    }
    
    const performanceId = performanceResult.data.id;
    
    // 複数当日券の割り当て
    const walkInResult = supabaseIntegration.assignWalkInSeats(performanceId, count);
    if (!walkInResult.success) {
      return { success: false, message: '当日券の割り当てに失敗しました' };
    }
    
    const assignedSeats = walkInResult.data.map(result => result.seatId);
    Logger.log(`Supabase複数当日券発行完了: ${assignedSeats.join(', ')}`);
    return { 
      success: true, 
      message: `当日券を${assignedSeats.length}枚発行しました！\n\n座席: ${assignedSeats.join(', ')}`, 
      seatIds: assignedSeats 
    };
    
  } catch (e) {
    Logger.log(`assignWalkInSeatsSupabase Error for ${group}-${day}-${timeslot}: ${e.message}`);
    return { success: false, message: `エラーが発生しました: ${e.message}` };
  }
}

/**
 * 連続席の当日券を発行する（Supabase版）
 */
function assignWalkInConsecutiveSeatsSupabase(group, day, timeslot, count) {
  if (!count || count < 1 || count > 12) {
    return { success: false, message: '有効な枚数を指定してください（1〜12枚）' };
  }

  try {
    const performanceResult = getOrCreatePerformance(group, day, timeslot);
    if (!performanceResult.success) {
      return { success: false, message: performanceResult.error };
    }
    
    const performanceId = performanceResult.data.id;
    
    // 利用可能な座席を取得（行・番号付き）
    const seatsResp = supabaseIntegration._request(
      `seats?performance_id=eq.${performanceId}&status=eq.available&select=seat_id,row_letter,seat_number`
    );
    if (!seatsResp.success) {
      return { success: false, message: '座席データの取得に失敗しました' };
    }
    const available = Array.isArray(seatsResp.data) ? seatsResp.data : [];
    if (available.length < count) {
      return { success: false, message: '利用可能な座席が不足しています' };
    }
    
  // 行ごとに番号でソートして連続ブロックを列挙し、ランダムに選ぶ
  const byRow = {};
  available.forEach(s => {
    const row = String(s.row_letter);
    if (!byRow[row]) byRow[row] = [];
    byRow[row].push({ id: s.seat_id, num: Number(s.seat_number) });
  });
  
  const candidateBlocks = [];
  Object.keys(byRow).forEach(row => {
    const arr = byRow[row].sort((a, b) => a.num - b.num);
    for (let i = 0; i + count - 1 < arr.length; i++) {
      const start = arr[i].num;
      const end = arr[i + count - 1].num;
      if (end - start + 1 !== count) continue;
      // 欠番チェック
      let contiguous = true;
      for (let k = 0; k < count; k++) {
        if (arr[i + k].num !== start + k) { contiguous = false; break; }
      }
      if (!contiguous) continue;
      // 通路跨ぎ禁止（C列の13-14間と25-26間）
      if (row === 'C') {
        const crossesFirst = (start <= 13 && end >= 14);
        const crossesSecond = (start <= 25 && end >= 26);
        if (crossesFirst || crossesSecond) continue;
      }
      candidateBlocks.push({ row: row, seats: arr.slice(i, i + count).map(x => x.id) });
    }
  });
  
  if (candidateBlocks.length === 0) {
    return { success: false, message: '指定枚数の連続席が見つかりませんでした。' };
  }
  // ランダムに一つ選択
  const picked = candidateBlocks[Math.floor(Math.random() * candidateBlocks.length)];
  const chosen = picked.seats;
  const chosenRow = picked.row;
    
    if (!chosen) {
      return { success: false, message: '指定枚数の連続席が見つかりませんでした。' };
    }
    
    // 選択した席を walkin に更新
    const now = new Date();
    const iso = now.toISOString();
    const pad = n => (n < 10 ? '0' + n : '' + n);
    const fmt = `${now.getFullYear()}/${pad(now.getMonth()+1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const reservedBy = `当日券_${fmt}`;
    const updates = chosen.map(seatId => ({
      seatId: seatId,
      data: { status: 'walkin', walkin_at: iso, reserved_at: iso, reserved_by: reservedBy }
    }));
    const updateResp = supabaseIntegration.updateMultipleSeats(performanceId, updates);
    if (!updateResp.success) {
      return { success: false, message: '当日券の割り当てに失敗しました' };
    }
    
    Logger.log(`Supabase連続当日券発行完了(${chosenRow}): ${chosen.join(', ')}`);
    return { success: true, message: `連続席(${count}席)を確保しました。\n座席: ${chosen.join(', ')}`, seatIds: chosen };
    
  } catch (e) {
    Logger.log(`assignWalkInConsecutiveSeatsSupabase Error for ${group}-${day}-${timeslot}: ${e.message}`);
    return { success: false, message: `エラーが発生しました: ${e.message}` };
  }
}

/**
 * 座席データを更新する（Supabase版）
 */
function updateSeatDataSupabase(group, day, timeslot, seatId, columnC, columnD, columnE) {
  try {
    const performanceResult = getOrCreatePerformance(group, day, timeslot);
    if (!performanceResult.success) {
      return { success: false, message: performanceResult.error };
    }
    
    const performanceId = performanceResult.data.id;
    
    // 座席データの更新
    const updates = {
      status: mapColumnCToSupabaseStatus(columnC),
      reserved_by: columnD,
      checked_in_at: columnE ? new Date().toISOString() : null
    };
    
    const updateResult = supabaseIntegration.updateSeat(performanceId, seatId, updates);
    if (!updateResult.success) {
      return { success: false, message: '座席データの更新に失敗しました' };
    }
    
    Logger.log(`Supabase座席データ更新完了: ${seatId}`);
    return { success: true, message: '座席データを更新しました' };
    
  } catch (e) {
    Logger.log(`updateSeatDataSupabase Error for ${group}-${day}-${timeslot}: ${e.message}`);
    return { success: false, message: `エラーが発生しました: ${e.message}` };
  }
}

/**
 * 複数座席の一括更新（Supabase版）
 */
function updateMultipleSeatsSupabase(group, day, timeslot, updates) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return { success: false, message: '更新する座席データが指定されていません。' };
  }

  try {
    const performanceResult = getOrCreatePerformance(group, day, timeslot);
    if (!performanceResult.success) {
      return { success: false, message: performanceResult.error };
    }
    
    const performanceId = performanceResult.data.id;
    
    // 複数座席の更新
    const supabaseUpdates = updates.map(update => ({
      seatId: update.seatId,
      data: {
        status: mapColumnCToSupabaseStatus(update.columnC),
        reserved_by: update.columnD,
        checked_in_at: update.columnE ? new Date().toISOString() : null
      }
    }));
    
    const updateResult = supabaseIntegration.updateMultipleSeats(performanceId, supabaseUpdates);
    if (!updateResult.success) {
      return { success: false, message: '座席データの更新に失敗しました' };
    }
    
    Logger.log(`Supabase複数座席更新完了: ${updates.length}件`);
    return { success: true, message: `${updates.length}件の座席を更新しました。` };
    
  } catch (e) {
    Logger.log(`updateMultipleSeatsSupabase Error for ${group}-${day}-${timeslot}: ${e.message}`);
    return { success: false, message: `エラーが発生しました: ${e.message}` };
  }
}

// ===============================================================
// === ヘルパー関数 ===
// ===============================================================

/**
 * 公演を取得または作成する
 */
async function getOrCreatePerformance(group, day, timeslot) {
  try {
    // 既存の公演を検索
    const existingResult = await supabaseIntegration.getPerformance(group, day, timeslot);
    if (existingResult.success && existingResult.data.length > 0) {
      return { success: true, data: existingResult.data[0] };
    }
    
    // 公演が存在しない場合は作成
    const createResult = await supabaseIntegration.createPerformance(group, day, timeslot);
    if (!createResult.success) {
      return { success: false, error: createResult.error };
    }
    
    // 座席データを生成
    await generateSeatsForPerformance(createResult.data.id);
    
    return { success: true, data: createResult.data };
    
  } catch (e) {
    Logger.log(`getOrCreatePerformance Error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * 公演の座席データを生成する
 */
async function generateSeatsForPerformance(performanceId) {
  try {
    // 座席設定に基づいて座席を生成
    const seatConfig = {
      'A': { start: 6, end: 33, count: 28 },
      'B': { start: 5, end: 34, count: 30 },
      'C': { start: 4, end: 35, count: 32 },
      'D': { start: 3, end: 36, count: 34 },
      'E': { start: 2, end: 37, count: 36 },
      'F': { start: 1, end: 38, count: 38 },
      'G': { start: 1, end: 38, count: 38 },
      'H': { start: 1, end: 38, count: 38 },
      'I': { start: 1, end: 38, count: 38 },
      'J': { start: 1, end: 38, count: 38 },
      'K': { start: 1, end: 38, count: 38 },
      'L': { start: 1, end: 38, count: 38 },
      'M': { start: 1, end: 38, count: 38 },
      'N': { start: 1, end: 38, count: 38 },
      'O': { start: 1, end: 38, count: 38 },
      'P': { start: 1, end: 38, count: 38 },
      'Q': { start: 1, end: 38, count: 38 },
      'R': { start: 1, end: 38, count: 38 },
      'S': { start: 1, end: 38, count: 38 }
    };
    
    // 各列の座席を生成
    for (const [row, config] of Object.entries(seatConfig)) {
      for (let seatNum = config.start; seatNum <= config.end; seatNum++) {
        const seatId = `${row}${seatNum}`;
        const seatData = {
          performance_id: performanceId,
          seat_id: seatId,
          row_letter: row,
          seat_number: seatNum,
          status: 'available',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        // 座席を作成
        await supabaseIntegration._request('seats', {
          method: 'POST',
          body: seatData
        });
      }
    }
    
    Logger.log(`座席データ生成完了: 公演ID ${performanceId}`);
    
  } catch (e) {
    Logger.log(`generateSeatsForPerformance Error: ${e.message}`);
  }
}

/**
 * Supabaseステータスを既存形式にマッピング（Code.gsの形式に合わせる）
 */
function mapSupabaseStatusToLegacy(supabaseStatus) {
  switch (supabaseStatus) {
    case 'available': return 'available';
    case 'reserved': return 'to-be-checked-in';
    case 'checked_in': return 'checked-in';
    case 'walkin': return 'walkin';
    case 'blocked': return 'unavailable';
    default: return 'available';
  }
}

/**
 * ステータスをC列の値にマッピング（Code.gsの形式に合わせる）
 */
function mapStatusToColumnC(status) {
  switch (status) {
    case 'available': return '空';
    case 'reserved': return '予約済';
    case 'checked_in': return '予約済';
    case 'walkin': return '予約済';
    case 'blocked': return '使用不可';
    default: return '空';
  }
}

/**
 * C列の値をSupabaseステータスにマッピング（Code.gsの形式に合わせる）
 */
function mapColumnCToSupabaseStatus(columnC) {
  switch (columnC) {
    case '空': return 'available';
    case '予約済': return 'reserved';
    case '確保': return 'reserved';
    case '使用不可': return 'blocked';
    default: return 'available';
  }
}

/**
 * デフォルト座席マップを生成する
 */
function generateDefaultSeatMap() {
  const seatMap = {};
  
  // A1-E6の範囲でデフォルト座席を生成
  const rows = ['A', 'B', 'C', 'D', 'E'];
  const maxSeats = { 'A': 12, 'B': 12, 'C': 12, 'D': 12, 'E': 6 };
  
  rows.forEach(row => {
    const maxSeat = maxSeats[row] || 6;
    for (let seatNum = 1; seatNum <= maxSeat; seatNum++) {
      const seatId = `${row}${seatNum}`;
      seatMap[seatId] = {
        id: seatId,
        status: 'available',
        columnC: '空',
        columnD: '',
        columnE: ''
      };
    }
  });
  
  return seatMap;
}

/**
 * Supabase対応のテストAPI
 */
function testApiSupabase() {
  const results = {};
  
  try {
    // Supabase接続テスト
    const connectionTest = supabaseIntegration.testConnection();
    results.supabaseConnection = connectionTest.success ? "OK" : "NG: " + connectionTest.error;
  } catch (e) {
    results.supabaseConnection = "NG: " + e.message;
  }
  
  try {
    // 座席データ取得テスト
    const testResult = getSeatDataSupabase("見本演劇", "1", "A", false, false);
    results.getSeatData = testResult.success ? "OK" : "NG: " + (testResult.error || "unknown error");
  } catch (e) {
    results.getSeatData = "NG: " + e.message;
  }
  
  return { success: true, data: results };
}
