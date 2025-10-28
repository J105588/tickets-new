// seat-config.js
// 座席管理システム用の座席設定

// 座席配置設定
const SEAT_CONFIG = {
  // 総座席数
  totalSeats: 692,
  
  // 列ごとの座席数設定
  rows: {
    'A': { start: 6, end: 33, count: 28 },    // A列: 6-33番（28席）
    'B': { start: 5, end: 34, count: 30 },    // B列: 5-34番（30席）
    'C': { start: 4, end: 35, count: 32 },    // C列: 4-35番（32席）
    'D': { start: 3, end: 36, count: 34 },    // D列: 3-36番（34席）
    'E': { start: 2, end: 37, count: 36 },    // E列: 2-37番（36席）
    'F': { start: 1, end: 38, count: 38 },    // F列: 1-38番（38席）
    'G': { start: 1, end: 38, count: 38 },    // G列: 1-38番（38席）
    'H': { start: 1, end: 38, count: 38 },    // H列: 1-38番（38席）
    'I': { start: 1, end: 38, count: 38 },    // I列: 1-38番（38席）
    'J': { start: 1, end: 38, count: 38 },    // J列: 1-38番（38席）
    'K': { start: 1, end: 38, count: 38 },    // K列: 1-38番（38席）
    'L': { start: 1, end: 38, count: 38 },    // L列: 1-38番（38席）
    'M': { start: 1, end: 38, count: 38 },    // M列: 1-38番（38席）
    'N': { start: 1, end: 38, count: 38 },    // N列: 1-38番（38席）
    'O': { start: 1, end: 38, count: 38 },    // O列: 1-38番（38席）
    'P': { start: 1, end: 38, count: 38 },    // P列: 1-38番（38席）
    'Q': { start: 1, end: 38, count: 38 },    // Q列: 1-38番（38席）
    'R': { start: 1, end: 38, count: 38 },    // R列: 1-38番（38席）
    'S': { start: 1, end: 38, count: 38 }     // S列: 1-38番（38席）
  },
  
  // 通路位置
  aisles: [
    { row: 'C', seat: 13 },  // C列13番と14番の間
    { row: 'C', seat: 14 },
    { row: 'C', seat: 25 },  // C列25番と26番の間
    { row: 'C', seat: 26 }
  ],
  
  // 座席状態の定義
  seatStatus: {
    AVAILABLE: 'available',      // 予約可能
    RESERVED: 'reserved',        // 予約済み
    CHECKED_IN: 'checked_in',    // チェックイン済み
    WALKIN: 'walkin',           // 当日券
    BLOCKED: 'blocked'          // 使用不可
  },
  
  // 座席状態の色設定
  seatColors: {
    available: '#28a745',    // 緑: 予約可能
    reserved: '#ffc107',     // 黄: 予約済み
    checked_in: '#6c757d',   // 灰: チェックイン済み
    walkin: '#dc3545',       // 赤: 当日券
    blocked: '#e9ecef'       // 薄灰: 使用不可
  }
};

// 座席ID生成関数
function generateSeatId(row, seatNumber) {
  return `${row}${seatNumber}`;
}

// 全座席リスト生成関数
function generateAllSeats() {
  const seats = [];
  
  Object.keys(SEAT_CONFIG.rows).forEach(row => {
    const config = SEAT_CONFIG.rows[row];
    for (let seatNum = config.start; seatNum <= config.end; seatNum++) {
      seats.push({
        id: generateSeatId(row, seatNum),
        row: row,
        seatNumber: seatNum,
        status: SEAT_CONFIG.seatStatus.AVAILABLE
      });
    }
  });
  
  return seats;
}

// 座席配置の検証関数
function validateSeatConfig() {
  let totalCount = 0;
  
  Object.keys(SEAT_CONFIG.rows).forEach(row => {
    const config = SEAT_CONFIG.rows[row];
    const actualCount = config.end - config.start + 1;
    
    if (actualCount !== config.count) {
      console.error(`座席数不一致: ${row}列 - 設定: ${config.count}, 実際: ${actualCount}`);
      return false;
    }
    
    totalCount += config.count;
  });
  
  if (totalCount !== SEAT_CONFIG.totalSeats) {
    console.error(`総座席数不一致: 設定: ${SEAT_CONFIG.totalSeats}, 実際: ${totalCount}`);
    return false;
  }
  
  console.log(`座席設定検証完了: ${totalCount}席`);
  return true;
}

// 座席の可視性チェック（通路の考慮）
function isSeatVisible(row, seatNumber) {
  // 通路位置のチェック
  const aislePositions = SEAT_CONFIG.aisles.filter(aisle => aisle.row === row);
  
  for (const aisle of aislePositions) {
    if (seatNumber === aisle.seat || seatNumber === aisle.seat + 1) {
      return false; // 通路位置は非表示
    }
  }
  
  return true;
}

// 座席の表示用スタイル生成
function generateSeatStyle(seat) {
  const color = SEAT_CONFIG.seatColors[seat.status] || SEAT_CONFIG.seatColors.available;
  
  return {
    backgroundColor: color,
    color: '#ffffff',
    border: '1px solid #dee2e6',
    borderRadius: '4px',
    padding: '8px 12px',
    margin: '2px',
    cursor: seat.status === SEAT_CONFIG.seatStatus.AVAILABLE ? 'pointer' : 'not-allowed',
    opacity: seat.status === SEAT_CONFIG.seatStatus.BLOCKED ? 0.5 : 1,
    display: 'inline-block',
    minWidth: '40px',
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: 'bold'
  };
}

