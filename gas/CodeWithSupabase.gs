// CodeWithSupabase.gs
// 既存のCode.gsをSupabase対応に更新したバージョン

// ===============================================================
// === API処理 (POSTリクエスト) - Supabase対応版 ===
// ===============================================================

function doPost(e) {
  let response;
  let callback = e.parameter && e.parameter.callback;

  // プリフライトリクエスト
  if (e.method === "OPTIONS") {
    return ContentService.createTextOutput("")
      .setMimeType(ContentService.MimeType.TEXT)
      .setHeaders({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "3600"
      });
  }

  try {
    const postData = e.postData ? e.postData.contents : "";
    let params = {};
    let action = e.parameter.action;

    // JSONパース試行
    try {
      params = JSON.parse(postData);
      if (params.action) action = params.action;
    } catch (jsonErr) {
      // JSONでない場合は従来のフォーム形式として解析
      postData.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
          params[key] = JSON.parse(decodeURIComponent(value.replace(/\+/g, ' ')));
        }
      });
    }

    // 1. 新しいActionベースのルーティング (予約システム用)
    if (action) {
      switch (action) {
        case 'create_reservation':
          // params自体がデータの役割
          response = createReservation(params);
          break;
        case 'check_in':
          response = checkInReservation(params.id, params.passcode);
          break;
        case 'cancel_reservation':
          response = cancelReservation(params.id, params.passcode);
          break;
        case 'getSystemLock':
          response = getSystemLock();
          break;
        case 'setSystemLock':
          response = setSystemLock(params.shouldLock, params.password);
          break;
        case 'getMaintenanceSchedule':
          response = getMaintenanceSchedule();
          break;
        case 'setMaintenanceSchedule':
          response = setMaintenanceSchedule(params.enabled, params.start, params.end, params.password);
          break;
        case 'delete_schedule':
          response = adminDeleteSchedule(params.id);
          break;
        case 'admin_reset_performance':
          response = adminResetPerformance(params.performanceId);
          break;
        case 'admin_generate_invite_token':
          response = adminGenerateInviteToken(params.minutes);
          break;
        default:
          throw new Error("不明なアクション: " + action);
      }
    } 
    // 2. 従来のfunc/paramsベースのルーティング
    else {
      const funcName = params.func;
      const funcParams = params.params || [];
      if (!funcName) throw new Error("呼び出す関数が指定されていません。(funcまたはactionが必要です)");

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
        'getMaintenanceSchedule': getMaintenanceSchedule,
        'setMaintenanceSchedule': setMaintenanceSchedule,
        'execDangerCommand': execDangerCommand,
        'initiateDangerCommand': initiateDangerCommand,
        'confirmDangerCommand': confirmDangerCommand,
        'listDangerPending': listDangerPending,
        'performDangerAction': performDangerAction,
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
        // Backup & Restore
        'backupDatabase': backupDatabase,
        'getBackupsList': getBackupsList,
        'restoreDatabase': restoreDatabase,
        'getGroupsSupabase': getGroupsSupabase,
        'isValidSeatId': isValidSeatId,
        'safeLogOperation': safeLogOperation,
        'login': login,
        'validateSession': validateSession,

        // Admin API
        'adminChangeSeats': adminChangeSeats,
        'adminResendEmail': adminResendEmail,
        'adminCancelReservation': adminCancelReservation,
        'adminUpdateReservation': adminUpdateReservation,
        'getAdminReservations': getAdminReservations,
        'adminSendSummaryEmails': adminSendSummaryEmails,
        'adminResetPerformance': adminResetPerformance,
        'generateAdminInviteToken': generateAdminInviteToken,
        'validateAdminToken': validateAdminToken,
        'getGlobalDeadline': getGlobalDeadline,
        'saveGlobalDeadline': saveGlobalDeadline,

        // Master Data API
        'get_master_data': getMasterData,
        'getMasterData': getMasterData,
        'saveGroup': saveGroup,
        'saveEventDate': saveEventDate,
        'saveTimeSlot': saveTimeSlot,
        'deleteMaster': deleteMaster,
        'getAllSchedules': getAllSchedules,
        'saveSchedule': saveSchedule,
        'deleteSchedule': deleteSchedule,

        // Admin Notices
        'broadcastAdminNotice': broadcastAdminNotice,
        'fetchAdminNotices': fetchAdminNotices
      };

      if (functionMap[funcName]) {
        response = functionMap[funcName].apply(null, funcParams);
        // ログ記録
        try {
          const userAgent = e.parameter.userAgent || 'Unknown';
          const ipAddress = e.parameter.ipAddress || 'Unknown';
          logOperation(funcName, funcParams, response, userAgent, ipAddress);
        } catch (_) {}
      } else {
        throw new Error("無効な関数名です: " + funcName);
      }
    }

  } catch (err) {
    response = { error: err.message };
  }

  // レスポンス返却
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  const outputStr = JSON.stringify(response);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + outputStr + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(outputStr)
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders(headers);
}

