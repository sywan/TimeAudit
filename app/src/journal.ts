import {activeEntries, categoryOf, overlapMinutes, publicEquivalentForCustomName, type AuditState, type DailyJournal, type Entry} from './types.ts';
import {activityLabel, categoryMeta, translate, type Locale} from './i18n.ts';

export function mergeJournalVersions(...groups:DailyJournal[][]):DailyJournal[]{
  const versions=new Map<string,DailyJournal>();
  for(const item of groups.flat()){
    if(!item||typeof item.id!=='string'||typeof item.day!=='string'||typeof item.note!=='string')continue;
    const previous=versions.get(item.id);
    if(!previous||(item.updatedAt??'')>=(previous.updatedAt??''))versions.set(item.id,item);
  }
  return [...versions.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id));
}

export function journalVersionsForDay(journals:DailyJournal[],day:string):DailyJournal[]{
  return journals.filter(item=>item.day===day).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id));
}

const minutesText=(minutes:number,locale:Locale)=>minutes<60
  ?`${Math.round(minutes)} ${locale==='zh-TW'?'分鐘':'min'}`
  :`${(minutes/60).toFixed(1)} ${locale==='zh-TW'?'小時':'h'}`;

// A concise narrative, recalculated from entries. Personal journal text is never embedded here.
export function journalSummary(audit:AuditState,entries:Entry[],locale:Locale,start:number,end:number):string{
  const totals=new Map<string,number>();
  const activities=new Map<string,number>();
  const labels=new Map<string,string>();
  for(const entry of activeEntries(entries)){
    const minutes=overlapMinutes(entry,start,end);
    if(!minutes)continue;
    const category=categoryOf(entry.activityId,audit.categoryOverrides);
    totals.set(category,(totals.get(category)??0)+minutes);
    const personal=(audit.customActivities??[]).find(item=>item.id===entry.activityId);
    const equivalent=personal&&publicEquivalentForCustomName(personal.name);
    const activity=entry.activityId==='other.custom'&&entry.customText?`text:${entry.customText}`
      :equivalent&&category===categoryOf(equivalent,audit.categoryOverrides)?equivalent:entry.activityId;
    activities.set(activity,(activities.get(activity)??0)+minutes);
    labels.set(activity,activity.startsWith('text:')?entry.customText:activityLabel(locale,activity,audit.customActivities));
  }
  const sorted=[...totals].sort((a,b)=>b[1]-a[1]);
  const total=sorted.reduce((sum,[,minutes])=>sum+minutes,0);
  if(!total)return locale==='zh-TW'?'這一天尚無活動紀錄；之後新增時段，這段摘要會自動補上。':'No activities have been recorded for this day yet. This summary will update when you add them.';
  const leading=sorted.slice(0,2).map(([category,minutes])=>`${translate(locale,categoryMeta(category).key)} ${minutesText(minutes,locale)}`);
  const named=[...activities].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id])=>labels.get(id)??'');
  return locale==='zh-TW'
    ?`這一天已記錄 ${minutesText(total,locale)}，時間主要放在${leading.join('、')}。其中包括${named.join('、')}。`
    :`You recorded ${minutesText(total,locale)} this day, mostly in ${leading.join(' and ')}. Activities included ${named.join(', ')}.`;
}
