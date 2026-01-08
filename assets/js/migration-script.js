// migration-script.js
// 既存のGoogle SpreadsheetデータをSupabaseに移行するスクリプト

import { SupabaseAPI } from './supabase-api.js';
import { SEAT_CONFIG } from './seat-config.js';

class DataMigration {
  constructor(supabaseAPI) {
    this.supabaseAPI = supabaseAPI;
    this.migrationLog = [];
  }

  // 移行ログの記録
  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message, type };
    this.migrationLog.push(logEntry);
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  // 移行ログの取得
  getMigrationLog() {
    return this.migrationLog;
  }

  // 移行ログのクリア
  clearMigrationLog() {
    this.migrationLog = [];
  }

  // 公演データの移行
  async migratePerformances() {
    this.log('公演データの移行を開始...');

    const groups = ['オーケストラ部', '吹奏楽部', 'マーチング', '音楽部', '演劇部', '見本演劇'];
    const days = [1, 2];
    const timeslots = ['A'];

    let successCount = 0;
    let errorCount = 0;

    for (const group of groups) {
      for (const day of days) {
        for (const timeslot of timeslots) {
          try {
            const result = await this.supabaseAPI.createPerformance(group, day, timeslot);
            if (result.success) {
              successCount++;
              this.log(`公演作成成功: ${group} ${day}日目 ${timeslot}時間帯`);
            } else {
              errorCount++;
              this.log(`公演作成失敗: ${group} ${day}日目 ${timeslot}時間帯 - ${result.error}`, 'error');
            }
          } catch (error) {
            errorCount++;
            this.log(`公演作成エラー: ${group} ${day}日目 ${timeslot}時間帯 - ${error.message}`, 'error');
          }
        }
      }
    }

    this.log(`公演データ移行完了: 成功 ${successCount}件, 失敗 ${errorCount}件`);
    return { success: successCount, error: errorCount };
  }

  // 座席データの移行
  async migrateSeats() {
    this.log('座席データの移行を開始...');

    const groups = ['オーケストラ部', '吹奏楽部', 'マーチング', '音楽部', '演劇部', '見本演劇'];
    const days = [1, 2];
    const timeslots = ['A'];

    let totalSeatsCreated = 0;
    let errorCount = 0;

    for (const group of groups) {
      for (const day of days) {
        for (const timeslot of timeslots) {
          try {
            // 公演IDを取得
            const performanceResult = await this.supabaseAPI.getPerformances(group, day, timeslot);
            if (!performanceResult.success || !performanceResult.data.length) {
              this.log(`公演が見つかりません: ${group} ${day}日目 ${timeslot}時間帯`, 'error');
              errorCount++;
              continue;
            }

            const performanceId = performanceResult.data[0].id;

            // 座席を生成
            const seatsCreated = await this.generateSeatsForPerformance(performanceId);
            totalSeatsCreated += seatsCreated;

            this.log(`座席生成完了: ${group} ${day}日目 ${timeslot}時間帯 - ${seatsCreated}席`);
          } catch (error) {
            errorCount++;
            this.log(`座席生成エラー: ${group} ${day}日目 ${timeslot}時間帯 - ${error.message}`, 'error');
          }
        }
      }
    }

    this.log(`座席データ移行完了: 総座席数 ${totalSeatsCreated}席, エラー ${errorCount}件`);
    return { totalSeats: totalSeatsCreated, error: errorCount };
  }

  // 特定の公演の座席を生成
  async generateSeatsForPerformance(performanceId) {
    let seatsCreated = 0;

    // 各列の座席を生成
    for (const [row, config] of Object.entries(SEAT_CONFIG.rows)) {
      for (let seatNum = config.start; seatNum <= config.end; seatNum++) {
        try {
          const seatId = `${row}${seatNum}`;
          const result = await this.createSeat(performanceId, seatId, row, seatNum);
          if (result.success) {
            seatsCreated++;
          }
        } catch (error) {
          this.log(`座席作成エラー: ${row}${seatNum} - ${error.message}`, 'error');
        }
      }
    }

    return seatsCreated;
  }

  // 個別座席の作成
  async createSeat(performanceId, seatId, row, seatNumber) {
    const data = {
      performance_id: performanceId,
      seat_id: seatId,
      row_letter: row,
      seat_number: seatNumber,
      status: 'available',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return await this.supabaseAPI._request('seats', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // 既存データの検証
  async validateMigration() {
    this.log('移行データの検証を開始...');

    const validationResults = {
      performances: { expected: 12, actual: 0, success: false }, // 6公演 × 2日 = 12公演
      seats: { expected: 8160, actual: 0, success: false }, // 12公演 × 680席
      errors: []
    };

    try {
      // 公演数の検証
      const performancesResult = await this.supabaseAPI._request('performances?select=count');
      if (performancesResult.success) {
        validationResults.performances.actual = performancesResult.data.length;
        validationResults.performances.success = validationResults.performances.actual === validationResults.performances.expected;
      }

      // 座席数の検証
      const seatsResult = await this.supabaseAPI._request('seats?select=count');
      if (seatsResult.success) {
        validationResults.seats.actual = seatsResult.data.length;
        validationResults.seats.success = validationResults.seats.actual === validationResults.seats.expected;
      }

      // 検証結果のログ出力
      this.log(`公演数検証: 期待値 ${validationResults.performances.expected}, 実際 ${validationResults.performances.actual}, 成功 ${validationResults.performances.success}`);
      this.log(`座席数検証: 期待値 ${validationResults.seats.expected}, 実際 ${validationResults.seats.actual}, 成功 ${validationResults.seats.success}`);

      if (!validationResults.performances.success) {
        validationResults.errors.push(`公演数が期待値と異なります: 期待値 ${validationResults.performances.expected}, 実際 ${validationResults.performances.actual}`);
      }

      if (!validationResults.seats.success) {
        validationResults.errors.push(`座席数が期待値と異なります: 期待値 ${validationResults.seats.expected}, 実際 ${validationResults.seats.actual}`);
      }

    } catch (error) {
      validationResults.errors.push(`検証エラー: ${error.message}`);
      this.log(`検証エラー: ${error.message}`, 'error');
    }

    this.log(`移行データ検証完了: エラー ${validationResults.errors.length}件`);
    return validationResults;
  }

  // 完全な移行プロセスの実行
  async executeFullMigration() {
    this.log('完全な移行プロセスを開始...');
    this.clearMigrationLog();

    const startTime = Date.now();

    try {
      // 1. 公演データの移行
      const performancesResult = await this.migratePerformances();

      // 2. 座席データの移行
      const seatsResult = await this.migrateSeats();

      // 3. 移行データの検証
      const validationResult = await this.validateMigration();

      const endTime = Date.now();
      const duration = endTime - startTime;

      const summary = {
        duration: duration,
        performances: performancesResult,
        seats: seatsResult,
        validation: validationResult,
        success: validationResult.errors.length === 0
      };

      this.log(`移行プロセス完了: 所要時間 ${duration}ms, 成功 ${summary.success}`);
      return summary;

    } catch (error) {
      this.log(`移行プロセスエラー: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  // 特定の公演の座席データを移行
  async migrateSpecificPerformance(group, day, timeslot) {
    this.log(`特定公演の移行開始: ${group} ${day}日目 ${timeslot}時間帯`);

    try {
      // 公演の作成
      const performanceResult = await this.supabaseAPI.createPerformance(group, day, timeslot);
      if (!performanceResult.success) {
        return { success: false, error: `公演作成失敗: ${performanceResult.error}` };
      }

      const performanceId = performanceResult.data.id;

      // 座席の生成
      const seatsCreated = await this.generateSeatsForPerformance(performanceId);

      this.log(`特定公演移行完了: ${group} ${day}日目 ${timeslot}時間帯 - ${seatsCreated}席`);
      return { success: true, data: { performanceId, seatsCreated } };

    } catch (error) {
      this.log(`特定公演移行エラー: ${group} ${day}日目 ${timeslot}時間帯 - ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  // 移行データのクリーンアップ
  async cleanupMigrationData() {
    this.log('移行データのクリーンアップを開始...');

    try {
      // 座席データの削除
      const seatsResult = await this.supabaseAPI._request('seats', {
        method: 'DELETE'
      });

      // 公演データの削除
      const performancesResult = await this.supabaseAPI._request('performances', {
        method: 'DELETE'
      });

      // 予約履歴の削除
      const reservationsResult = await this.supabaseAPI._request('bookings', {
        method: 'DELETE'
      });

      this.log('移行データのクリーンアップ完了');
      return { success: true, data: { seats: seatsResult, performances: performancesResult, bookings: reservationsResult } };

    } catch (error) {
      this.log(`クリーンアップエラー: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  // 移行レポートの生成
  generateMigrationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalLogs: this.migrationLog.length,
      infoLogs: this.migrationLog.filter(log => log.type === 'info').length,
      errorLogs: this.migrationLog.filter(log => log.type === 'error').length,
      logs: this.migrationLog
    };

    return report;
  }

  // 移行レポートのエクスポート
  exportMigrationReport(format = 'json') {
    const report = this.generateMigrationReport();

    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'csv':
        const headers = ['timestamp', 'type', 'message'];
        const csvRows = [headers.join(',')];
        report.logs.forEach(log => {
          const row = [log.timestamp, log.type, `"${log.message}"`];
          csvRows.push(row.join(','));
        });
        return csvRows.join('\n');
      default:
        return report;
    }
  }
}

// 移行スクリプトの実行関数
async function runMigration() {
  const supabaseAPI = new SupabaseAPI();
  const migration = new DataMigration(supabaseAPI);

  console.log('座席管理システムのSupabase移行を開始...');

  try {
    // 接続テスト
    const connectionTest = await supabaseAPI.testConnection();
    if (!connectionTest.success) {
      console.error('Supabase接続に失敗しました:', connectionTest.error);
      return;
    }

    console.log('Supabase接続成功');

    // 完全な移行の実行
    const result = await migration.executeFullMigration();

    if (result.success) {
      console.log('移行が正常に完了しました');
      console.log('移行レポート:', migration.exportMigrationReport('json'));
    } else {
      console.error('移行に失敗しました:', result.error);
    }

  } catch (error) {
    console.error('移行スクリプトの実行中にエラーが発生しました:', error);
  }
}

// グローバルアクセス用
if (typeof window !== 'undefined') {
  window.DataMigration = DataMigration;
  window.runMigration = runMigration;
}

// モジュールエクスポート
export { DataMigration, runMigration };
export default DataMigration;