// ===============================================================
// === ページ表示処理 (GETリクエスト) - Supabase対応版 ===
// ===============================================================

/**
 * WebアプリケーションにGETリクエストが来たときに実行されるメイン関数。
 * POSTリクエストと同様に関数呼び出しを処理する。
 */
// POSTリクエストもdoGetで処理（CORS対応のため、レスポンス形式はdoGet内で統一）
function doPost(e) {
  return doGet(e);
}


function doGet(e) {
  let response;
  let callback = e.parameter.callback;

  try {
    const action = e.parameter.action;
    
    // 1. Actionベースのルーティング
    if (action) {
       switch (action) {
         case 'get_seats':
           // group, day, timeslot from params
           response = getSeatDataSupabase(
             e.parameter.group, 
             parseInt(e.parameter.day), 
             e.parameter.timeslot
           );
           break;
         case 'get_booking_details':
           response = getBookingDetails(e.parameter.id, e.parameter.passcode);
           break;
         case 'get_performances':
           response = getPerformancesForGroup(e.parameter.group);
           break;
         case 'get_master_data':
           response = getMasterData();
           break;
         case 'create_reservation':
           var resData = {
               group: e.parameter.group ? e.parameter.group.trim() : "",
               day: parseInt(e.parameter.day),
               timeslot: e.parameter.timeslot ? e.parameter.timeslot.trim() : "",
               name: e.parameter.name,
               email: e.parameter.email,
               grade_class: e.parameter.grade_class,
               club_affiliation: e.parameter.club_affiliation,
               seats: []
           };
           // seats handling (comma separated string)
           if (e.parameter.seats) {
               resData.seats = e.parameter.seats.split(',');
           }
           response = createReservation(resData);
           break;
         case 'cancel_reservation':
           response = cancelReservation(e.parameter.id, e.parameter.passcode, e.parameter.ip, e.parameter.user_agent);
           break;
         
         // --- 管理者追加機能 ---
         case 'admin_get_reservations':
           var filters = {
             group: e.parameter.group,
             day: e.parameter.day,
             timeslot: e.parameter.timeslot,
             year: e.parameter.year,
             class_num: e.parameter.class_num,
             search: e.parameter.search // [Fix] Param passing missing
           };
           response = getAdminReservations(filters);
           break;
           
         case 'admin_resend_email':
           response = adminResendEmail(e.parameter.id);
           break;
           
         case 'admin_change_seats':
           var newSeats = e.parameter.seats ? e.parameter.seats.split(',') : [];
           response = adminChangeSeats(e.parameter.id, newSeats);
           break;
           
           case 'admin_update_reservation':
             var updates = {
                name: e.parameter.name,
                email: e.parameter.email,
                grade_class: e.parameter.grade_class,
                club_affiliation: e.parameter.club_affiliation,
                club_affiliation: e.parameter.club_affiliation,
                notes: e.parameter.notes,
                status: e.parameter.status
             };
             // Remove undefined
             Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);
             
             response = adminUpdateReservation(e.parameter.id, updates);
             break;
             
           case 'admin_send_summary_email':
             var jobs = JSON.parse(e.parameter.jobs || '[]');
             response = adminSendSummaryEmails(jobs);
             break;
             
         case 'admin_cancel_reservation':
           // 管理者権限でのキャンセル（パスコード不要バージョン、ログ残すなど）
           // ここでは既存のcancelReservationを再利用しつつ、passcodeチェックを回避するラッパーが必要だか、
           // adminResendEmailと同様に内部で処理するAdminAPI側関数を作るべき。
           // いったん既存APIをパスコード付きで呼ぶか、AdminAPIにadminCancelReservationを作るか。
           // AdminAPIに `adminCancelReservation(id)` を追加するのがベスト。
           // 今回はAdminAPI.gsに未実装なので、既存cancelReservationを呼ぶことはできない（パスコード知らないため）。
           // AdminAPI.gs に adminCancelを追加していないので、ここで直接実装するかAdminAPIへ。
           // -> AdminAPI.gsに追加実装するほうが良い。
           response = adminCancelReservation(e.parameter.id);
           break;
           
         case 'check_in':
           // Adminスキャン、または自己チェックイン
           response = checkInReservation(e.parameter.id, e.parameter.passcode);
           break;
                    case 'verify_admin_password':
            const propPass = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD_2');
            
            if (!propPass) {
               response = { success: false, error: '管理者パスワードがサーバーに設定されていません' };
            } else {
               const correctPassword = propPass.trim();
               const inputPassword = e.parameter.password ? e.parameter.password.trim() : '';
               
               if (inputPassword === correctPassword) {
                 response = { success: true };
               } else {
                 response = { success: false, error: 'パスワードが違います' };
               }
            }
            break;

          case 'getSystemLock':
            response = getSystemLock();
            break;
          case 'setSystemLock':
            response = setSystemLock(e.parameter.shouldLock, e.parameter.password);
            break;
          case 'getMaintenanceSchedule':
            response = getMaintenanceSchedule();
            break;
          case 'setMaintenanceSchedule':
            response = setMaintenanceSchedule(e.parameter.enabled, e.parameter.start, e.parameter.end, e.parameter.password);
            break;

          case 'get_all_schedules':
             response = getAllSchedules();
             break;

          case 'save_schedule':
             var schedData = {
                 id: e.parameter.id,
                 group_name: e.parameter.group_name,
                 day: e.parameter.day,
                 timeslot: e.parameter.timeslot
             };
             // Remove undefined
             if(!schedData.id) delete schedData.id;
             response = saveSchedule(schedData);
             break;

          case 'delete_schedule':
             // スケジュール（公演）を削除
             var delId = e.parameter.id ? parseInt(e.parameter.id) : null;
             if (!delId) {
                response = { success: false, error: 'ID is required' };
             } else {
                response = deleteSchedule(delId);
             }
             break;

          case 'admin_reset_performance':
             response = adminResetPerformance(e.parameter.performanceId);
             break;

          case 'admin_generate_invite_token':
             var mins = e.parameter.minutes ? parseInt(e.parameter.minutes) : 30;
             response = generateAdminInviteToken(mins);
             break;

          case 'admin_deadline_settings':
             var op = e.parameter.op; // 'get' or 'save'
             if (op === 'save') {
                 response = saveGlobalDeadline(e.parameter.value);
             } else {
                 response = getGlobalDeadline();
             }
             break;


          case 'admin_manage_master':
             // マスタデータ管理 (Save/Delete)
             var table = e.parameter.table;
             var op = e.parameter.op; // 'save' or 'delete'
             var dataStr = e.parameter.data;
             var data = dataStr ? JSON.parse(dataStr) : {};

             if (op === 'delete') {
                 if (!data.id) { response = { success: false, error: 'ID required for delete' }; }
                 else { response = deleteMaster(table, data.id); }
             } else if (op === 'save') {
                 if (table === 'groups') response = saveGroup(data);
                 else if (table === 'event_dates') response = saveEventDate(data);
                 else if (table === 'time_slots') response = saveTimeSlot(data);
                 else response = { success: false, error: 'Unknown table' };
             } else {
                 response = { success: false, error: 'Unknown op' };
             }
             break;
            
          case 'migrate_timeslots':
            response = migrateTimeslotsToNewFormat();
            break;
           
         default:
           throw new Error("不明なアクション: " + action);
       }
    } 
    // 2. 従来のfunc/paramsベース
    else {
      const funcName = e.parameter.func;
      const paramsStr = e.parameter.params;
      
      if (!funcName) {
        // デフォルトステータス
        response = {
          status: 'OK',
          app: 'Ticket Reserve System',
          version: '3.1',
          mode: 'Supabase'
        };
      } else {
        const funcParams = paramsStr ? JSON.parse(decodeURIComponent(paramsStr)) : [];
        const functionMap = {
          'getSeatData': getSeatDataSupabase,
          // ... (simplified list for brevity in replacement if possible, but safer to keep all)
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
          // Backup & Restore
          'backupDatabase': backupDatabase,
          'getBackupsList': getBackupsList,
          'restoreDatabase': restoreDatabase,
          'getGroupsSupabase': getGroupsSupabase,
          'isValidSeatId': isValidSeatId,
          'safeLogOperation': safeLogOperation,
          'login': login,
          'validateSession': validateSession,
          'get_master_data': getMasterData,
          'get_all_schedules': getAllSchedules
        };

        if (functionMap[funcName]) {
          response = functionMap[funcName].apply(null, funcParams);
        } else {
          throw new Error("無効な関数名です: " + funcName);
        }
      }
    }
  } catch (err) {
    response = { error: err.message };
  }

  const outputStr = JSON.stringify(response);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + outputStr + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    // CORS Header
    return ContentService.createTextOutput(outputStr)
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
      });
  }
}