// 座席マップ生成関数
function generateSeatMap(seats) {
  const seatMap = {};
  
  seats.forEach(seat => {
    if (!seatMap[seat.row]) {
      seatMap[seat.row] = [];
    }
    seatMap[seat.row].push(seat);
  });
  
  // 各列を座席番号順にソート
  Object.keys(seatMap).forEach(row => {
    seatMap[row].sort((a, b) => a.seatNumber - b.seatNumber);
  });
  
  return seatMap;
}

// 座席統計情報生成
function generateSeatStatistics(seats) {
  const stats = {
    total: seats.length,
    available: 0,
    reserved: 0,
    checked_in: 0,
    walkin: 0,
    blocked: 0
  };
  
  seats.forEach(seat => {
    switch (seat.status) {
      case SEAT_CONFIG.seatStatus.AVAILABLE:
        stats.available++;
        break;
      case SEAT_CONFIG.seatStatus.RESERVED:
        stats.reserved++;
        break;
      case SEAT_CONFIG.seatStatus.CHECKED_IN:
        stats.checked_in++;
        break;
      case SEAT_CONFIG.seatStatus.WALKIN:
        stats.walkin++;
        break;
      case SEAT_CONFIG.seatStatus.BLOCKED:
        stats.blocked++;
        break;
    }
  });
  
  return stats;
}

// 座席検索関数
function findSeat(seats, seatId) {
  return seats.find(seat => seat.id === seatId);
}

// 座席更新関数
function updateSeatStatus(seats, seatId, newStatus, additionalData = {}) {
  const seat = findSeat(seats, seatId);
  if (seat) {
    seat.status = newStatus;
    Object.assign(seat, additionalData);
    seat.updatedAt = new Date().toISOString();
  }
  return seat;
}

// 座席一括更新関数
function updateMultipleSeats(seats, updates) {
  const results = [];
  
  updates.forEach(update => {
    const result = updateSeatStatus(seats, update.seatId, update.status, update.data);
    results.push({ seatId: update.seatId, success: !!result, seat: result });
  });
  
  return results;
}

// 座席フィルタリング関数
function filterSeatsByStatus(seats, status) {
  return seats.filter(seat => seat.status === status);
}

// 座席フィルタリング関数（複数ステータス）
function filterSeatsByStatuses(seats, statuses) {
  return seats.filter(seat => statuses.includes(seat.status));
}

// 座席検索関数（部分一致）
function searchSeats(seats, query) {
  const lowerQuery = query.toLowerCase();
  return seats.filter(seat => 
    seat.id.toLowerCase().includes(lowerQuery) ||
    seat.row.toLowerCase().includes(lowerQuery) ||
    seat.seatNumber.toString().includes(query)
  );
}

// 座席の並び替え関数
function sortSeats(seats, sortBy = 'id') {
  return [...seats].sort((a, b) => {
    switch (sortBy) {
      case 'row':
        return a.row.localeCompare(b.row);
      case 'seatNumber':
        return a.seatNumber - b.seatNumber;
      case 'status':
        return a.status.localeCompare(b.status);
      case 'id':
      default:
        return a.id.localeCompare(b.id);
    }
  });
}

// 座席のエクスポート関数
function exportSeats(seats, format = 'json') {
  switch (format) {
    case 'json':
      return JSON.stringify(seats, null, 2);
    case 'csv':
      const headers = ['id', 'row', 'seatNumber', 'status', 'reservedBy', 'reservedAt', 'checkedInAt'];
      const csvRows = [headers.join(',')];
      seats.forEach(seat => {
        const row = headers.map(header => {
          const value = seat[header] || '';
          return `"${value}"`;
        });
        csvRows.push(row.join(','));
      });
      return csvRows.join('\n');
    default:
      return seats;
  }
}

// 設定の検証と初期化
if (typeof window !== 'undefined') {
  // ブラウザ環境での初期化
  window.SeatConfig = SEAT_CONFIG;
  window.SeatUtils = {
    generateSeatId,
    generateAllSeats,
    validateSeatConfig,
    isSeatVisible,
    generateSeatStyle,
    generateSeatMap,
    generateSeatStatistics,
    findSeat,
    updateSeatStatus,
    updateMultipleSeats,
    filterSeatsByStatus,
    filterSeatsByStatuses,
    searchSeats,
    sortSeats,
    exportSeats
  };
  
  // 設定の検証
  validateSeatConfig();
}

// モジュールエクスポート
export {
  SEAT_CONFIG,
  generateSeatId,
  generateAllSeats,
  validateSeatConfig,
  isSeatVisible,
  generateSeatStyle,
  generateSeatMap,
  generateSeatStatistics,
  findSeat,
  updateSeatStatus,
  updateMultipleSeats,
  filterSeatsByStatus,
  filterSeatsByStatuses,
  searchSeats,
  sortSeats,
  exportSeats
};
