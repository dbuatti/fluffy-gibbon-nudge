import { parseISO, format, subDays } from 'date-fns';

interface ImprovisationDate {
  created_at: string;
}

export function useStreakTracker(data: ImprovisationDate[] | undefined) {
  if (!data || data.length === 0) return { streak: 0, todayActivity: false };

  const activityDates = new Set(
    data.map(item => format(parseISO(item.created_at), 'yyyy-MM-dd'))
  );
  
  let currentStreak = 0;
  const todayString = format(new Date(), 'yyyy-MM-dd');
  
  const todayActivity = activityDates.has(todayString);
  
  let dateToCheck = new Date();
  
  if (todayActivity) {
    currentStreak = 1;
    dateToCheck = subDays(dateToCheck, 1);
  } 
  else if (activityDates.has(format(subDays(dateToCheck, 1), 'yyyy-MM-dd'))) {
    currentStreak = 1;
    dateToCheck = subDays(dateToCheck, 2);
  } else {
    return { streak: 0, todayActivity: false };
  }

  while (true) {
    const dateString = format(dateToCheck, 'yyyy-MM-dd');
    
    if (activityDates.has(dateString)) {
      currentStreak++;
      dateToCheck = subDays(dateToCheck, 1);
    } else {
      break;
    }
  }

  return { streak: currentStreak, todayActivity };
}
