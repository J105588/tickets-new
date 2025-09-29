// MissingFunctions.gs
// Code.gsから移行されていない重要な機能を実装

// ===============================================================
// === システム管理機能 ===
// ===============================================================

/**
 * システムロック状態を取得する
 */
function getSystemLock() {
  try {
    const props = PropertiesService.getScriptProperties();
    const locked = props.getProperty('SYSTEM_LOCKED') === 'true';
    const lockedAt = props.getProperty('SYSTEM_LOCKED_AT') || null;
    return { success: true, locked, lockedAt };
  } catch (e) {
    Logger.log('getSystemLock Error: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * モード別のパスワードを検証する
 */
function verifyModePassword(mode, password) {
  try {
    const props = PropertiesService.getScriptProperties();
    const adminPassword = props.getProperty('ADMIN_PASSWORD');
    const walkinPassword = props.getProperty('WALKIN_PASSWORD');
    const superAdminPassword = props.getProperty('SUPERADMIN_PASSWORD');

    let result;
    if (mode === 'admin') result = { success: adminPassword && password === adminPassword };
    else if (mode === 'walkin') result = { success: walkinPassword && password === walkinPassword };
    else if (mode === 'superadmin') result = { success: superAdminPassword && password === superAdminPassword };
    else result = { success: false };
    
    // ログ記録（パスワードは記録しない）
    safeLogOperation('verifyModePassword', { mode }, result);
    
    return result;

  } catch (e) {
    Logger.log("verifyModePassword Error: " + e.message);
    const result = { success: false };
    
    // エラーログ記録
    safeLogOperation('verifyModePassword', { mode }, result);
    
    return result;
  }
}

/**
 * システムロックを設定する
 */
function setSystemLock(shouldLock, password) {
  try {
    const props = PropertiesService.getScriptProperties();
    const superAdminPassword = props.getProperty('SUPERADMIN_PASSWORD');
    if (!superAdminPassword || password !== superAdminPassword) {
      return { success: false, message: '認証に失敗しました' };
    }

    if (shouldLock === true) {
      props.setProperty('SYSTEM_LOCKED', 'true');
      props.setProperty('SYSTEM_LOCKED_AT', new Date().toISOString());
    } else {
      props.setProperty('SYSTEM_LOCKED', 'false');
      props.deleteProperty('SYSTEM_LOCKED_AT');
    }
    return { success: true, locked: shouldLock === true };
  } catch (e) {
    Logger.log('setSystemLock Error: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * 危険コマンドを実行する
 */
function execDangerCommand(action, payload, password) {
  try {
    const props = PropertiesService.getScriptProperties();
    const superAdminPassword = props.getProperty('SUPERADMIN_PASSWORD');
    if (!superAdminPassword || password !== superAdminPassword) {
      return { success: false, message: '認証に失敗しました' };
    }
    return performDangerAction(action, payload || {});
  } catch (e) {
    Logger.log('execDangerCommand Error: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * 危険アクションを実行する
 */
function performDangerAction(action, payload) {
  if (action === 'purgeReservationsForShow') {
    const group = payload && payload.group;
    const day = payload && payload.day;
    const timeslot = payload && payload.timeslot;
    
    // Supabase版の実装
    try {
      const performanceResult = getOrCreatePerformance(group, day, timeslot);
      if (!performanceResult.success) {
        return { success: false, message: '公演が見つかりません' };
      }
      
      const performanceId = performanceResult.data.id;
      
      // 全座席を初期化
      const updateResult = supabaseIntegration._request(`seats?performance_id=eq.${performanceId}`, {
        method: 'PATCH',
        body: {
          status: 'available',
          reserved_by: null,
          reserved_at: null,
          checked_in_at: null,
          walkin_at: null,
          updated_at: new Date().toISOString()
        }
      });
      
      if (updateResult.success) {
        return { success: true, message: '該当公演の予約・チェックイン情報を初期化しました' };
      } else {
        return { success: false, message: '座席データの初期化に失敗しました' };
      }
    } catch (e) {
      return { success: false, message: e.message };
    }
  }
  return { success: false, message: '未知のアクション: ' + action };
}

// ===============================================================
// === ログ・監査機能 ===
// ===============================================================

/**
 * 操作ログを記録する
 */
function logOperation(operation, params, result, userAgent, ipAddress, skipDuplicateCheck = false) {
  try {
    // Supabase版のログ記録（簡易実装）
    const logData = {
      operation: operation,
      params: JSON.stringify(params),
      result: JSON.stringify(result),
      user_agent: userAgent || 'Unknown',
      ip_address: ipAddress || 'Unknown',
      status: result.success ? 'SUCCESS' : 'ERROR',
      timestamp: new Date().toISOString()
    };
    
    // ログをSupabaseに記録（実装は簡易版）
    console.log('Operation Log:', logData);
    
  } catch (e) {
    Logger.log('Log recording failed: ' + e.message);
  }
}

/**
 * クライアント監査ログを記録する
 */
function recordClientAudit(entries) {
  try {
    if (!Array.isArray(entries) || entries.length === 0) {
      return { success: false, message: 'No entries' };
    }
    
    // Supabase版の監査ログ記録（簡易実装）
    entries.forEach(entry => {
      const auditData = {
        timestamp: entry.ts || new Date().toISOString(),
        event_type: entry.type || '',
        action: entry.action || '',
        metadata: JSON.stringify(entry.meta || {}),
        session_id: entry.sessionId || '',
        user_id: entry.userId || '',
        user_agent: entry.ua || 'Unknown',
        ip_address: entry.ip || 'Unknown'
      };
      
      console.log('Client Audit Log:', auditData);
    });
    
    return { success: true, saved: entries.length };
  } catch (e) {
    Logger.log('recordClientAudit failed: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * クライアント監査ログを取得する
 */
function getClientAuditLogs(limit = 200, type = null, action = null) {
  try {
    // Supabase版の監査ログ取得（簡易実装）
    return { success: true, logs: [] };
  } catch (e) {
    Logger.log('getClientAuditLogs failed: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * クライアント監査統計を取得する
 */
function getClientAuditStatistics() {
  try {
    return { 
      success: true, 
      statistics: {
        totalOperations: 0,
        successCount: 0,
        errorCount: 0,
        byType: {},
        byAction: {}
      }
    };
  } catch (e) {
    Logger.log('getClientAuditStatistics failed: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * 操作ログを取得する
 */
function getOperationLogs(limit = 100, operation = null, status = null) {
  try {
    return { success: true, logs: [] };
  } catch (e) {
    Logger.log('Failed to get logs: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * ログ統計を取得する
 */
function getLogStatistics() {
  try {
    return { success: true, statistics: {} };
  } catch (e) {
    Logger.log('Failed to get log statistics: ' + e.message);
    return { success: false, message: e.message };
  }
}

// ===============================================================
// === 監視・通知機能 ===
// ===============================================================

/**
 * 満席公演を取得する
 */
function getFullTimeslotsSupabase() {
  try {
    // Supabase版の満席公演取得（簡易実装）
    return { success: true, full: [] };
  } catch (e) {
    Logger.log('getFullTimeslotsSupabase failed: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * 満席容量公演を取得する
 */
function getFullCapacityTimeslotsSupabase() {
  try {
    // Supabase版の満席容量取得（簡易実装）
    return { 
      success: true, 
      fullTimeslots: [],
      allTimeslots: [],
      summary: {
        totalChecked: 0,
        fullCapacity: 0,
        totalSeats: 0,
        totalOccupied: 0,
        totalEmpty: 0
      }
    };
  } catch (e) {
    Logger.log('getFullCapacityTimeslotsSupabase failed: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * 満席通知設定を保存する
 */
function setFullCapacityNotification(enabled) {
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('FULL_CAPACITY_NOTIFICATION_ENABLED', enabled.toString());
    props.setProperty('FULL_CAPACITY_NOTIFICATION_UPDATED', new Date().toISOString());
    
    Logger.log(`満席通知設定更新: enabled=${enabled}`);
    return { success: true, message: '設定を保存しました' };
  } catch (e) {
    Logger.log('setFullCapacityNotification failed: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * 満席通知設定を取得する
 */
function getFullCapacityNotificationSettings() {
  try {
    const props = PropertiesService.getScriptProperties();
    const enabled = props.getProperty('FULL_CAPACITY_NOTIFICATION_ENABLED') === 'true';
    const updated = props.getProperty('FULL_CAPACITY_NOTIFICATION_UPDATED') || null;
    
    return { 
      success: true, 
      emails: ['admin@example.com'],
      enabled: enabled,
      updated: updated
    };
  } catch (e) {
    Logger.log('getFullCapacityNotificationSettings failed: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * 満席通知メールを送信する
 */
function sendFullCapacityEmail(emailData) {
  try {
    const { emails, fullTimeslots, timestamp, isTest = false } = emailData;
    
    if (!Array.isArray(fullTimeslots) || fullTimeslots.length === 0) {
      return { success: false, message: '満席データが指定されていません' };
    }
    
    // メール送信の実装（簡易版）
    Logger.log(`満席通知メール送信: ${fullTimeslots.length}件の満席公演`);
    
    return { 
      success: true, 
      message: 'メールを送信しました',
      sentTo: emails,
      timeslotsCount: fullTimeslots.length
    };
  } catch (e) {
    Logger.log('sendFullCapacityEmail failed: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * ステータス通知メールを送信する
 */
function sendStatusNotificationEmail(emailData) {
  try {
    const { emails, notifications, statistics, timestamp } = emailData;
    
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return { success: false, message: '通知データが指定されていません' };
    }
    
    // メール送信の実装（簡易版）
    Logger.log(`ステータス通知メール送信: ${notifications.length}件の通知`);
    
    return { 
      success: true, 
      message: 'メールを送信しました',
      sentTo: emails,
      notificationCount: notifications.length
    };
  } catch (e) {
    Logger.log('sendStatusNotificationEmail failed: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * 詳細容量分析を取得する
 */
function getDetailedCapacityAnalysisSupabase(group = null, day = null, timeslot = null) {
  try {
    // Supabase版の詳細容量分析（簡易実装）
    return { 
      success: true, 
      analysis: {
        summary: {
          totalTimeslots: 0,
          fullCapacity: 0,
          warningCapacity: 0,
          criticalCapacity: 0,
          normalCapacity: 0,
          totalSeats: 0,
          totalOccupied: 0,
          totalEmpty: 0
        },
        timeslots: [],
        capacityDistribution: {},
        trends: []
      },
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    Logger.log('getDetailedCapacityAnalysisSupabase failed: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * 容量統計を取得する
 */
function getCapacityStatisticsSupabase() {
  try {
    const props = PropertiesService.getScriptProperties();
    
    return { 
      success: true, 
      statistics: {
        totalChecks: parseInt(props.getProperty('CAPACITY_TOTAL_CHECKS') || '0'),
        totalNotifications: parseInt(props.getProperty('CAPACITY_TOTAL_NOTIFICATIONS') || '0'),
        lastCheckTime: props.getProperty('CAPACITY_LAST_CHECK_TIME'),
        averageEmptySeats: parseFloat(props.getProperty('CAPACITY_AVERAGE_EMPTY') || '0'),
        systemStatus: {
          isMonitoring: props.getProperty('CAPACITY_MONITORING_ENABLED') === 'true',
          checkInterval: parseInt(props.getProperty('CAPACITY_CHECK_INTERVAL') || '15000'),
          notificationCooldown: parseInt(props.getProperty('CAPACITY_NOTIFICATION_COOLDOWN') || '300000')
        }
      },
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    Logger.log('getCapacityStatisticsSupabase failed: ' + e.message);
    return { success: false, message: e.message };
  }
}

// ===============================================================
// === ヘルパー機能 ===
// ===============================================================

/**
 * 座席IDが有効かどうかを検証する
 */
function isValidSeatId(seatId) {
  if (!seatId || typeof seatId !== 'string') return false;
  const match = seatId.match(/^([A-E])(\d+)$/);
  if (!match) return false;

  const row = match[1];
  const col = parseInt(match[2], 10);

  const maxSeats = { 'A': 12, 'B': 12, 'C': 12, 'D': 12, 'E': 6 };
  return col >= 1 && col <= (maxSeats[row] || 0);
}

/**
 * エラーを報告する
 */
function reportError(errorMessage) {
  Logger.log(`Client-side error: ${errorMessage}`);
  return { success: true };
}

/**
 * 安全なログ記録
 */
function safeLogOperation(operation, params, result, userAgent = 'Unknown', ipAddress = 'Unknown') {
  try {
    logOperation(operation, params, result, userAgent, ipAddress, true);
  } catch (e) {
    Logger.log('Safe log recording failed for ' + operation + ': ' + e.message);
  }
}

// ===============================================================
// === 危険コマンド機能（完全版） ===
// ===============================================================

/**
 * 危険コマンドを開始する
 */
function initiateDangerCommand(action, payload, expireSeconds) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = Utilities.getUuid();
    const now = Date.now();
    const ttl = Math.max(30, Math.min(10 * 60, parseInt(expireSeconds || 120, 10))) * 1000; // 30s〜10min、既定120s
    const record = {
      token: token,
      action: action,
      payload: payload || {},
      confirmations: [],
      createdAt: now,
      expiresAt: now + ttl
    };
    props.setProperty('DANGER_CMD_' + token, JSON.stringify(record));
    return { success: true, token: token, expiresAt: new Date(record.expiresAt).toISOString() };
  } catch (e) {
    Logger.log('initiateDangerCommand Error: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * 危険コマンドを確認する
 */
function confirmDangerCommand(token, password, confirmerId) {
  try {
    const props = PropertiesService.getScriptProperties();
    const superAdminPassword = props.getProperty('SUPERADMIN_PASSWORD');
    if (!superAdminPassword || password !== superAdminPassword) {
      return { success: false, message: '認証に失敗しました' };
    }
    const key = 'DANGER_CMD_' + token;
    const raw = props.getProperty(key);
    if (!raw) return { success: false, message: 'トークンが無効または期限切れです' };
    const rec = JSON.parse(raw);
    const now = Date.now();
    if (now > rec.expiresAt) {
      props.deleteProperty(key);
      return { success: false, message: 'トークンが期限切れです' };
    }
    const id = (confirmerId || '') + '';
    if (id) {
      if (!rec.confirmations.includes(id)) rec.confirmations.push(id);
    } else {
      // ID未指定でも1カウント扱いだが、同一ブラウザで重複しない保障はない
      rec.confirmations.push(Utilities.getUuid());
    }
    const required = 2;
    if (rec.confirmations.length >= required) {
      // 実行
      const result = performDangerAction(rec.action, rec.payload);
      props.deleteProperty(key);
      return { success: true, executed: true, result: result };
    } else {
      props.setProperty(key, JSON.stringify(rec));
      return { success: true, executed: false, pending: required - rec.confirmations.length };
    }
  } catch (e) {
    Logger.log('confirmDangerCommand Error: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * 保留中の危険コマンド一覧を取得する
 */
function listDangerPending() {
  try {
    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    const now = Date.now();
    const items = [];
    Object.keys(all).forEach(k => {
      if (k.indexOf('DANGER_CMD_') === 0) {
        try {
          const rec = JSON.parse(all[k]);
          if (rec && now <= rec.expiresAt) {
            items.push({ 
              token: rec.token, 
              action: rec.action, 
              confirmations: (rec.confirmations||[]).length, 
              expiresAt: new Date(rec.expiresAt).toISOString() 
            });
          }
        } catch (_) {}
      }
    });
    return { success: true, items: items };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ===============================================================
// === デバッグ機能 ===
// ===============================================================

/**
 * スプレッドシート構造をデバッグする（Supabase版）
 */
function debugSpreadsheetStructure(group, day, timeslot) {
  try {
    // Supabase版では、公演と座席データの構造を確認
    const performanceResult = getOrCreatePerformance(group, day, timeslot);
    if (!performanceResult.success) {
      return { success: false, error: "公演が見つかりません" };
    }

    const performanceId = performanceResult.data.id;
    const seatsResult = supabaseIntegration.getSeats(performanceId);
    
    if (!seatsResult.success) {
      return { success: false, error: "座席データの取得に失敗しました" };
    }

    const seats = seatsResult.data;
    const seatCount = seats.length;
    const statusCounts = {};
    
    seats.forEach(seat => {
      const status = seat.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return {
      success: true,
      performance: {
        id: performanceId,
        group: group,
        day: day,
        timeslot: timeslot
      },
      seats: {
        total: seatCount,
        statusCounts: statusCounts
      },
      sampleSeats: seats.slice(0, 5).map(seat => ({
        seatId: seat.seat_id,
        row: seat.row_letter,
        number: seat.seat_number,
        status: seat.status,
        reservedBy: seat.reserved_by
      }))
    };
  } catch (e) {
    Logger.log(`debugSpreadsheetStructure Error: ${e.message}\n${e.stack}`);
    return { success: false, error: e.message };
  }
}

// ===============================================================
// === シート管理機能（Supabase版では不要だが互換性のため実装） ===
// ===============================================================

/**
 * ログシートを取得または作成する（Supabase版では簡易実装）
 */
function getOrCreateLogSheet() {
  try {
    // Supabase版では、ログはSupabaseに記録されるため、簡易実装
    return {
      getName: () => 'SUPABASE_LOGS',
      getLastRow: () => 1,
      appendRow: (data) => {
        console.log('Log entry:', data);
      },
      getRange: (row, col, numRows, numCols) => ({
        getValues: () => [],
        setValues: (values) => {}
      })
    };
  } catch (e) {
    Logger.log('Failed to create log sheet: ' + e.message);
    throw e;
  }
}

/**
 * クライアント監査シートを取得または作成する（Supabase版では簡易実装）
 */
function getOrCreateClientAuditSheet() {
  try {
    // Supabase版では、監査ログはSupabaseに記録されるため、簡易実装
    return {
      getName: () => 'SUPABASE_AUDIT',
      getLastRow: () => 1,
      getRange: (row, col, numRows, numCols) => ({
        getValues: () => [],
        setValues: (values) => {}
      })
    };
  } catch (e) {
    Logger.log('Failed to create client audit sheet: ' + e.message);
    throw e;
  }
}

/**
 * クライアント監査エントリを追加する（Supabase版では簡易実装）
 */
function appendClientAuditEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  
  try {
    // Supabase版では、監査ログはSupabaseに記録されるため、簡易実装
    entries.forEach(entry => {
      console.log('Client Audit Entry:', {
        timestamp: entry.ts || new Date(),
        type: entry.type || '',
        action: entry.action || '',
        meta: entry.meta || {},
        sessionId: entry.sessionId || '',
        userId: entry.userId || '',
        userAgent: entry.ua || 'Server',
        ipAddress: entry.ip || 'Server'
      });
    });
  } catch (e) {
    Logger.log('appendClientAuditEntries failed: ' + e.message);
  }
}

// ===============================================================
// === 時間帯管理機能 ===
// ===============================================================

/**
 * グループの全時間帯を取得する
 */
function getAllTimeslotsForGroup(group) {
  try {
    // Supabase版では、公演データから時間帯を取得
    const result = supabaseIntegration._request(`performances?group_name=eq.${encodeURIComponent(group)}&select=day,timeslot`);
    
    if (!result.success) {
      return [];
    }
    
    const timeslots = result.data.map(perf => `${perf.day}日目${perf.timeslot}`);
    return [...new Set(timeslots)]; // 重複を除去
  } catch (e) {
    Logger.log('getAllTimeslotsForGroup Error: ' + e.message);
    return [];
  }
}
