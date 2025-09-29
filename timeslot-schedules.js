/**
 * 公演日時設定データ（フロントエンド用）
 * 2日間、各日1公演のスケジュール設定
 */

const TIMESLOT_SCHEDULES = {
  "オーケストラ部": {
    "1": { 
      "A": "10:00-11:00"   // 1日目公演
    },
    "2": { 
      "A": "14:00-15:00"   // 2日目公演
    }
  },
  "吹奏楽部": {
    "1": { 
      "A": "11:00-12:00"   // 1日目公演
    },
    "2": { 
      "A": "15:00-16:00"   // 2日目公演
    }
  },
  "マーチング": {
    "1": { 
      "A": "12:00-13:00"   // 1日目公演
    },
    "2": { 
      "A": "16:00-17:00"   // 2日目公演
    }
  },
  "音楽部": {
    "1": { 
      "A": "13:00-14:00"   // 1日目公演
    },
    "2": { 
      "A": "17:00-18:00"   // 2日目公演
    }
  },
  "演劇部": {
    "1": { 
      "A": "14:00-15:00"   // 1日目公演
    },
    "2": { 
      "A": "18:00-19:00"   // 2日目公演
    }
  },
  "見本演劇": {
    "1": { 
      "A": "15:00-16:00"   // 1日目公演
    },
    "2": { 
      "A": "19:00-20:00"   // 2日目公演
    }
  }
};

function getTimeslotTime(group, day, timeslot) {
  try {
    return TIMESLOT_SCHEDULES[group.toString()][day.toString()][timeslot];
  } catch (e) {
    console.log(`Time not found for ${group}-${day}-${timeslot}`);
    return timeslot;
  }
}

function getTimeslotDisplayName(group, day, timeslot) {
  const time = getTimeslotTime(group, day, timeslot);
  return `${timeslot}時間帯 (${time})`;
}

// ★★★ 修正点 ★★★
// この関数を他のファイルから import できるように、exportキーワードを追加します。
export function getAllTimeslotsForGroup(group) {
  const groupSchedule = TIMESLOT_SCHEDULES[group.toString()];
  if (!groupSchedule) return [];

  const results = [];
  for (const day in groupSchedule) {
    const daySchedule = groupSchedule[day];
    for (const timeslot in daySchedule) {
      const time = daySchedule[timeslot];
      results.push({
        day: day,
        timeslot: timeslot,
        time: time,
        displayName: `${timeslot}時間帯 (${time})`
      });
    }
  }
  return results;
}