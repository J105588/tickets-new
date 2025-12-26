/**
 * 予約API関連の関数群
 * 外部からのリクエスト(doGet/doPost)やGAS内部ロジックから呼び出されます。
 */

// ==========================================
// 予約作成 (Create Reservation)
// ==========================================

/**
 * 新規予約を作成する
 * @param {Object} data - { group, day, timeslot, seats: ['A1','A2'], name, email, grade_class, club_affiliation }
 */
function createReservation(data) {
  try {
    // 1. 公演IDの特定
    // 注意: 本来は getOrCreatePerformance ですが、予約時は既存の公演がある前提
    const perfResult = getOrCreatePerformance(data.group, data.day, data.timeslot);
    if (!perfResult.success) {
      return { success: false, error: '指定された公演が見つかりません: ' + perfResult.error };
    }
    const performanceId = perfResult.data.id;

    // 2. 座席の空き状況確認（排他制御は完全ではないが、直前チェックを行う）
    const seatIds = data.seats;
    if (!seatIds || seatIds.length === 0) {
      return { success: false, error: '座席が選択されていません' };
    }
    
    // 現在の座席状態を取得
    const currentSeatsResult = supabaseIntegration.getSeats(performanceId);
    if (!currentSeatsResult.success) return { success: false, error: '座席情報の確認に失敗しました' };
    
    const unavailable = currentSeatsResult.data.filter(s => 
      seatIds.includes(s.seat_id) && s.status !== 'available'
    );
    
    if (unavailable.length > 0) {
      return { success: false, error: `以下の座席は既に予約されています: ${unavailable.map(s=>s.seat_id).join(', ')}` };
    }

    // 3. 予約データの作成 (bookingsテーブル)
    const passcode = Math.floor(1000 + Math.random() * 9000).toString(); // 4桁の数字
    const bookingData = {
      performance_id: performanceId,
      name: data.name,
      email: data.email,
      grade_class: data.grade_class,
      club_affiliation: data.club_affiliation,
      passcode: passcode,
      status: 'confirmed'
    };
    
    const bookingResult = supabaseIntegration.createBooking(bookingData);
    if (!bookingResult.success || !bookingResult.data || bookingResult.data.length === 0) {
      return { success: false, error: '予約データの作成に失敗しました: ' + (bookingResult.error || '不明なエラー') };
    }
    
    const bookingId = bookingResult.data[0].id; // 新しく作成された予約ID

    // 4. 座席ステータスの更新 (seatsテーブル)
    // booking_id と status='reserved', reserved_by=name を更新
    const updates = seatIds.map(seatId => ({
      seatId: seatId,
      data: { 
        status: 'reserved',
        reserved_by: data.name,
        booking_id: bookingId,
        reserved_at: new Date().toISOString()
      }
    }));
    
    const seatUpdateResult = supabaseIntegration.updateMultipleSeats(performanceId, updates);
    if (!seatUpdateResult.success) {
      // 致命的エラー: 予約レコードはできたが座席が更新できなかった -> 実際はロールバックが必要だが簡略化
      console.error(`CRITICAL: Booking ${bookingId} created but seats failed to update.`);
      return { success: false, error: '座席の確保に失敗しました。管理者に連絡してください。' };
    }

    // 5. 完了メールの送信
    sendReservationEmail(data.email, {
      name: data.name,
      group: data.group,
      day: data.day,
      timeslot: data.timeslot,
      seats: seatIds.join(', '),
      bookingId: bookingId,
      passcode: passcode
    });

    return { 
      success: true, 
      data: { 
        bookingId: bookingId, 
        passcode: passcode 
      } 
    };

  } catch (e) {
    console.error('createReservation Error:', e);
    return { success: false, error: e.message };
  }
}

// ==========================================
// 予約照会 (Get Booking)
// ==========================================

/**
 * 予約内容を確認する（ステータスページ用）
 */
function getBookingDetails(bookingId, passcode) {
  try {
    const result = supabaseIntegration.getBookingByCredentials(bookingId, passcode);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}


// ==========================================
// チェックイン (Check-in)
// ==========================================

/**
 * 予約IDとパスコードでチェックインする（ユーザーまたは管理者による手動入力）
 * 管理者がQRスキャンした場合はパスコードチェックをスキップするロジックも検討可能だが、
 * QRコードにパスコードを含めることでセキュリティを維持する。
 */
function checkInReservation(bookingId, passcode) {
  try {
    // 1. 存在確認とパスコード照合
    const getRes = supabaseIntegration.getBookingByCredentials(bookingId, passcode);
    if (!getRes.success) {
      return { success: false, error: '予約が見つからないか、パスコードが間違っています' };
    }
    
    const booking = getRes.data;
    if (booking.status === 'checked_in') {
      return { success: true, message: '既にチェックイン済みです', data: booking };
    }
    
    if (booking.status === 'cancelled') {
      return { success: false, error: 'この予約はキャンセルされています' };
    }

    // 2. 更新実行
    const updateRes = supabaseIntegration.updateBookingStatus(bookingId, 'checked_in');
    if (!updateRes.success) {
      return { success: false, error: 'チェックイン処理に失敗しました' };
    }
    
    return { success: true, data: updateRes.data };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// メール送信ヘルパー
// ==========================================

function sendReservationEmail(to, info) {
  // ステータス確認ページのURL (フロントエンドのURLに書き換える必要あり)
  // 仮: pages/reservation-status.html?id=xxx&pass=xxxx
  // 実際にはデプロイ先のURLが必要
  
  // ScriptPropertyからフロントエンドのベースURLを取得する設計を推奨
  // 今回は仮置き
  const baseUrl = 'https://example.com/tickets-new'; 
  const statusUrl = `${baseUrl}/pages/reservation-status.html?id=${info.bookingId}&pass=${info.passcode}`;
  
  const subject = `【チケット予約完了】${info.group}公演`;
  
  const body = `
${info.name} 様

ご予約ありがとうございます。以下の内容でチケットの予約を受け付けました。

■ 予約内容
----------------------------
予約ID: ${info.bookingId}
公演: ${info.group}
日時: ${info.day}日目 ${info.timeslot}
座席: ${info.seats}
----------------------------

■ 当日の入場について
以下のリンクから「予約確認ページ」にアクセスし、表示されるQRコードを受付でご提示ください。

【予約確認ページ】
${statusUrl}

確認コード: ${info.passcode}
(リンクが開かない場合は、確認ページで上記コードを入力してください)

※ このメールは自動送信されています。
  `.trim();

  try {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body
    });
    console.log(`Email sent to ${to} for booking ${info.bookingId}`);
  } catch (e) {
    console.error(`Failed to send email to ${to}:`, e.message);
    // メール送信失敗は予約失敗にはしない
  }
}
