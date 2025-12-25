// SupabaseSettings.gs
// Supabase設定管理用のGASファイル

/**
 * Supabase設定を初期化する
 * この関数を一度実行してSupabaseの設定を完了してください
 */
function setupSupabaseSettings() {
  const properties = PropertiesService.getScriptProperties();
  
  // Supabase設定のプロパティを設定
  properties.setProperty('SUPABASE_URL', 'https://your-project.supabase.co');
  properties.setProperty('SUPABASE_ANON_KEY', 'your-anon-key');
  properties.setProperty('SUPABASE_SERVICE_ROLE_KEY', 'your-service-role-key');
  
  console.log('Supabase設定を初期化しました');
  console.log('以下の設定を更新してください:');
  console.log('- SUPABASE_URL: SupabaseプロジェクトのURL');
  console.log('- SUPABASE_ANON_KEY: Supabase匿名キー');
  console.log('- SUPABASE_SERVICE_ROLE_KEY: Supabaseサービスロールキー');
}

/**
 * Supabase設定を確認する
 */
function checkSupabaseSettings() {
  const properties = PropertiesService.getScriptProperties();
  
  const url = properties.getProperty('SUPABASE_URL');
  const anonKey = properties.getProperty('SUPABASE_ANON_KEY');
  const serviceRoleKey = properties.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  
  console.log('=== Supabase設定確認 ===');
  console.log('URL:', url ? '設定済み' : '未設定');
  console.log('Anon Key:', anonKey ? '設定済み' : '未設定');
  console.log('Service Role Key:', serviceRoleKey ? '設定済み' : '未設定');
  
  if (!url || !anonKey) {
    console.log('⚠️ 必須設定が不足しています。setupSupabaseSettings()を実行してください。');
    return false;
  }
  
  console.log('✅ Supabase設定は完了しています');
  return true;
}

/**
 * Supabase設定を更新する
 */
function updateSupabaseSettings(url, anonKey, serviceRoleKey = null) {
  const properties = PropertiesService.getScriptProperties();
  
  if (url) {
    properties.setProperty('SUPABASE_URL', url);
    console.log('Supabase URLを更新しました');
  }
  
  if (anonKey) {
    properties.setProperty('SUPABASE_ANON_KEY', anonKey);
    console.log('Supabase Anon Keyを更新しました');
  }
  
  if (serviceRoleKey) {
    properties.setProperty('SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey);
    console.log('Supabase Service Role Keyを更新しました');
  }
  
  console.log('Supabase設定の更新が完了しました');
}

/**
 * Supabase接続テストを実行する
 */
async function testSupabaseConnection() {
  try {
    console.log('Supabase接続テストを開始...');
    
    // 設定確認
    if (!checkSupabaseSettings()) {
      return { success: false, error: 'Supabase設定が不完全です' };
    }
    
    // 接続テスト
    const result = await supabaseIntegration.testConnection();
    
    if (result.success) {
      console.log('✅ Supabase接続テスト成功');
      return { success: true, message: 'Supabase接続成功' };
    } else {
      console.log('❌ Supabase接続テスト失敗:', result.error);
      return { success: false, error: result.error };
    }
    
  } catch (e) {
    console.log('❌ Supabase接続テストエラー:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * データベース初期化を実行する
 */
async function initializeSupabaseDatabase() {
  try {
    console.log('Supabaseデータベース初期化を開始...');
    
    // 接続テスト
    const connectionTest = await testSupabaseConnection();
    if (!connectionTest.success) {
      return { success: false, error: 'Supabase接続に失敗しました' };
    }
    
    // 公演データの初期化
    const groups = ['オーケストラ部', '吹奏楽部', 'マーチング', '音楽部', '演劇部', '見本演劇'];
    const days = [1, 2];
    const timeslots = ['A'];
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const group of groups) {
      for (const day of days) {
        for (const timeslot of timeslots) {
          try {
            const result = await supabaseIntegration.createPerformance(group, day, timeslot);
            if (result.success) {
              // 座席データを生成
              await generateSeatsForPerformanceSettings(result.data.id);
              successCount++;
              console.log(`公演作成成功: ${group} ${day}日目 ${timeslot}時間帯`);
            } else {
              errorCount++;
              console.log(`公演作成失敗: ${group} ${day}日目 ${timeslot}時間帯 - ${result.error}`);
            }
          } catch (error) {
            errorCount++;
            console.log(`公演作成エラー: ${group} ${day}日目 ${timeslot}時間帯 - ${error.message}`);
          }
        }
      }
    }
    
    console.log(`データベース初期化完了: 成功 ${successCount}件, 失敗 ${errorCount}件`);
    return { success: true, data: { success: successCount, error: errorCount } };
    
  } catch (e) {
    console.log('❌ データベース初期化エラー:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * 座席データを生成する（公演ID指定）- SupabaseSettings版
 */
async function generateSeatsForPerformanceSettings(performanceId) {
  try {
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
    
    let seatsCreated = 0;
    
    // 各列の座席を生成
    for (const [row, config] of Object.entries(seatConfig)) {
      for (let seatNum = config.start; seatNum <= config.end; seatNum++) {
        try {
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
          const result = await supabaseIntegration._request('seats', {
            method: 'POST',
            body: seatData
          });
          
          if (result.success) {
            seatsCreated++;
          }
        } catch (error) {
          console.log(`座席作成エラー: ${row}${seatNum} - ${error.message}`);
        }
      }
    }
    
    console.log(`座席データ生成完了: 公演ID ${performanceId}, ${seatsCreated}席`);
    return seatsCreated;
    
  } catch (e) {
    console.log(`generateSeatsForPerformance Error: ${e.message}`);
    return 0;
  }
}

/**
 * データベースの状態を確認する
 */
async function checkDatabaseStatus() {
  try {
    console.log('データベース状態確認を開始...');
    
    // 公演数の確認
    const performancesResult = await supabaseIntegration._request('performances?select=count');
    const performanceCount = performancesResult.success ? performancesResult.data.length : 0;
    
    // 座席数の確認
    const seatsResult = await supabaseIntegration._request('seats?select=count');
    const seatCount = seatsResult.success ? seatsResult.data.length : 0;
    
    console.log('=== データベース状態 ===');
    console.log(`公演数: ${performanceCount}`);
    console.log(`座席数: ${seatCount}`);
    
    return {
      success: true,
      data: {
        performances: performanceCount,
        seats: seatCount,
        expectedPerformances: 12, // 6公演 × 2日
        expectedSeats: 8160 // 12公演 × 680席
      }
    };
    
  } catch (e) {
    console.log('❌ データベース状態確認エラー:', e.message);
    return { success: false, error: e.message };
  }
}
