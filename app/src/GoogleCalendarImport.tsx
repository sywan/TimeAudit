import {useEffect, useState} from 'react';
import {CalendarDays, X} from 'lucide-react';
import {listCalendarCandidates, hasCalendarSource, overlapsRecorded, type CalendarCandidate} from './calendar';
import {requestCalendarToken} from './google';
import {suggestActivity} from './classify';
import {activityLabel, categories, translate, type Locale} from './i18n';
import {fromLocalInput, toLocalInput, type Entry} from './types';

interface Draft extends CalendarCandidate {selected:boolean;activityId:string;startInput:string;endInput:string;}
const dayText=(day:Date)=>`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
const nextDay=(day:string,offset:number)=>{const [year,month,date]=day.split('-').map(Number);return dayText(new Date(year,month-1,date+offset));};
const blankRatings=()=>({importance:null,urgency:null,valueAlignment:null});
const blankStatus=()=>({importance:'not_applicable' as const,urgency:'not_applicable' as const,valueAlignment:'not_applicable' as const});

export default function GoogleCalendarImport({locale,selectedDay,expectedSub,entries,onClose,onImport}:{locale:Locale;selectedDay:string;expectedSub:string;entries:Entry[];onClose:()=>void;onImport:(items:Entry[])=>void}){
  const [firstDay,setFirstDay]=useState(selectedDay);
  const [lastDay,setLastDay]=useState(nextDay(selectedDay,6));
  const [drafts,setDrafts]=useState<Draft[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [skipped,setSkipped]=useState(0);
  const [duplicates,setDuplicates]=useState(0);
  const say=(zh:string,en:string)=>locale==='zh-TW'?zh:en;
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[onClose]);
  const preview=async()=>{
    setBusy(true);setMessage('');
    try{
      // Google Calendar access is requested only after this explicit click.
      const token=await requestCalendarToken(expectedSub);
      const result=await listCalendarCandidates(firstDay,lastDay,token);
      const available=result.events.filter(event=>!hasCalendarSource(entries,event.eventId));
      setDuplicates(result.events.length-available.length);setSkipped(result.allDaySkipped);
      setDrafts(available.map(event=>({
        ...event,
        selected:!overlapsRecorded(entries,event.startAt,event.endAt),
        activityId:suggestActivity(event.title)?.id??'other.custom',
        startInput:toLocalInput(new Date(event.startAt)),
        endInput:toLocalInput(new Date(event.endAt)),
      })));
    }catch(error){setMessage(error instanceof Error?error.message:String(error));}
    finally{setBusy(false);}
  };
  const update=(eventId:string,patch:Partial<Draft>)=>setDrafts(items=>items.map(item=>item.eventId===eventId?{...item,...patch}:item));
  const importSelected=()=>{
    const selected=drafts.filter(item=>item.selected);
    if(!selected.length)return;
    const now=new Date().toISOString();
    const imported:Entry[]=[];
    for(const draft of selected){
      const start=new Date(draft.startInput),end=new Date(draft.endInput);
      if(!draft.title.trim()||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start){setMessage(say('請檢查所選活動的名稱和時間。','Check the names and times of selected events.'));return;}
      if(overlapsRecorded([...entries,...imported],draft.startInput,draft.endInput)){setMessage(say('所選活動與既有紀錄或另一筆匯入活動重疊。請先調整時間。','A selected event overlaps an existing or another imported entry. Adjust its time first.'));return;}
      imported.push({id:crypto.randomUUID(),startAt:fromLocalInput(draft.startInput),endAt:fromLocalInput(draft.endInput),activityId:draft.activityId,customText:draft.title.trim(),classification:{method:'user',confidence:1},ratings:blankRatings(),ratingStatus:blankStatus(),valueIds:[],goalIds:[],captureMode:'backfill',recallConfidence:'medium',createdAt:now,updatedAt:now,revision:1,deletedAt:null,source:{provider:'google_calendar',calendarId:'primary',eventId:draft.eventId}});
    }
    onImport(imported);
  };
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="entry-modal calendar-import-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-import-title">
    <div className="modal-head"><div><span className="overline">GOOGLE CALENDAR</span><h2 id="calendar-import-title">{say('匯入行事曆活動','Import calendar events')}</h2></div><button className="icon-button" onClick={onClose} aria-label={say('關閉','Close')}><X size={20}/></button></div>
    <div className="modal-body"><p className="hint">{say('唯讀預覽主要行事曆。匯入後會成為 Time Audit 紀錄，可在這裡修改；不會更動 Google Calendar。請只選實際發生的活動。','Read-only preview of your primary calendar. Imported events become editable Time Audit entries; Google Calendar is never changed. Select only activities that actually happened.')}</p>
      <div className="calendar-import-range"><label>{say('開始日期','From')}<input type="date" value={firstDay} onChange={event=>setFirstDay(event.target.value)}/></label><label>{say('結束日期','Through')}<input type="date" value={lastDay} onChange={event=>setLastDay(event.target.value)}/></label><button className="secondary-button" disabled={busy} onClick={()=>void preview()}><CalendarDays size={16}/>{busy?say('讀取中…','Loading…'):say('授權並預覽','Authorize & preview')}</button></div>
      {message&&<p className="calendar-import-message" role="alert">{message}</p>}
      {(drafts.length>0||skipped>0||duplicates>0)&&<p className="hint">{say(`可匯入 ${drafts.length} 筆；略過 ${skipped} 筆全天活動及 ${duplicates} 筆已匯入活動。重疊時段預設不勾選。`,`Available: ${drafts.length}; skipped ${skipped} all-day and ${duplicates} previously imported. Overlaps start unchecked.`)}</p>}
      <div className="calendar-import-list">{drafts.map(draft=>{const overlap=overlapsRecorded(entries,draft.startInput,draft.endInput);return <article key={draft.eventId} className={draft.selected?'selected':''}><label className="calendar-import-check"><input type="checkbox" checked={draft.selected} onChange={event=>update(draft.eventId,{selected:event.target.checked})}/><strong>{draft.title}</strong></label>{overlap&&<small className="calendar-import-warning">{say('與既有紀錄重疊','Overlaps an existing entry')}</small>}<div className="calendar-import-fields"><label>{say('活動名稱','Activity name')}<input value={draft.title} onChange={event=>update(draft.eventId,{title:event.target.value})}/></label><label>{say('分類活動','Activity')}<select value={draft.activityId} onChange={event=>update(draft.eventId,{activityId:event.target.value})}><option value="other.custom">{say('其他／使用活動名稱','Other / use event name')}</option>{categories.map(category=><optgroup key={category.id} label={translate(locale,category.key)}>{category.activities.filter(activity=>activity.id!=='other.custom').map(activity=><option key={activity.id} value={activity.id}>{activityLabel(locale,activity.id)}</option>)}</optgroup>)}</select></label><label>{say('開始','Start')}<input type="datetime-local" value={draft.startInput} onChange={event=>update(draft.eventId,{startInput:event.target.value})}/></label><label>{say('結束','End')}<input type="datetime-local" value={draft.endInput} onChange={event=>update(draft.eventId,{endInput:event.target.value})}/></label></div></article>;})}</div>
    </div><div className="modal-footer"><span>{say('只匯入勾選的活動','Only selected events are imported')}</span><button className="secondary-button" onClick={onClose}>{say('取消','Cancel')}</button><button className="primary-button" disabled={busy||!drafts.some(item=>item.selected)} onClick={importSelected}>{say(`匯入 ${drafts.filter(item=>item.selected).length} 筆`,`Import ${drafts.filter(item=>item.selected).length}`)}</button></div>
  </section></div>;
}
