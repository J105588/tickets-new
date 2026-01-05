/**
 * BackupManager.gs
 * Supabaseデータベースのバックアップとリストアを管理する
 */

// バックアップフォルダID（スクリプトプロパティで管理または定数）
// ユーザーのDrive直下に "Tickets_Backup" フォルダを作成し、そのIDを使用することを推奨
const BACKUP_FOLDER_ID_KEY = '10HUhVEju_TlDVev8Bj5f2xMhWcsQk1QT';

/**
 * データベースの完全バックアップを作成する
 * @return {Object} result
 */
function backupDatabase() {
  try {
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
    const backupName = `Backup_${timestamp}`;
    
    // 1. データ取得 (Supabaseから全データを取得)
    // 依存関係の逆順（子から親）ではなく、バックアップは順不同でOK。リストア時に順序制御。
    const tables = ['bookings', 'seats', 'performances', 'groups', 'event_dates', 'time_slots', 'settings'];
    const backupData = {};
    
    tables.forEach(table => {
      // 全件取得 (limitなし、または十分大きな数)
      // SupabaseIntegrationの_requestを直接使用して全件取得
      const response = supabaseIntegration._request(`${table}?select=*`, { useServiceRole: true });
      if (!response.success) {
        throw new Error(`Failed to fetch ${table}: ${response.error}`);
      }
      backupData[table] = response.data;
    });
    
    // 2. スプレッドシート作成
    // フォルダ取得 (プロパティ または 名前検索)
    let folderId = PropertiesService.getScriptProperties().getProperty(BACKUP_FOLDER_ID_KEY);
    let folder;
    
    if (folderId) {
      try {
        folder = DriveApp.getFolderById(folderId);
      } catch (e) {
        folder = null;
      }
    }
    
    // プロパティになければ名前で探す
    if (!folder) {
      const folders = DriveApp.getFoldersByName("Tickets_Backup");
      if (folders.hasNext()) {
        folder = folders.next();
        // 見つかったらプロパティ更新
        PropertiesService.getScriptProperties().setProperty(BACKUP_FOLDER_ID_KEY, folder.getId());
      }
    }
    
    // それでもなければ作成
    if (!folder) {
      folder = DriveApp.createFolder("Tickets_Backup");
      PropertiesService.getScriptProperties().setProperty(BACKUP_FOLDER_ID_KEY, folder.getId());
    }
    
    const ss = SpreadsheetApp.create(backupName);
    const file = DriveApp.getFileById(ss.getId());
    file.moveTo(folder);
    
    // 3. シートにデータ書き込み
    tables.forEach(table => {
      const data = backupData[table];
      if (data && data.length > 0) {
        let sheet = ss.getSheetByName(table);
        if (!sheet) {
          sheet = ss.insertSheet(table);
        }
        
        // ヘッダー作成
        const headers = Object.keys(data[0]);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        
        // データ行作成 (2次元配列に変換)
        // Date型などは文字列になることに注意。リストア時に再変換が必要かも。
        // JSON.stringifyを使って複雑なオブジェクト（JSONBなど）を文字列化する
        const rows = data.map(row => {
          return headers.map(header => {
            const val = row[header];
            if (val && typeof val === 'object') {
              return JSON.stringify(val);
            }
            return val;
          });
        });
        
        // 一括書き込み (チャンク分割推奨だが、ここでは簡易実装)
        if (rows.length > 0) {
          sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
        }
      } else {
        // 空のシートだけでも作っておく
        let sheet = ss.getSheetByName(table);
        if (!sheet) sheet = ss.insertSheet(table);
        sheet.getRange(1, 1).setValue("NO_DATA");
      }
    });
    
    // デフォルトのシート1を削除
    const defaultSheet = ss.getSheetByName('シート1');
    if (defaultSheet) ss.deleteSheet(defaultSheet);
    
    return { 
      success: true, 
      backupId: ss.getId(), 
      name: backupName, 
      url: ss.getUrl(),
      timestamp: timestamp
    };
    
  } catch (e) {
    Logger.log('Backup Failed: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * バックアップ一覧を取得する
 */
function getBackupsList() {
  try {
    let folderId = PropertiesService.getScriptProperties().getProperty(BACKUP_FOLDER_ID_KEY);
    let folder;

    if (folderId) {
       try { folder = DriveApp.getFolderById(folderId); } catch(e) { folder = null; }
    }

    if (!folder) {
       const folders = DriveApp.getFoldersByName("Tickets_Backup");
       if (folders.hasNext()) {
         folder = folders.next();
         PropertiesService.getScriptProperties().setProperty(BACKUP_FOLDER_ID_KEY, folder.getId());
       }
    }

    if (!folder) {
        // フォルダがない＝バックアップもない
        return { success: true, backups: [] };
    }
    
    // MimeType.GOOGLE_SHEETS or default spread sheet mime
    const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
    const backups = [];
    
    while (files.hasNext()) {
      const file = files.next();
      backups.push({
        id: file.getId(),
        name: file.getName(),
        created: file.getDateCreated(),
        url: file.getUrl()
      });
    }
    
    // 日付順にソート (新しい順)
    backups.sort((a, b) => b.created - a.created);
    
    return { success: true, backups: backups };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 自動バックアップ実行用関数 (Time-driven triggerから呼ぶ)
 * バックアップを作成し、古いバックアップを削除する（ローテーション）
 */
function runPeriodicBackup() {
  console.log("Starting periodic backup...");
  const result = backupDatabase();
  if (result.success) {
    console.log(`Periodic backup created: ${result.name}`);
    // 古いバックアップを削除 (最新 30件 を残す)
    cleanupOldBackups(30);
  } else {
    console.error(`Periodic backup failed: ${result.error}`);
    // エラー通知メール等を送る場合はここに記述
  }
}

/**
 * 古いバックアップを削除する
 * @param {number} retentionCount 残すバックアップの数
 */
function cleanupOldBackups(retentionCount) {
  try {
    const list = getBackupsList();
    if (!list.success || !list.backups) return;
    
    const backups = list.backups; // 既に日付降順 (新しい順) にソートされている
    
    if (backups.length > retentionCount) {
      const toDelete = backups.slice(retentionCount);
      console.log(`Cleaning up ${toDelete.length} old backups...`);
      
      toDelete.forEach(fileData => {
        try {
          const file = DriveApp.getFileById(fileData.id);
          file.setTrashed(true);
          console.log(`Deleted old backup: ${fileData.name}`);
        } catch (e) {
          console.warn(`Failed to delete ${fileData.name}: ${e.message}`);
        }
      });
    }
  } catch (e) {
    console.error(`Cleanup failed: ${e.message}`);
  }
}

/**
 * データベースをリストアする（危険な操作）
 * @param {string} backupSpreadsheetId
 */
function restoreDatabase(backupSpreadsheetId, restoreKey) {
  try {
    const correctKey = PropertiesService.getScriptProperties().getProperty('RESTORE_KEY');
    if (!correctKey) {
      return { success: false, error: 'RESTORE_KEY is not set in Script Properties.' };
    }
    if (restoreKey !== correctKey) {
      return { success: false, error: 'Invalid restore key.' };
    }

    const ss = SpreadsheetApp.openById(backupSpreadsheetId);
    
    // 依存関係順序 (削除はこの逆、挿入はこの順序)
    // 親から順に挿入する
    const insertOrder = ['groups', 'event_dates', 'time_slots', 'performances', 'bookings', 'seats', 'settings'];
    const deleteOrder = [...insertOrder].reverse();
    
    // 1. 全データ削除 (Truncate)
    // NOTE: bookingsとseatsは相互依存しないように設計されているが、FK制約があるため順序重要
    // seats -> performances (FK)
    // bookings -> performances (FK)
    // seats.booking_id -> bookings.id (Set Null or Cascade? Schema says Set Null)
    // しかし seats.performance_id -> Cascade
    // 安全のため、削除は seats -> bookings -> performances -> Master の順で行う
    
    deleteOrder.forEach(table => {
      // 全件削除
      const response = supabaseIntegration._request(`${table}?id=gt.0`, { 
        method: 'DELETE',
        useServiceRole: true 
      });
      // system_settingsなどはidがないかも？ key指定などが必要？ Schema: id serial primary keyあり。
      if (!response.success) {
        // テーブルが空の場合などはエラーにならないはずだが、念のためログ
        console.warn(`Delete failed for ${table} (might be empty or RLS): ${response.error}`);
      }
    });
    
    // 2. データ挿入
    for (const table of insertOrder) {
      const sheet = ss.getSheetByName(table);
      if (!sheet) continue;
      
      const rows = sheet.getDataRange().getValues();
      if (rows.length <= 1) continue; // ヘッダーのみまたは空
      if (rows.length === 1 && rows[0][0] === "NO_DATA") continue;
      
      const headers = rows[0];
      const dataRows = rows.slice(1);
      
      const payload = dataRows.map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          let val = row[index];
          // スプレッドシートの日付オブジェクトをISO文字列に変換
          if (val instanceof Date) {
             // time_slotsのstart_time/end_timeの場合はHH:mm形式にする
             if ((table === 'time_slots' && (header === 'start_time' || header === 'end_time')) ||
                 (table === 'performances' && header === 'timeslot')) {
               const hours = ('0' + val.getHours()).slice(-2);
               const minutes = ('0' + val.getMinutes()).slice(-2);
               val = `${hours}:${minutes}`;
             } else {
               val = val.toISOString();
             }
          }
          
          if (typeof val === 'string') {
             // JSON文字列をオブジェクトに戻す
             if (val.startsWith('{') || val.startsWith('[')) {
                try { val = JSON.parse(val); } catch (_) {}
             }
             // time_slotsのVARCHAR(5)制限対応 (文字列の場合もカット)
             // performancesのVARCHAR(10)制限対応
             if (table === 'time_slots' && (header === 'start_time' || header === 'end_time')) {
                if (val.length > 5) val = val.substring(0, 5);
             }
             if (table === 'performances' && header === 'timeslot') {
                if (val.length > 10) val = val.substring(0, 10);
             }
          }

          // 空文字はnullにする？ Supabaseの挙動によるが、FKなどはnullが必要
          if (val === '') val = null;
          
          obj[header] = val;
        });
        return obj;
      });
      
      // チャンク分割して挿入 (一度に送りすぎるとエラーになる可能性)
      const CHUNK_SIZE = 100;
      for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
        const chunk = payload.slice(i, i + CHUNK_SIZE);
        const res = supabaseIntegration._request(table, {
          method: 'POST',
          body: chunk,
          useServiceRole: true,
          headers: { 'Prefer': 'resolution=merge-duplicates' } // ID重複時は更新（実質上書き）
        });
        
        if (!res.success) {
          throw new Error(`Restore failed for ${table} at chunk ${i}: ${res.error}`);
        }
      }
    }
    
    return { success: true, message: 'Restore completed successfully' };
    
  } catch (e) {
    Logger.log('Restore Error: ' + e.message);
    return { success: false, error: e.message };
  }
}
