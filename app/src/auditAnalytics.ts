import {categoryOf, getGaps, overlapMinutes, type AuditState, type DailyJournal, type Entry, type RatingKey} from './types.ts';

const valid=(value:number|null|undefined):value is number=>typeof value==='number'&&value>=1&&value<=7;
const minutes=(entry:Entry,start:number,end:number)=>overlapMinutes(entry,start,end);
const unionMinutes=(items:Entry[],start:number,end:number)=>Math.max(0,(end-start)/60000-getGaps(items,start,end).reduce((sum,[a,b])=>sum+(b-a)/60000,0));

export function dataQuality(entries:Entry[],start:number,end:number){
  const windowMinutes=Math.max(0,(end-start)/60000);
  const missing=getGaps(entries,start,end).reduce((sum,[a,b])=>sum+(b-a)/60000,0);
  const recorded=Math.max(0,windowMinutes-missing);
  const raw=entries.reduce((sum,e)=>sum+minutes(e,start,end),0);
  const backfill=unionMinutes(entries.filter(e=>e.captureMode==='backfill'),start,end);
  const lowRecall=unionMinutes(entries.filter(e=>e.recallConfidence==='low'),start,end);
  const rated=Object.fromEntries((['importance','urgency','valueAlignment'] as RatingKey[]).map(key=>[key,unionMinutes(entries.filter(e=>valid(e.ratings?.[key])),start,end)])) as Record<RatingKey,number>;
  const feeling=unionMinutes(entries.filter(e=>valid(e.feeling)),start,end);
  const days=new Map<string,{recorded:number;elapsed:number;weekend:boolean}>();
  for(let cursor=new Date(start);cursor.getTime()<end;cursor=new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+1)){
    const a=Math.max(start,new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()).getTime());
    const b=Math.min(end,new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+1).getTime());
    const gap=getGaps(entries,a,b).reduce((sum,[x,y])=>sum+(y-x)/60000,0);
    days.set(`${cursor.getFullYear()}-${cursor.getMonth()+1}-${cursor.getDate()}`,{recorded:Math.max(0,(b-a)/60000-gap),elapsed:(b-a)/60000,weekend:[0,6].includes(cursor.getDay())});
  }
  const weekday=[...days.values()].filter(d=>!d.weekend),weekend=[...days.values()].filter(d=>d.weekend);
  const group=(items:typeof weekday)=>({days:items.length,covered:items.filter(d=>d.recorded>0).length,recorded:items.reduce((s,d)=>s+d.recorded,0),elapsed:items.reduce((s,d)=>s+d.elapsed,0)});
  return {windowMinutes,recorded,missing,overlap:Math.max(0,raw-recorded),coverage:windowMinutes?recorded/windowMinutes:0,backfill,lowRecall,rated,feeling,weekday:group(weekday),weekend:group(weekend)};
}

// Every cell denotes actual minutes in that weekday/hour bucket, with cross-hour
// entries split at boundaries. Timezone follows the viewer's local calendar.
export function weeklyRhythm(entries:Entry[],audit:AuditState,start:number,end:number,category:string){
  const cells=Array.from({length:7},()=>Array<number>(24).fill(0));
  let lastEnd=start;
  for(const entry of [...entries].sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt))){
    if(category!=='all'&&categoryOf(entry.activityId,audit.categoryOverrides)!==category)continue;
    let cursor=Math.max(Date.parse(entry.startAt),start,lastEnd);
    const stop=Math.min(Date.parse(entry.endAt),end);
    lastEnd=Math.max(lastEnd,stop);
    while(cursor<stop){
      const date=new Date(cursor);
      const boundary=new Date(date.getFullYear(),date.getMonth(),date.getDate(),date.getHours()+1).getTime();
      const next=Math.min(stop,boundary);
      cells[(date.getDay()+6)%7][date.getHours()]+=(next-cursor)/60000;
      cursor=next;
    }
  }
  return cells;
}

// A user-defined daily reference window. Both the minutes and day count use
// the union of recorded work intervals, so overlapping entries count once.
export function workOutsideHours(entries:Entry[],audit:AuditState,start:number,end:number,workStart:string,workEnd:string){
  const parse=(value:string)=>{const match=/^(\d{2}):(\d{2})$/.exec(value);return match?Number(match[1])*60+Number(match[2]):NaN;};
  const from=parse(workStart),to=parse(workEnd);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to||to>1440)return {minutes:0,days:0};
  const work=entries.filter(e=>categoryOf(e.activityId,audit.categoryOverrides)==='work');
  let total=0,days=0;
  const first=new Date(start);
  for(let day=new Date(first.getFullYear(),first.getMonth(),first.getDate());day.getTime()<end;day=new Date(day.getFullYear(),day.getMonth(),day.getDate()+1)){
    const dayStart=day.getTime(),dayEnd=new Date(day.getFullYear(),day.getMonth(),day.getDate()+1).getTime();
    const a=Math.max(start,dayStart),b=Math.min(end,dayEnd);
    const insideStart=Math.max(a,new Date(day.getFullYear(),day.getMonth(),day.getDate(),Math.floor(from/60),from%60).getTime());
    const insideEnd=Math.min(b,new Date(day.getFullYear(),day.getMonth(),day.getDate(),Math.floor(to/60),to%60).getTime());
    const outside=unionMinutes(work,a,b)-(insideEnd>insideStart?unionMinutes(work,insideStart,insideEnd):0);
    if(outside>0){total+=outside;days++;}
  }
  return {minutes:total,days};
}

export function feelingByCategory(entries:Entry[],audit:AuditState,start:number,end:number){
  const map=new Map<string,{minutes:number;weighted:number;entries:number}>();
  for(const entry of entries){
    if(!valid(entry.feeling))continue;
    const duration=minutes(entry,start,end);if(!duration)continue;
    const category=categoryOf(entry.activityId,audit.categoryOverrides);
    const item=map.get(category)??{minutes:0,weighted:0,entries:0};
    item.minutes+=duration;item.weighted+=duration*entry.feeling;item.entries++;
    map.set(category,item);
  }
  return [...map].map(([category,item])=>({category,minutes:item.minutes,average:item.weighted/item.minutes,entries:item.entries})).sort((a,b)=>b.minutes-a.minutes);
}

export function moodAssociations(entries:Entry[],journals:DailyJournal[],audit:AuditState,categories:string[]){
  const latest=new Map<string,DailyJournal>();
  for(const journal of journals){const old=latest.get(journal.day);if(!old||journal.updatedAt>old.updatedAt)latest.set(journal.day,journal);}
  const days=[...latest.values()].filter(j=>valid(j.mood)).map(j=>{
    const [year,month,day]=j.day.split('-').map(Number);
    const start=new Date(year,month-1,day).getTime(),end=new Date(year,month-1,day+1).getTime();
    return {mood:j.mood!,start,end,covered:unionMinutes(entries,start,end)/((end-start)/60000)>=.6};
  }).filter(day=>day.covered);
  return categories.map(category=>{
    const withMood:number[]=[],withoutMood:number[]=[];
    for(const day of days){
      const present=entries.some(e=>categoryOf(e.activityId,audit.categoryOverrides)===category&&overlapMinutes(e,day.start,day.end)>0);
      (present?withMood:withoutMood).push(day.mood);
    }
    const avg=(items:number[])=>items.reduce((a,b)=>a+b,0)/items.length;
    return {category,withDays:withMood.length,withoutDays:withoutMood.length,withAverage:withMood.length?avg(withMood):null,withoutAverage:withoutMood.length?avg(withoutMood):null,comparable:withMood.length>=3&&withoutMood.length>=3};
  });
}
