/**
 * 公演日時設定データ（フロントエンド用）
 * 2日間、各日1公演のスケジュール設定
 */

const TIMESLOT_SCHEDULES = {
  "オーケストラ部": {
    "1": {
      "10:00": "10:00-11:00"
    },
    "2": {
      "14:00": "14:00-15:00"
    }
  },
  "吹奏楽部": {
    "1": {
      "11:00": "11:00-12:00"
    },
    "2": {
      "15:00": "15:00-16:00"
    }
  },
  "マーチング": {
    "1": {
      "12:00": "12:00-13:00"
    },
    "2": {
      "16:00": "16:00-17:00"
    }
  },
  "音楽部": {
    "1": {
      "13:00": "13:00-14:00"
    },
    "2": {
      "17:00": "17:00-18:00"
    }
  },
  "演劇部": {
    "1": {
      "14:00": "14:00-15:00"
    },
    "2": {
      "18:00": "18:00-19:00"
    }
  },
  "見本演劇": {
    "1": {
      "15:00": "15:00-16:00"
    },
    "2": {
      "19:00": "19:00-20:00"
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
  return time;
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
        displayName: time
      });
    }
  }
  return results;
}