// ===============================================================
// === Supabase対応のAPI関数 ===
// ===============================================================

/**
 * Supabaseから座席データを取得する
 */
// NOTE: SECURITY UPDATE - token引数を追加し、サーバー側で権限を検証する
async function getSeatDataSupabase(group, day, timeslot, isAdmin = false, isSuperAdmin = false, token = null) {
  try {
    // セキュリティチェック: 管理者権限を要求する場合、トークンの検証を強制
    if (isAdmin || isSuperAdmin) {
      let isVerified = false;
      if (token) {
        const session = validateSession(token);
        if (session.success) {
          isVerified = true;
          // 将来的には session.userId に基づいて管理者権限をさらに厳密にチェック可能
          // 現状は有効なセッション (ログイン済み) であれば管理者とみなす
        }
      }
      
      if (!isVerified) {
        // 検証失敗: 管理者権限を剥奪して実行（一般公開データのみ返す）
        // ただし、完全に拒否するのではなく、一般ユーザーとして振る舞うことでUXを維持
        isAdmin = false;
        isSuperAdmin = false;
        Logger.log(`Security Warning: Unauthorized admin access attempt for ${group}-${day}-${timeslot}. Downgrading to public view.`);
      }
    }

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
        // bookingsテーブルのnotesを優先、なければseatsテーブルのnotes
        columnE: (seat.bookings && seat.bookings.notes) ? seat.bookings.notes : (seat.notes || '')
      };
      
      // 管理者の場合のみ名前と予約IDを追加
      if (isAdmin || isSuperAdmin) {
        seatData.name = seat.reserved_by || null;
        seatData.reservation_id = seat.booking_id || null; // Rebookingのために必須
      } else {
        // 一般ユーザーには個人情報を隠蔽 (念のため明示的にnullセット)
        seatData.name = null;
        seatData.reservation_id = null;
        seatData.columnD = ''; // 予約者名も隠す
        seatData.columnE = ''; // メモも隠す
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
    
    Logger.log(`Supabase座席データを正常に取得: [${group}-${day}-${timeslot}], 座席数: ${Object.keys(seatMap).length}, Admin: ${isAdmin}`);
    return { success: true, seatMap: seatMap };
    
  } catch (e) {
    Logger.log(`getSeatDataSupabase Error for ${group}-${day}-${timeslot}: ${e.message}`);
    return { success: false, error: `座席データの取得に失敗しました: ${e.message}` };
  }
}

