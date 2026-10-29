export function suggestedEntryWindow({requestedStart,availableEnd,now,intervalMinutes,latestEnd}:{
  requestedStart?:Date;availableEnd?:Date;now:Date;intervalMinutes:number;latestEnd?:Date;
}):{start:Date;end:Date}{
  const interval=Math.max(1,intervalMinutes)*60_000;
  if(requestedStart){
    const end=Math.min(requestedStart.getTime()+interval,availableEnd?.getTime()??Infinity,now.getTime());
    return {start:requestedStart,end:new Date(end)};
  }
  const recent=latestEnd?.getTime();
  const start=recent!==undefined&&recent<now.getTime()
    ?Math.max(recent,now.getTime()-interval)
    :now.getTime()-interval;
  return {start:new Date(start),end:now};
}
