import type { Entry } from './types';

const CALENDAR_API='https://www.googleapis.com/calendar/v3/calendars/primary/events';

interface GoogleEvent {
  id:string;
  summary?:string;
  status?:string;
  start?:{dateTime?:string;date?:string};
  end?:{dateTime?:string;date?:string};
}

export interface CalendarCandidate {
  eventId:string;
  title:string;
  startAt:string;
  endAt:string;
}

function dayStart(day:string,offset=0):Date {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return new Date(NaN);
  const [year,month,date]=day.split('-').map(Number);
  const result=new Date(year,month-1,date+offset);
  if(offset===0&&(result.getFullYear()!==year||result.getMonth()!==month-1||result.getDate()!==date))return new Date(NaN);
  return result;
}

export async function listCalendarCandidates(firstDay:string,lastDay:string,token:string):Promise<{events:CalendarCandidate[];allDaySkipped:number}> {
  const start=dayStart(firstDay),last=dayStart(lastDay),end=dayStart(lastDay,1);
  const inclusiveDays=(Date.UTC(last.getFullYear(),last.getMonth(),last.getDate())-Date.UTC(start.getFullYear(),start.getMonth(),start.getDate()))/86400000+1;
  if(!Number.isFinite(start.getTime())||!Number.isFinite(last.getTime())||!Number.isFinite(end.getTime())||end<=start||inclusiveDays>31)throw new Error('Choose a range of up to 31 days.');
  const events:CalendarCandidate[]=[];
  let allDaySkipped=0,pageToken='';
  do{
    const params=new URLSearchParams({timeMin:start.toISOString(),timeMax:end.toISOString(),singleEvents:'true',orderBy:'startTime',showDeleted:'false',maxResults:'250',fields:'nextPageToken,items(id,summary,status,start,end)'});
    if(pageToken)params.set('pageToken',pageToken);
    const response=await fetch(`${CALENDAR_API}?${params}`,{headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok)throw new Error(`Google Calendar ${response.status}: ${(await response.text()).slice(0,180)}`);
    const data=await response.json() as {items?:GoogleEvent[];nextPageToken?:string};
    for(const item of data.items??[]){
      if(item.status==='cancelled'||!item.id)continue;
      if(item.start?.date||item.end?.date){allDaySkipped++;continue;}
      const from=Date.parse(item.start?.dateTime??''),to=Date.parse(item.end?.dateTime??'');
      if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)continue;
      events.push({eventId:item.id,title:item.summary?.trim()||'Untitled event',startAt:new Date(from).toISOString(),endAt:new Date(to).toISOString()});
      if(events.length>1000)throw new Error('More than 1,000 events found. Choose a shorter date range.');
    }
    pageToken=data.nextPageToken??'';
  }while(pageToken);
  return {events,allDaySkipped};
}

export function hasCalendarSource(entries:Entry[],eventId:string):boolean {
  return entries.some(entry=>!entry.deletedAt&&entry.source?.provider==='google_calendar'&&entry.source.eventId===eventId&&entry.source.calendarId==='primary');
}

export function overlapsRecorded(entries:Entry[],startAt:string,endAt:string):boolean {
  const from=Date.parse(startAt),to=Date.parse(endAt);
  return entries.some(entry=>!entry.deletedAt&&Math.max(from,Date.parse(entry.startAt))<Math.min(to,Date.parse(entry.endAt)));
}
