/**
 * AdminAPI.gs
 * 管理画面用の高度な操作を提供するAPI
 */

// ==========================================
// 予約一覧取得 (検索・フィルタリング)
// ==========================================
function getAdminReservations(filters) {
  try {
    // 基本クエリ: bookingsテーブルとperformances, seatsを結合して取得
    // SupabaseのREST APIでフィルタリングを行う
    
    // filters: { group, day, timeslot, year, class_num }
    
    let query = 'select=*,performances!inner(group_name,day,timeslot),seats(seat_id)';
    let conditions = [];
    
    // 1. 公演によるフィルタ (group, day, timeslot)
    if (filters.group) {
      conditions.push(`performances.group_name=eq.${encodeURIComponent(filters.group)}`);
    }
    if (filters.day) {
      conditions.push(`performances.day=eq.${filters.day}`);
    }
    if (filters.timeslot) {
      conditions.push(`performances.timeslot=eq.${encodeURIComponent(filters.timeslot)}`);
    }
    
    // 2. 学年・クラスによるフィルタ
    // grade_classは "1-1" のような文字列
    if (filters.year || filters.class_num) {
      let gradeStr = '';
      // "年-組" という形式で部分一致検索をするか、year/classが独立しているかによるが、
      // 現状は grade_class varchar(50) なので、 "1-1" 等が入っている。
      // filters.year = 1, filters.class_num = 1 なら "1-1" を検索
      
      if (filters.year && filters.class_num) {
        gradeStr = `${filters.year}-${filters.class_num}`;
        conditions.push(`grade_class=eq.${gradeStr}`);
      } else if (filters.year) {
         // "1-*" のような検索はLIKE演算子が必要: grade_class=like.1-%
         conditions.push(`grade_class=like.${filters.year}-%`);   
      }
      // クラスのみの検索はあまり意味がないのでスキップ
    }

    // 3. フリーワード検索 (名前, 予約ID, メール)
    if (filters.search) {
        const term = encodeURIComponent(filters.search);
        // Supabase PostgREST syntax for OR: or=(col1.ilike.*val*,col2.ilike.*val*)
        // Note: reservation_id is typically text/uuid. id is int (might fail ilike if not cast, but typically we search text fields).
        // Let's search name, reservation_id, email.
        conditions.push(`or=(name.ilike.*${term}*,reservation_id.ilike.*${term}*,email.ilike.*${term}*)`);
    }
    
    // クエリパラメータの結合
    let endpoint = 'bookings?' + query;
    if (conditions.length > 0) {
      endpoint += '&' + conditions.join('&');
    }
    
    // ソート (作成日時順)
    endpoint += '&order=created_at.desc';

    const response = supabaseIntegration._request(endpoint, { useServiceRole: true });
    
    if (!response.success) {
      return { success: false, error: response.error };
    }
    
    return { success: true, data: response.data };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// 管理者用: メール再送
// ==========================================
function adminResendEmail(bookingId) {
  try {
    const response = supabaseIntegration.getBooking(bookingId);
    if (!response.success) return { success: false, error: '予約が見つかりません' };
    
    const booking = response.data;
    
    // 公演情報を取得 (bookingにはperformance_idしかないため)
    // getBookingByCredentialsなら結合できるが、getBookingは単純取得になっている可能性があるため再取得
    // ここではgetBookingのselectを強化して結合済みのデータを期待するか、別途取得するか。
    // SupabaseIntegration.getBookingの実装を見ると、seatsは結合されているがperformancesは結合されていないかも？
    // 確認: getBookingは `bookings?id=eq.${bookingId}&select=*,seats(...)` となっている
    
    // performancesを取得
    const perfRes = supabaseIntegration._request(`performances?id=eq.${booking.performance_id}`);
    if (!perfRes.success || perfRes.data.length === 0) return { success: false, error: '公演情報が見つかりません' };
    const performance = perfRes.data[0];
    
    // シート文字列
    const seats = booking.seats ? booking.seats.map(s => s.seat_id).join(', ') : '未指定';
    
    // メール送信
    sendReservationEmail(booking.email, {
      name: booking.name,
      group: performance.group_name,
      day: performance.day,
      timeslot: performance.timeslot,
      seats: seats,
      bookingId: booking.id,
      passcode: booking.passcode
    });
    
    return { success: true, message: 'メールを再送しました' };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// 管理者用: 座席変更
// ==========================================
function adminChangeSeats(bookingId, newSeatIds) {
  try {
    // 現在の予約取得
    const bookingRes = supabaseIntegration.getBooking(bookingId);
    if (!bookingRes.success) return {success: false, error: '予約なし'};
    const booking = bookingRes.data;
    const performanceId = booking.performance_id;

    // 1. Bulk Release: Release ALL seats associated with this booking ID
    // This is more robust than iterating individually and avoids phantom seats
    const releaseRes = supabaseIntegration._request(`seats?booking_id=eq.${bookingId}`, {
        method: 'PATCH',
        useServiceRole: true,
        body: { 
            status: 'available', 
            booking_id: null, 
            reserved_by: null, 
            reserved_at: null 
        }
    });

    if (!releaseRes.success) return { success: false, error: '旧座席の開放に失敗(Bulk): ' + releaseRes.error };
    
    // 2. 新しい座席の確保
    // まず空きチェック
    const checkRes = supabaseIntegration._request(`seats?performance_id=eq.${performanceId}&seat_id=in.(${newSeatIds.join(',')})`);
    const targetSeats = checkRes.data;
    
    // 他人の予約が入っているかチェック (Bulk Release後なので、自分自身も既にnullになっているはず → 即ち埋まっててはいけない)
    // ただし、既に開放済みなので、もし埋まっていたら「他人」確定。
    const unavailable = targetSeats.filter(s => s.status !== 'available');
    
    if (unavailable.length > 0) {
      // 復旧困難（既に開放してしまった）
      // FIXME: 本来はトランザクションにするべきだが、修正の緊急度優先
      return { success: false, error: '選択された座席は既に埋まっています（旧座席は開放されました）' };
    }
    
    const reserveUpdates = newSeatIds.map(sid => ({
        seatId: sid,
        data: {
            status: 'reserved',
            booking_id: bookingId,
            reserved_by: booking.name,
            reserved_at: new Date().toISOString()
        }
    }));
    
    const reserveRes = supabaseIntegration.updateMultipleSeats(performanceId, reserveUpdates);
    if (!reserveRes.success) return { success: false, error: '新座席の確保に失敗' };
    
    // 3. メール再送（変更通知）
    adminResendEmail(bookingId);
    
    return { success: true, message: '座席を変更しました' };
    
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// 管理者用: 強制キャンセル
// ==========================================
function adminCancelReservation(bookingId) {
  try {
     // パスコードチェックなしでキャンセル処理を行う
     // 既存のcancelReservationロジックを流用したいが、パスコード必須設計のため
     // ここで再実装するか、ロジックを分離する必要がある。
     // ここでは再実装（Admin権限）
     
    const bookingRes = supabaseIntegration.getBooking(bookingId);
    if (!bookingRes.success) return { success: false, error: '予約が見つかりません' };
    const booking = bookingRes.data;

    if (booking.status === 'cancelled') return { success: true, message: '既にキャンセル済' };
    
    // ステータス更新
    const updateRes = supabaseIntegration.updateBookingStatus(bookingId, 'cancelled');
    if (!updateRes.success) return { success: false, error: '更新失敗' };
    
    // 座席開放
    const performanceId = booking.performance_id;
    // シート検索 (seatsテーブルのbooking_idで探す)
    const seatsRes = supabaseIntegration._request(`seats?booking_id=eq.${bookingId}`);
    if (seatsRes.success && seatsRes.data.length > 0) {
        const updates = seatsRes.data.map(s => ({
            seatId: s.seat_id,
            data: { 
                status: 'available', booking_id: null, reserved_by: null, reserved_at: null, checked_in_at: null 
            }
        }));
        supabaseIntegration.updateMultipleSeats(performanceId, updates);
    }
    
    return { success: true, message: '予約を強制キャンセルしました' };
     
  } catch (e) {
    return { success: false, error: e.message };
  }
}
// ==========================================
// 管理者用: 予約情報更新 (名前、メール、備考など)
// ==========================================
function adminUpdateReservation(bookingId, updates) {
  try {
    // updates: { name, email, grade_class, club_affiliation, notes, status? }
    
    if (!bookingId) return { success: false, error: 'Booking ID is required' };
    
    // updateBookingStatus is for status only. Use generic PATCH for other fields.
    const endpoint = `bookings?id=eq.${bookingId}`;
    const result = supabaseIntegration._request(endpoint, {
      method: 'PATCH',
      headers: { 
        'Prefer': 'return=minimal'
      },
      body: updates
    });
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    return { success: true, message: '予約情報を更新しました', debug_updates: updates };
    
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// 管理者用: まとめメール送信
// ==========================================
function adminSendSummaryEmails(jobs) {
  let count = 0;
  let errors = [];
  
  if (!jobs || !Array.isArray(jobs)) return { success: false, error: 'Invalid jobs' };

  jobs.forEach(job => {
    try {
      const name = job.name;
      const emails = job.emails; // Array
      if (!emails || emails.length === 0) return;

      const bookings = job.bookings || [];
      
      let body = `${name} 様\n\n平素より大変お世話になっております。\n市川学園座席管理システム運営でございます。\n\nお客様の現在のご予約状況を以下の通りまとめてご案内申し上げます。\n\n--------------------------------------------------\n`;
      
      bookings.forEach((b, i) => {
        let statusText = b.status;
        if (b.status === 'confirmed') statusText = '予約済';
        if (b.status === 'checked_in') statusText = '入場済';
        if (b.status === 'cancelled') statusText = 'キャンセル';

        const link = `https://j105588.github.io/tickets-new/pages/reservation-status.html?id=${b.id}&pass=${b.passcode}`;
        
        let createdStr = '不明';
        if (b.created_at) {
          const d = new Date(b.created_at);
          createdStr = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
        }

        body += `[${i+1}] ${b.group_name}\n`;
        body += `     日時: ${b.day} (${b.timeslot})\n`;
        body += `     座席: ${b.seat}\n`;
        body += `     予約ID: ${b.id}\n`;
        body += `     ステータス: ${statusText}\n`;
        body += `     予約受付日時: ${createdStr}\n`;
        body += `     詳細確認: ${link}\n`;
        body += `--------------------------------------------------\n`;
      });
      
      body += `\n当日はQRコードをご提示の上、受付までお越しください。\nご来場を心よりお待ち申し上げております。\n\n市川学園座席管理システム`;
      
      const recipient = emails[0];
      const options = {};
      if (emails.length > 1) {
        options.cc = emails.slice(1).join(',');
      }
      
      MailApp.sendEmail(recipient, '【市川学園座席管理システム】ご予約内容の確認', body, options);
      count++;
      
    } catch (e) {
      errors.push(`${job.name}: ${e.message}`);
      console.error('Email send failed for ' + job.name, e);
    }
  });

  return { success: true, count: count, errors: errors };
}

