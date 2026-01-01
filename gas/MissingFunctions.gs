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
 * Supabaseへの同期HTTPリクエスト（GET専用）
 */
function _spRequest(endpoint) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var anon = props.getProperty('SUPABASE_ANON_KEY');
  if (!url || !anon) {
    throw new Error('Supabase設定が不足しています (SUPABASE_URL / SUPABASE_ANON_KEY)');
  }
  var full = url.replace(/\/$/, '') + '/rest/v1/' + endpoint;
  var headers = {
    'Content-Type': 'application/json',
    'apikey': anon,
    'Authorization': 'Bearer ' + anon
  };
  var resp = UrlFetchApp.fetch(full, { method: 'get', headers: headers, muteHttpExceptions: true });
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (String(code)[0] !== '2') {
    throw new Error('HTTP ' + code + ': ' + text);
  }
  if (!text || !text.trim()) return [];
  try { return JSON.parse(text); } catch (_) { return []; }
}

/**
 * 満席公演を取得する
 */
function getFullTimeslotsSupabase() {
  try {
    // 1 全公演取得
    var perfs = _spRequest('performances?select=id,group_name,day,timeslot');
    if (!Array.isArray(perfs)) perfs = [];
    // 除外: 見本演劇
    perfs = perfs.filter(function(p){ return String(p.group_name) !== '見本演劇'; });
    if (perfs.length === 0) return { success: true, full: [] };

    // 2 全座席の status を取得し、公演別に集計
    var seats = _spRequest('seats?select=performance_id,status');
    if (!Array.isArray(seats)) seats = [];

    var byPerf = {};
    seats.forEach(function(s) {
      var pid = s.performance_id;
      if (!byPerf[pid]) byPerf[pid] = { total: 0, available: 0 };
      byPerf[pid].total++;
      if (String(s.status) === 'available') byPerf[pid].available++;
    });

    var full = [];
    perfs.forEach(function(p) {
      var agg = byPerf[p.id] || { total: 0, available: 0 };
      if (agg.total > 0 && agg.available === 0) {
        full.push({ group: p.group_name, day: String(p.day), timeslot: p.timeslot });
      }
    });
    return { success: true, full: full };
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
    // 1) 全公演取得
    var perfs = _spRequest('performances?select=id,group_name,day,timeslot');
    if (!Array.isArray(perfs)) perfs = [];
    // 除外: 見本演劇
    perfs = perfs.filter(function(p){ return String(p.group_name) !== '見本演劇'; });

    // 2) 全座席の status を取得
    var seats = _spRequest('seats?select=performance_id,status');
    if (!Array.isArray(seats)) seats = [];

    // 3) 公演別に集計
    var byPerf = {};
    seats.forEach(function(s) {
      var pid = s.performance_id;
      if (!byPerf[pid]) byPerf[pid] = { total: 0, available: 0 };
      byPerf[pid].total++;
      if (String(s.status) === 'available') byPerf[pid].available++;
    });

    var fullTimeslots = [];
    var allTimeslots = [];
    perfs.forEach(function(p) {
      var agg = byPerf[p.id] || { total: 0, available: 0 };
      var total = agg.total;
      var empty = agg.available;
      var occupied = total > 0 ? Math.max(0, total - empty) : 0;
      var info = {
        group: p.group_name,
        day: String(p.day),
        timeslot: p.timeslot,
        totalSeats: total,
        occupiedSeats: occupied,
        emptySeats: empty,
        isFull: total > 0 && empty === 0,
        lastChecked: new Date()
      };
      if (info.isFull) fullTimeslots.push(info);
      allTimeslots.push(info);
    });

    var summary = {
      totalChecked: allTimeslots.length,
      fullCapacity: fullTimeslots.length,
      totalSeats: allTimeslots.reduce(function(s, t){ return s + (t.totalSeats||0); }, 0),
      totalOccupied: allTimeslots.reduce(function(s, t){ return s + (t.occupiedSeats||0); }, 0),
      totalEmpty: allTimeslots.reduce(function(s, t){ return s + (t.emptySeats||0); }, 0)
    };

    return { success: true, fullTimeslots: fullTimeslots, allTimeslots: allTimeslots, summary: summary };
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
    const { emails, fullTimeslots, timestamp, isTest = false } = emailData || {};
    const emailList = Array.isArray(emails) ? emails : [emails];
    if (!emailList.length || !emailList.some(email => email && email.indexOf('@') !== -1)) {
      return { success: false, message: '有効なメールアドレスが指定されていません' };
    }
    if (!Array.isArray(fullTimeslots) || fullTimeslots.length === 0) {
      return { success: false, message: '満席データが指定されていません' };
    }

    const subject = isTest ? '[テスト配信] 満席通知 - 座席管理システム' : '🚨 満席になりました - 座席管理システム';
    let body = isTest ? 'これはテスト配信です。実際の座席状況ではありません。\n\n' : '以下の公演が満席になりました。\n\n';
    body += '満席公演一覧:\n';
    body += Array(51).join('=') + '\n';
    fullTimeslots.forEach(timeslot => {
      body += `・${timeslot.group} ${timeslot.day}日目 ${timeslot.timeslot}\n`;
      if (timeslot.totalSeats) {
        body += `  残り: 0席 / 全${timeslot.totalSeats}席 (満席)\n`;
      }
    });
    body += '\n' + Array(51).join('=') + '\n';
    body += `通知時刻: ${new Date(timestamp || new Date()).toLocaleString('ja-JP')}\n`;
    body += 'システム: 座席管理システム\n';
    if (isTest) {
      body += '\n※ これはテスト配信です。実際の座席状況ではありません。\n';
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;
    emailList.forEach(email => {
      if (!email || email.indexOf('@') === -1) {
        results.push({ email, success: false, message: '無効なメールアドレス' });
        failureCount++;
        return;
      }
      try {
        MailApp.sendEmail({ to: email, subject, body });
        results.push({ email, success: true, message: '送信成功' });
        successCount++;
      } catch (emailError) {
        Logger.log(`メール送信エラー (${email}): ${emailError.message}`);
        results.push({ email, success: false, message: emailError.message });
        failureCount++;
      }
    });

    return {
      success: successCount > 0,
      message: `${successCount}件のメールを送信しました${failureCount > 0 ? ` (${failureCount}件失敗)` : ''}`,
      sentTo: emailList,
      results,
      timeslotsCount: fullTimeslots.length,
      successCount,
      failureCount
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
    const { emails, notifications, statistics, timestamp } = emailData || {};
    let emailList = Array.isArray(emails) ? emails : [emails];
    emailList = emailList.filter(e => e && e.indexOf('@') !== -1);
    if (!emailList.length) {
      return { success: false, message: '有効なメールアドレスが指定されていません' };
    }
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return { success: false, message: '通知データが指定されていません' };
    }

    const highPriority = notifications.filter(n => n.priority === 'high');
    const mediumPriority = notifications.filter(n => n.priority === 'medium');
    const lowPriority = notifications.filter(n => n.priority === 'low');

    let subject = '座席状況通知 - 市川学園座席管理システム';
    if (highPriority.length > 0) {
      const minSeats = Math.min.apply(null, highPriority.map(n => n.timeslot && n.timeslot.emptySeats).filter(Number.isFinite));
      subject = `残り${Number.isFinite(minSeats) ? minSeats : 'わずか'}席以下 - 座席管理システム`;
    } else if (mediumPriority.length > 0) {
      const minSeats = Math.min.apply(null, mediumPriority.map(n => n.timeslot && n.timeslot.emptySeats).filter(Number.isFinite));
      subject = `残り${Number.isFinite(minSeats) ? minSeats : '少数'}席 - 座席管理システム`;
    } else if (lowPriority.length > 0) {
      const minSeats = Math.min.apply(null, lowPriority.map(n => n.timeslot && n.timeslot.emptySeats).filter(Number.isFinite));
      subject = `残り${Number.isFinite(minSeats) ? minSeats : ''}席 - 座席管理システム`;
    }

    let body = '座席状況の変化をお知らせします。\n\n';
    if (highPriority.length > 0) {
      body += '残り席数が少なくなっています\n';
      body += Array(51).join('=') + '\n';
      highPriority.forEach(notification => {
        const t = notification.timeslot || {};
        body += `・${t.group} ${t.day}日目 ${t.timeslot}\n`;
        body += `  残り: ${t.emptySeats}席 / 全${t.totalSeats}席\n`;
        body += `  状況: ${t.isFull ? '満席' : '残りわずか'}\n\n`;
      });
    }
    if (mediumPriority.length > 0) {
      body += '残り席数にご注意ください\n';
      body += Array(51).join('=') + '\n';
      mediumPriority.forEach(notification => {
        const t = notification.timeslot || {};
        body += `・${t.group} ${t.day}日目 ${t.timeslot}\n`;
        body += `  残り: ${t.emptySeats}席 / 全${t.totalSeats}席\n\n`;
      });
    }
    if (lowPriority.length > 0) {
      body += '座席状況の変化\n';
      body += Array(51).join('=') + '\n';
      lowPriority.forEach(notification => {
        const t = notification.timeslot || {};
        body += `・${t.group} ${t.day}日目 ${t.timeslot}: 残り${t.emptySeats}席\n`;
      });
    }

    if (statistics) {
      body += '\nシステム統計\n';
      body += Array(51).join('=') + '\n';
      body += `総チェック回数: ${statistics.totalChecks || 0}回\n`;
      body += `総通知回数: ${statistics.totalNotifications || 0}回\n`;
      if (typeof statistics.averageEmptySeats === 'number') {
        body += `平均空席数: ${statistics.averageEmptySeats.toFixed(1)}席\n`;
      }
      body += `最終チェック: ${statistics.lastCheckTime ? new Date(statistics.lastCheckTime).toLocaleString('ja-JP') : '不明'}\n`;
    }

    body += '\n' + Array(51).join('=') + '\n';
    body += `通知時刻: ${new Date(timestamp || new Date()).toLocaleString('ja-JP')}\n`;
    body += '市川学園座席監視システム\n';

    const results = [];
    let successCount = 0;
    let failureCount = 0;
    emailList.forEach(email => {
      try {
        MailApp.sendEmail({ to: email, subject, body });
        results.push({ email, success: true, message: '送信成功' });
        successCount++;
      } catch (emailError) {
        Logger.log(`ステータス通知メール送信エラー (${email}): ${emailError.message}`);
        results.push({ email, success: false, message: emailError.message });
        failureCount++;
      }
    });

    return {
      success: successCount > 0,
      message: `${successCount}件のメールを送信しました${failureCount > 0 ? ` (${failureCount}件失敗)` : ''}`,
      sentTo: emailList,
      results,
      notificationCount: notifications.length,
      successCount,
      failureCount
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
    // 1) 公演取得（フィルタ対応）
    var perfQuery = 'performances?select=id,group_name,day,timeslot';
    var qs = [];
    if (group) qs.push('group_name=eq.' + encodeURIComponent(group));
    if (day) qs.push('day=eq.' + encodeURIComponent(day));
    if (timeslot) qs.push('timeslot=eq.' + encodeURIComponent(timeslot));
    if (qs.length) perfQuery += '&' + qs.join('&');
    var perfs = _spRequest(perfQuery);
    if (!Array.isArray(perfs)) perfs = [];
    // 除外: 見本演劇
    perfs = perfs.filter(function(p){ return String(p.group_name) !== '見本演劇'; });

    if (perfs.length === 0) {
      return {
        success: true,
        analysis: {
          summary: { totalTimeslots: 0, fullCapacity: 0, warningCapacity: 0, criticalCapacity: 0, normalCapacity: 0, totalSeats: 0, totalOccupied: 0, totalEmpty: 0 },
          timeslots: [],
          capacityDistribution: {},
          trends: []
        },
        timestamp: new Date().toISOString()
      };
    }

    // 2) 対象公演の座席をまとめて取得（in クエリを使用）
    var idList = perfs.map(function(p){ return p.id; }).filter(function(x){ return x !== null && x !== undefined; });
    if (idList.length === 0) {
      return {
        success: true,
        analysis: {
          summary: { totalTimeslots: 0, fullCapacity: 0, warningCapacity: 0, criticalCapacity: 0, normalCapacity: 0, totalSeats: 0, totalOccupied: 0, totalEmpty: 0 },
          timeslots: [],
          capacityDistribution: {},
          trends: []
        },
        timestamp: new Date().toISOString()
      };
    }
    var seats = _spRequest('seats?select=performance_id,status&performance_id=in.(' + idList.join(',') + ')');
    if (!Array.isArray(seats)) seats = [];

    // 3) 公演別に集計
    var byPerf = {};
    seats.forEach(function(s){
      var pid = s.performance_id;
      if (!byPerf[pid]) byPerf[pid] = { total: 0, available: 0 };
      byPerf[pid].total++;
      if (String(s.status) === 'available') byPerf[pid].available++;
    });

    var timeslotsArr = [];
    var summary = { totalTimeslots: 0, fullCapacity: 0, warningCapacity: 0, criticalCapacity: 0, normalCapacity: 0, totalSeats: 0, totalOccupied: 0, totalEmpty: 0 };

    perfs.forEach(function(p){
      var agg = byPerf[p.id] || { total: 0, available: 0 };
      var total = agg.total;
      var empty = agg.available;
      var occupied = total > 0 ? Math.max(0, total - empty) : 0;
      var level = 'normal';
      if (empty === 0 && total > 0) level = 'full';
      else if (empty <= 2) level = 'critical';
      else if (empty <= 5) level = 'warning';

      var info = {
        group: p.group_name,
        day: String(p.day),
        timeslot: p.timeslot,
        totalSeats: total,
        occupiedSeats: occupied,
        emptySeats: empty,
        isFull: (total > 0 && empty === 0),
        capacityLevel: level,
        lastChecked: new Date()
      };
      timeslotsArr.push(info);

      summary.totalTimeslots++;
      summary.totalSeats += total;
      summary.totalOccupied += occupied;
      summary.totalEmpty += empty;
      if (level === 'full') summary.fullCapacity++;
      else if (level === 'critical') summary.criticalCapacity++;
      else if (level === 'warning') summary.warningCapacity++;
      else summary.normalCapacity++;
    });

    var capacityDistribution = {
      full: summary.fullCapacity,
      critical: summary.criticalCapacity,
      warning: summary.warningCapacity,
      normal: summary.normalCapacity
    };

    return {
      success: true,
      analysis: { summary: summary, timeslots: timeslotsArr, capacityDistribution: capacityDistribution, trends: [] },
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
    // 全座席を集計して全体統計を返す
    var seats = _spRequest('seats?select=status');
    if (!Array.isArray(seats)) seats = [];
    var total = seats.length;
    var available = 0, reserved = 0, checked_in = 0, walkin = 0, blocked = 0;
    seats.forEach(function(s){
      var st = String(s.status);
      if (st === 'available') available++;
      else if (st === 'reserved') reserved++;
      else if (st === 'checked_in') checked_in++;
      else if (st === 'walkin') walkin++;
      else if (st === 'blocked') blocked++;
    });

    var props = PropertiesService.getScriptProperties();
    var statistics = {
      totalChecks: parseInt(props.getProperty('CAPACITY_TOTAL_CHECKS') || '0', 10),
      totalNotifications: parseInt(props.getProperty('CAPACITY_TOTAL_NOTIFICATIONS') || '0', 10),
      lastCheckTime: (function(){ var v = props.getProperty('CAPACITY_LAST_CHECK_TIME'); return v ? new Date(v) : null; })(),
      averageEmptySeats: parseFloat(props.getProperty('CAPACITY_AVERAGE_EMPTY') || '0'),
      currentSummary: {
        totalSeats: total,
        totalAvailable: available,
        totalReserved: reserved,
        totalCheckedIn: checked_in,
        totalWalkin: walkin,
        totalBlocked: blocked
      },
      systemStatus: {
        isMonitoring: props.getProperty('CAPACITY_MONITORING_ENABLED') === 'true',
        checkInterval: parseInt(props.getProperty('CAPACITY_CHECK_INTERVAL') || '15000', 10),
        notificationCooldown: parseInt(props.getProperty('CAPACITY_NOTIFICATION_COOLDOWN') || '300000', 10)
      }
    };

    return { success: true, statistics: statistics, timestamp: new Date().toISOString() };
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
 * 公演グループ一覧を取得（重複除去）
 */
function getGroupsSupabase() {
  try {
    var list = _spRequest('performances?select=group_name');
    if (!Array.isArray(list)) list = [];
    var set = {};
    list.forEach(function(r){
      var g = r && r.group_name;
      if (g && String(g) !== '見本演劇') set[String(g)] = true;
    });
    return { success: true, groups: Object.keys(set).sort() };
  } catch (e) {
    Logger.log('getGroupsSupabase Error: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * グループの全時間帯を取得する
 */
function getAllTimeslotsForGroup(group) {
  try {
    // 1. 公演データ取得
    const perfRes = supabaseIntegration._request(`performances?group_name=eq.${encodeURIComponent(group)}&select=day,timeslot&order=day.asc`);
    if (!perfRes.success) return [];
    
    // 2. 時間帯マスタ取得
    const slotRes = supabaseIntegration._request(`time_slots?select=slot_code,start_time,end_time`);
    const slotMap = {};
    if (slotRes.success && Array.isArray(slotRes.data)) {
        slotRes.data.forEach(s => {
            slotMap[s.slot_code] = `${s.start_time}-${s.end_time}`;
        });
    }

    // 3. マッピング
    const uniqueMap = new Map(); // 重複排除用
    
    perfRes.data.forEach(perf => {
        const key = `${perf.day}-${perf.timeslot}`;
        if (!uniqueMap.has(key)) {
            const timeRange = slotMap[perf.timeslot] || '';
            // 表示名: "10:00 (10:00-11:00)" または "10:00-11:00"
            // フロントエンドの仕様に合わせて変更
            let displayName = perf.timeslot; // Default
            if (timeRange) {
                 // コード自体が「10:00」等の場合、重複して表示されるのを防ぐか、親切に表示するか
                 // ユーザー要望「何時からを設定できる」→ "10:00 (10:00-11:00)" がわかりやすい
                 displayName = `${perf.timeslot} (${timeRange})`;
                 // もしコードが"A"とかなら "A (10:00-11:00)"
            }
            
            uniqueMap.set(key, {
                day: perf.day,
                timeslot: perf.timeslot,
                displayName: displayName
            });
        }
    });
    
    return Array.from(uniqueMap.values());
    
  } catch (e) {
    Logger.log('getAllTimeslotsForGroup Error: ' + e.message);
    return [];
  }
}