/**
 * 最小限の座席データを取得する（Supabase版）
 */
// NOTE: SECURITY UPDATE - token引数を追加
function getSeatDataMinimalSupabase(group, day, timeslot, isAdmin = false, token = null) {
  try {
     // セキュリティチェック
    if (isAdmin) {
      let isVerified = false;
      if (token) {
        const session = validateSession(token);
        if (session.success) isVerified = true;
      }
      if (!isVerified) {
        isAdmin = false; // Downgrade to public
      }
    }

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
    Logger.log(`[updateSeatDataSupabase] Start: Group=${group}, Day=${day}, Time=${timeslot}, Seat=${seatId}`);
    Logger.log(`[updateSeatDataSupabase] Inputs: C=${columnC}, D=${columnD}, E=${columnE}`);

    const performanceResult = getOrCreatePerformance(group, day, timeslot);
    if (!performanceResult.success) {
      return { success: false, message: performanceResult.error };
    }
    
    const performanceId = performanceResult.data.id;
    
    const newStatus = mapColumnCToSupabaseStatus(columnC);

    // 座席データの更新ペイロード作成
    let updates = {
      status: newStatus,
      reserved_by: columnD,
      notes: columnE, 
      checked_in_at: (newStatus === 'checked_in') ? new Date().toISOString() : null
    };

    // ステータスが「空（available）」になる場合、予約との紐付けを解除する
    if (newStatus === 'available') {
      updates.booking_id = null;
      updates.reserved_by = null; // 名前もクリア
      updates.notes = null;       // メモもクリア
    }
    
    let updateResult = supabaseIntegration.updateSeat(performanceId, seatId, updates);
    
    // columnsエラー（特にnotesがない場合）の対策: 再試行
    if (!updateResult.success) {
      console.warn('更新失敗、notesを除外して再試行します。', seatId, updateResult.error);
      delete updates.notes;
      updateResult = supabaseIntegration.updateSeat(performanceId, seatId, updates);
    }
    
    if (!updateResult.success) {
      return { success: false, message: '座席データの更新に失敗しました: ' + (updateResult.error || '不明なエラー') };
    }

    // 更新対象が見つからなかった場合(success=trueだがdataが空)
    if (!updateResult.data || updateResult.data.length === 0) {
      Logger.log(`[updateSeatDataSupabase] No rows updated! PerformanceID=${performanceId}, SeatID=${seatId}`);
      return { success: false, message: '更新対象の座席が見つかりませんでした。データが不整合の可能性があります。' };
    }
    
    // booking_idがある場合、bookingsテーブルも連動して更新する
    // updateResult.data[0]には更新「後」のデータが入るが、booking_idがnullに更新された場合、
    // ここでbooking_idが取れない可能性があるため、更新前のデータが必要？
    // Supabaseのupdateレスポンスは更新後の行を返す。
    // 「空」にした場合、booking_idはnullになっているので、ここでのbooking更新がスキップされてしまう！
    // 対策: booking_idの取得には「更新前」の状態を知る必要があるが、
    // ここでは簡易的に「更新結果にbooking_idがあれば更新、なければキャンセル処理はできない...？」
    // 解決策: updateSeatの前に現在の座席データを取得するか、
    // frontendからbooking_idを送ってもらうか、
    // または、updateSeatのレスポンスにbooking_idが含まれていなくても、
    // 「空」にする操作の場合は、本来は「紐付いていた予約」をキャンセルすべき。
    
    // しかし、updateSeatでbooking_id=nullにすると、もう紐付けが切れているので、
    // booking_idを知る由もない。
    // そこで、updateSeatをする「前」にgetSeatsするか、
    // あるいは、updateSeatDataSupabaseでは「座席の更新」に集中し、
    // bookingのキャンセルは「booking_idが判明している」場合に限る？
    
    // 既存のコードは updateResult.data[0].booking_id を見ている。
    // もし今回 booking_id: null にしてたら、ここは null になる。
    // したがって、「空」にした瞬間に予約をキャンセルするロジックが動かない。
    
    // 修正: まず現在の座席データを取得して booking_id を確保する、のが確実だが、
    // パフォーマンス低下を懸念。
    // しかし正確性優先。現状の座席を取得する。
    
    // 待てよ、updateResult.data[0] は「更新された行」だが、
    // select指定しないと全て返る。
    // もし booking_id を null にしたら null が返る。
    
    // 対策: updateSeat処理の前に、現在のbooking_idを取得しておく。
    // しかし、getSeatsは少し重い。
    // ここは「予約のキャンセル」は必須要件か？
    // 「空」にしたのに「予約」が生きてると、座席なし予約が残る。
    // これはデータ不整合。
    // したがって、キャンセルすべき。
    
    // 事前にbooking_idを取得するための軽量クエリを実行
    let previousBookingId = null;
    if (newStatus === 'available') {
       const checkQuery = supabaseIntegration._request(`seats?performance_id=eq.${performanceId}&seat_id=eq.${seatId}&select=booking_id`);
       if (checkQuery.success && checkQuery.data && checkQuery.data.length > 0) {
         previousBookingId = checkQuery.data[0].booking_id;
       }
    }
    
    // --- 予約の連動更新 ---
    
    // 1. 今回の操作で紐付けが解除された予約 (Availableになった場合)
    if (previousBookingId) {
       Logger.log(`紐付け解除された予約をキャンセルします: ${previousBookingId}`);
       supabaseIntegration.updateBooking(previousBookingId, {
         status: 'cancelled',
         notes: '管理者による座席解放のため自動キャンセル'
       });
    }
    
    // 2. 紐付けが継続している予約の更新 (Available以外)
    if (newStatus !== 'available' && updateResult.data && updateResult.data.length > 0) {
      const seatData = updateResult.data[0];
      if (seatData.booking_id) {
         let bookingUpdates = {};
         
         // 1. メモの同期 (E列 -> notes)
         if (columnE !== undefined) {
           bookingUpdates.notes = columnE;
         }
         
         // 2. 名前の同期 (D列 -> name)
         // 空文字も許容して同期する（削除対応）
         if (columnD !== undefined) {
           bookingUpdates.name = columnD;
         }
         
         // E列の内容による自動チェックイン判定を廃止 (ステータス依存に変更)
         // if (columnE && (columnE.includes('済') || columnE.toLowerCase().includes('check'))) {
         //   updates.checked_in_at = new Date().toISOString();
         // }
         
         // 3. ステータスの同期
         if (newStatus === 'checked_in') {
           bookingUpdates.status = 'checked_in';
           bookingUpdates.checked_in_at = new Date().toISOString();
         } else if (newStatus === 'reserved') {
           // 既にcancelledなどでない限りconfirmedにする
           bookingUpdates.status = 'confirmed';
           bookingUpdates.checked_in_at = null;
           
           // ステータス更新は慎重に。
           // チェックイン取消の場合は confirmed に戻す
           // キャンセルを取り消して復活させる場合も confirmed
           // bookingUpdates.status = 'confirmed';
           // bookingUpdates.checked_in_at = null;
         }
         
         // 更新実行
         if (Object.keys(bookingUpdates).length > 0) {
           const bookingResult = supabaseIntegration.updateBooking(seatData.booking_id, bookingUpdates);
           if (!bookingResult.success) {
             console.error('予約情報の同期に失敗しました:', seatData.booking_id, bookingResult.error);
           } else {
             Logger.log(`予約情報同期完了: Booking ID ${seatData.booking_id}, Updates: ${JSON.stringify(bookingUpdates)}`);
           }
         }
      }
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
    
    // 1. Availableになる座席を特定し、関連する予約をキャンセルする
    const turningAvailable = updates.filter(u => mapColumnCToSupabaseStatus(u.columnC) === 'available').map(u => u.seatId);
    
    if (turningAvailable.length > 0) {
      // 現在のbooking_idを取得 (キャンセル用)
      // 数が多い場合は分割すべきだが、通常運用範囲内と想定
      // in.()構文を使用
      const q = `performance_id=eq.${performanceId}&seat_id=in.(${turningAvailable.join(',')})&select=booking_id`;
      const current = supabaseIntegration._request(`seats?${q}`);
      
      if (current.success && current.data) {
        const bIds = current.data.map(s => s.booking_id).filter(id => id);
        if (bIds.length > 0) {
           Logger.log(`一括解放された座席の予約をキャンセルします: ${bIds.length}件`);
           bIds.forEach(bid => {
             supabaseIntegration.updateBooking(bid, { 
               status: 'cancelled',
               notes: '管理者による一括座席解放のため自動キャンセル'
             });
           });
        }
      }
    }

    // 複数座席の更新ペイロード作成
    const supabaseUpdates = updates.map(update => {
      const s = mapColumnCToSupabaseStatus(update.columnC);
      const data = {
        status: s,
        reserved_by: update.columnD,
        notes: update.columnE, // E列はメモとして保存
        checked_in_at: (s === 'checked_in') ? new Date().toISOString() : null
      };
      
      // Availableなら紐付け解除
      if (s === 'available') {
         data.booking_id = null;
         data.reserved_by = null;
         data.notes = null;
      }
      
      return { seatId: update.seatId, data: data };
    });
    
    const updateResult = supabaseIntegration.updateMultipleSeats(performanceId, supabaseUpdates);
    if (!updateResult.success) {
      return { success: false, message: '座席データの更新に失敗しました' };
    }
    
    // booking_idごとの更新を集約して同期
    // 成功した座席データのbooking_idを収集
    const bookingUpdatesMap = {}; // bookingId -> { notes, name, status... }
    
    if (updateResult.data && Array.isArray(updateResult.data)) {
      updateResult.data.forEach(res => {
        if (!res.success || !res.data || res.data.length === 0) return;
        const seat = res.data[0];
        const bookingId = seat.booking_id;
        
        if (bookingId) {
          // 元の更新リクエストから対応するデータを検索
          // seatIdでマッチング
          const originalUpdate = updates.find(u => u.seatId === seat.seat_id);
          if (originalUpdate) {
             if (!bookingUpdatesMap[bookingId]) bookingUpdatesMap[bookingId] = {};
             
             // メモ同期 (上書き)
             if (originalUpdate.columnE !== undefined) {
               bookingUpdatesMap[bookingId].notes = originalUpdate.columnE;
             }
             // 名前同期 (上書き, 空も許容)
             if (originalUpdate.columnD !== undefined) {
               bookingUpdatesMap[bookingId].name = originalUpdate.columnD;
             }
             // ステータス同期
             const s = mapColumnCToSupabaseStatus(originalUpdate.columnC);
             if (s === 'checked_in') {
               bookingUpdatesMap[bookingId].status = 'checked_in';
               bookingUpdatesMap[bookingId].checked_in_at = new Date().toISOString();
             } else if (s === 'reserved') {
               bookingUpdatesMap[bookingId].status = 'confirmed';
               bookingUpdatesMap[bookingId].checked_in_at = null;
             }
          }
        }
      });
      
      // booking更新実行
      const bookingIds = Object.keys(bookingUpdatesMap);
      if (bookingIds.length > 0) {
        Logger.log(`一括更新に伴う予約情報同期: ${bookingIds.length}件の予約`);
        bookingIds.forEach(bid => {
           const bUpdate = bookingUpdatesMap[bid];
           if (Object.keys(bUpdate).length > 0) {
             supabaseIntegration.updateBooking(bid, bUpdate);
           }
        });
      }
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

/**
 * 公演を取得または作成する
 */
function getOrCreatePerformance(group, day, timeslot) {
  try {
    // 既存の公演を検索
    const existingResult = supabaseIntegration.getPerformance(group, day, timeslot);
    if (existingResult.success && existingResult.data.length > 0) {
      return { success: true, data: existingResult.data[0] };
    }
    
    // 公演が存在しない場合は作成
    const createResult = supabaseIntegration.createPerformance(group, day, timeslot);
    if (!createResult.success) {
      return { success: false, error: createResult.error };
    }
    
    // 座席データを生成
    generateSeatsForPerformance(createResult.data.id);
    
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
    case 'reserved': return 'reserved';
    case 'checked_in': return 'checked-in';
    case 'walkin': return 'walkin';
    case 'blocked': return 'blocked';
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
    case 'checked_in': return 'チェックイン済';
    case 'walkin': return '当日券';
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
    case 'チェックイン済': return 'checked_in';
    case '当日券': return 'walkin';
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

/**
 * サーバ側ログイン: Script Properties に保存した認証情報と照合し、署名付きトークンを返す
 */
function login(userId, password) {
  try {
    const props = PropertiesService.getScriptProperties();
    const allowUsers = (props.getProperty('AUTH_USERS') || '').split(',').map(function(s){return s.trim();}).filter(function(s){return s;});
    const userSecretsJson = props.getProperty('AUTH_SECRETS_JSON') || '{}';
    var userSecrets = {};
    try { userSecrets = JSON.parse(userSecretsJson); } catch (e) { userSecrets = {}; }
    const hmacSecret = props.getProperty('AUTH_HMAC_SECRET') || '';

    if (!userId || !password) {
      return { success: false, error: 'missing_credentials' };
    }
    if (allowUsers.length && allowUsers.indexOf(userId) === -1) {
      return { success: false, error: 'invalid_user' };
    }
    var expected = userSecrets[userId];
    if (!expected) {
      return { success: false, error: 'invalid_user' };
    }
    if (expected !== password) {
      return { success: false, error: 'invalid_password' };
    }
    if (!hmacSecret) {
      return { success: false, error: 'server_not_configured' };
    }

    // トークン生成: userId + issuedAt を HMAC 署名
    var issuedAt = Date.now();
    var payload = userId + '|' + issuedAt;
    var signature = Utilities.computeHmacSha256Signature(payload, hmacSecret);
    var sigB64 = Utilities.base64Encode(signature);
    var token = payload + '.' + sigB64;

    return { success: true, token: token, userId: userId, issuedAt: issuedAt };
  } catch (e) {
    Logger.log('login error: ' + e.message);
    return { success: false, error: 'server_error' };
  }
}

/**
 * トークン検証
 */
function validateSession(token, maxAgeMs) {
  try {
    if (!token) return { success: false, error: 'missing_token' };
    var parts = String(token).split('.');
    if (parts.length !== 2) return { success: false, error: 'invalid_token' };
    var payload = parts[0];
    var sig = parts[1];
    var p = payload.split('|');
    if (p.length !== 2) return { success: false, error: 'invalid_payload' };
    var userId = p[0];
    var issuedAt = parseInt(p[1], 10);

    var props = PropertiesService.getScriptProperties();
    var hmacSecret = props.getProperty('AUTH_HMAC_SECRET') || '';
    if (!hmacSecret) return { success: false, error: 'server_not_configured' };

    var expectedSig = Utilities.base64Encode(Utilities.computeHmacSha256Signature(payload, hmacSecret));
    if (expectedSig !== sig) return { success: false, error: 'bad_signature' };

    if (maxAgeMs && (Date.now() - issuedAt) > maxAgeMs) {
      return { success: false, error: 'expired' };
    }

    return { success: true, userId: userId, issuedAt: issuedAt };
  } catch (e) {
    Logger.log('validateSession error: ' + e.message);
    return { success: false, error: 'server_error' };
  }
}
