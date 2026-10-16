export type InsightRange = 'today' | '3d' | '7d' | '30d' | '6m' | '1y';

function monthsEarlier(day:Date,months:number):Date {
  const first=new Date(day.getFullYear(),day.getMonth()-months,1);
  const lastDay=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
  return new Date(first.getFullYear(),first.getMonth(),Math.min(day.getDate(),lastDay));
}

export function insightWindow(range:InsightRange,now:Date):[number,number] {
  const start=range==='today'?new Date(now.getFullYear(),now.getMonth(),now.getDate())
    :range==='3d'?new Date(now.getFullYear(),now.getMonth(),now.getDate()-2)
    :range==='7d'?new Date(now.getFullYear(),now.getMonth(),now.getDate()-6)
    :range==='30d'?new Date(now.getFullYear(),now.getMonth(),now.getDate()-29)
    :monthsEarlier(now,range==='6m'?6:12);
  return [start.getTime(),now.getTime()];
}
