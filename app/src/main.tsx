import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, BarChart3, Bell, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, Cloud, CloudOff, Compass, Download, FileSpreadsheet, Heart, Menu, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { activeEntries, categoryOf, dayBounds, durationMinutes, fromLocalInput, getGaps, initialState, makeDemoState, overlapMinutes, publicEquivalentForCustomName, toLocalInput, withV09CategoryDefaults, type AuditState, type CustomActivity, type Entry, type Profile, type RatingKey } from './types';
import { activityLabel, categories, categoryMeta, translate, type Locale, type TranslationKey } from './i18n';
import { loadProfile, saveProfile } from './storage';
import { googleClientId, mountGoogleButton, requestDriveToken, signOutGoogle } from './google';
import { mergeEntries, syncWithDrive, updateSheetMirror, type SyncConflict } from './drive';
import { factorNames, ipipItems, scoreIpip } from './questionnaire';
import { suggestActivity } from './classify';
import { latestBundlePath } from './update';
import './style.css';

type Page = 'today' | 'calendar' | 'insights' | 'reflection' | 'settings';
interface InstallPromptEvent extends Event { prompt:()=>Promise<void>; userChoice:Promise<{outcome:'accepted'|'dismissed'}>; }
const ratings: RatingKey[] = ['importance','urgency','valueAlignment'];
const ratingLabel: Record<RatingKey,TranslationKey> = {importance:'importance',urgency:'urgency',valueAlignment:'alignment'};
const nowIso = () => new Date().toISOString();
const fmtDate = (value: Date | string, locale: Locale, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale,opts).format(typeof value==='string'?new Date(value):value);
const fmtDuration = (minutes:number, locale:Locale) => minutes<5 ? `${Math.round(minutes)} ${locale==='zh-TW'?'分鐘':'min'}` : `${(minutes/60).toFixed(1)} ${locale==='zh-TW'?'小時':'h'}`;
const shortDate = (day:Date) => `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
const publicPath = (name:string) => `${import.meta.env.BASE_URL}${name}`;
const parseDay = (value:string) => {const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d);};
const translateCategory = (locale:Locale,id:string) => translate(locale,categoryMeta(id).key);
const activityName = (locale:Locale, entry:Entry, audit:AuditState) => entry.activityId==='other.custom' && entry.customText ? entry.customText : activityLabel(locale,entry.activityId,audit.customActivities);
const builtInActivitiesFor = (audit:AuditState) => {
  const personalEquivalents=new Set((audit.customActivities??[]).map(item=>publicEquivalentForCustomName(item.name)).filter(Boolean));
  return categories.flatMap(c=>c.activities).filter(item=>item.id!=='other.custom'&&(!personalEquivalents.has(item.id)||audit.entries.some(entry=>entry.activityId===item.id&&!entry.deletedAt)));
};
const APP_VERSION = '0.96';
const dayOffset = (date: Date, amount: number) => new Date(date.getFullYear(),date.getMonth(),date.getDate()+amount);
const relativeDayLabel = (date: Date, locale: Locale) => {
  const difference = Math.round((dayBounds(date)[0]-dayBounds(new Date())[0])/86_400_000);
  if(difference===0)return locale==='zh-TW'?'今天':'Today';
  if(difference===-1)return locale==='zh-TW'?'昨天':'Yesterday';
  if(difference===1)return locale==='zh-TW'?'明天':'Tomorrow';
  return fmtDate(date,locale,{month:'numeric',day:'numeric'});
};

function download(name:string, content:string, mime:string){
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function App(){
  const [profile,setProfile]=useState<Profile|null>(null);
  const [welcomeLocale,setWelcomeLocale]=useState<Locale>(()=>localStorage.getItem('timeAuditLocale')==='en'?'en':localStorage.getItem('timeAuditLocale')==='zh-TW'?'zh-TW':navigator.language.toLowerCase().startsWith('en')?'en':'zh-TW');
  const [audit,setAudit]=useState<AuditState>(initialState);
  const [loaded,setLoaded]=useState(false);
  const [page,setPage]=useState<Page>('today');
  const [viewDay,setViewDay]=useState(()=>shortDate(new Date()));
  const [calendarDay,setCalendarDay]=useState(()=>shortDate(new Date()));
  const [editor,setEditor]=useState<{entry?:Entry;start?:Date;end?:Date;backfill?:boolean}|null>(null);
  const [token,setToken]=useState<string|null>(null);
  const [syncStatus,setSyncStatus]=useState<'notConnected'|'pending'|'syncing'|'synced'|'syncFailed'>('notConnected');
  const [conflicts,setConflicts]=useState<SyncConflict[]>([]);
  const [toast,setToast]=useState<string>('');
  const [mobileNav,setMobileNav]=useState(false);
  const [fontScale,setFontScale]=useState(()=>Math.max(1,Math.min(1.5,Number(localStorage.getItem('timeAuditFontScale')??1.15)||1.15)));
  const [sidebarWidth,setSidebarWidth]=useState(()=>Math.max(220,Math.min(380,Number(localStorage.getItem('timeAuditSidebarWidth')??260)||260)));
  const [installPrompt,setInstallPrompt]=useState<InstallPromptEvent|null>(null);
  const googleButton=useRef<HTMLDivElement>(null);
  const lastSynced=useRef<string>('');
  const syncLock=useRef(false);
  const locale=audit.preferences.locale;
  const t=useCallback((key:TranslationKey)=>translate(locale,key),[locale]);
  const say=(zh:string,en:string)=>locale==='zh-TW'?zh:en;

  useEffect(()=>{
    if(profile||!googleClientId||!googleButton.current)return;
    mountGoogleButton(googleButton.current,setProfile).catch(()=>setToast('Google sign-in failed to load'));
  },[profile]);
  useEffect(()=>{
    if(!profile)return;
    let cancelled=false;
    setLoaded(false);
    loadProfile(profile.sub).then(saved=>{
      if(cancelled)return;
      const fresh=profile.demo?makeDemoState():initialState();fresh.preferences.locale=welcomeLocale;
      if(!profile.demo&&!saved)fresh.updatedAt='1970-01-01T00:00:00.000Z';
      setAudit(withV09CategoryDefaults(saved??fresh));
      setLoaded(true);
      setSyncStatus(profile.demo?'notConnected':'pending');
    }).catch(()=>{if(!cancelled){const fresh=profile.demo?makeDemoState():initialState();fresh.preferences.locale=welcomeLocale;if(!profile.demo)fresh.updatedAt='1970-01-01T00:00:00.000Z';setAudit(fresh);setLoaded(true);}});
    return()=>{cancelled=true;};
  },[profile?.sub]);
  useEffect(()=>{if(profile&&loaded)saveProfile(profile.sub,audit).catch(()=>setToast('Unable to save on this device'));},[profile?.sub,loaded,audit]);
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),5000);return()=>clearTimeout(id);},[toast]);
  useEffect(()=>{document.documentElement.style.fontSize=`${16*fontScale}px`;localStorage.setItem('timeAuditFontScale',String(fontScale));return()=>{document.documentElement.style.fontSize='';};},[fontScale]);
  useEffect(()=>{localStorage.setItem('timeAuditSidebarWidth',String(sidebarWidth));},[sidebarWidth]);
  useEffect(()=>{const onPrompt=(event:Event)=>{event.preventDefault();setInstallPrompt(event as InstallPromptEvent);};window.addEventListener('beforeinstallprompt',onPrompt);return()=>window.removeEventListener('beforeinstallprompt',onPrompt);},[]);

  const startSidebarResize=(event:React.PointerEvent<HTMLDivElement>)=>{
    event.preventDefault();
    const move=(next:PointerEvent)=>setSidebarWidth(Math.max(220,Math.min(380,next.clientX)));
    const finish=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true});
  };

  const mutate=(fn:(state:AuditState)=>AuditState)=>setAudit(current=>({...fn(current),updatedAt:nowIso()}));
  const changeLocale=(next:Locale)=>{if(next===locale)return;localStorage.setItem('timeAuditLocale',next);setWelcomeLocale(next);mutate(state=>({...state,preferences:{...state.preferences,locale:next}}));};
  const entries=useMemo(()=>activeEntries(audit.entries).sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt)),[audit.entries]);

  const doSync=useCallback(async(currentToken:string,source=audit)=>{
    if(syncLock.current||profile?.demo)return false;
    syncLock.current=true;setSyncStatus('syncing');
    try{
      const result=await syncWithDrive(source,currentToken);
      setConflicts(result.conflicts);
      if(result.conflicts.length){setSyncStatus('syncFailed');setToast(say('有同步衝突，請在設定中選擇版本。','Sync conflict: resolve it in Settings.'));return false;}
      let next=withV09CategoryDefaults(result.state);
      try{
        const sheetId=await updateSheetMirror(next,currentToken,result.folderId);
        if(sheetId!==next.preferences.sheetId)next={...next,preferences:{...next.preferences,sheetId},updatedAt:nowIso()};
      }catch(error){console.warn('Sheet mirror sync',error);setToast(say('日誌已同步，試算表鏡像稍後可重試。','Journal synced; Sheet mirror can be retried.'));}
      lastSynced.current=next.updatedAt;
      setAudit(current=>{
        if(current.updatedAt===source.updatedAt)return next;
        const merged=mergeEntries(current.entries,next.entries);
        return {...current,entries:merged.entries};
      });
      setSyncStatus('synced');
      return true;
    }catch(error){
      setSyncStatus('syncFailed');
      const message=error instanceof Error?error.message:String(error);
      if(/\b401\b/.test(message)){
        setToken(null);
        setToast(say('Google Drive 授權已到期，請點上方「連結 Drive」重新授權。','Google Drive access expired. Use “Connect Drive” above to authorize again.'));
      }else setToast(message);
      return false;
    }
    finally{syncLock.current=false;}
  },[audit,profile?.demo,locale]);

  useEffect(()=>{
    if(!token||!loaded||profile?.demo||syncLock.current||conflicts.length||audit.updatedAt===lastSynced.current)return;
    setSyncStatus('pending');
    const id=setTimeout(()=>doSync(token,audit),1800);
    return()=>clearTimeout(id);
  },[audit,token,loaded,profile?.demo,conflicts.length,doSync]);

  const connectDrive=async()=>{
    try{
      if(!profile||profile.demo)return;
      setSyncStatus('syncing');
      const accessToken=await requestDriveToken(profile.sub);
      setToken(accessToken);
      if(await doSync(accessToken,audit))setToast(say('Drive 授權與同步已完成。','Drive authorization and sync are complete.'));
    }catch(error){setSyncStatus('syncFailed');setToast(error instanceof Error?error.message:String(error));}
  };

  useEffect(()=>{
    if(!profile||!audit.preferences.reminders)return;
    const check=()=>{
      const current=Date.now();
      const time=new Date(current);const hm=`${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;
      const {quietStart,quietEnd,intervalMinutes}=audit.preferences;
      const quiet=quietStart===quietEnd?false:quietStart<quietEnd?hm>=quietStart&&hm<quietEnd:hm>=quietStart||hm<quietEnd;
      if(quiet)return;
      if(entries.some(e=>Date.parse(e.startAt)<=current&&Date.parse(e.endAt)>current))return;
      const latest=entries.filter(e=>Date.parse(e.endAt)<=current).at(-1);
      const base=latest?Date.parse(latest.endAt):current;
      if(current-base<intervalMinutes*60000)return;
      const key=`timeaudit-prompt-${profile.sub}`;
      const last=Number(sessionStorage.getItem(key)??0);
      if(current-last<intervalMinutes*60000)return;
      sessionStorage.setItem(key,String(current));
      setToast(say('剛才的一段時間還沒記錄。','A recent stretch of time is still unrecorded.'));
      if(audit.preferences.notifications&&'Notification' in window&&Notification.permission==='granted')new Notification('Time Audit',{body:say('該記錄剛才的一段時間了。','Time to log the last stretch of time.')});
    };
    const id=setInterval(check,30000);return()=>clearInterval(id);
  },[profile?.sub,audit.preferences,entries,locale]);

  const openNew=(start?:Date,end?:Date,backfill=false)=>{
    const current=new Date();
    const latest=entries.filter(e=>Date.parse(e.endAt)<=Date.now()).at(-1);
    const suggestedEnd=end??current;
    const suggestedStart=start??(latest&&Date.parse(latest.endAt)<current.getTime()?new Date(Math.max(Date.parse(latest.endAt),current.getTime()-audit.preferences.intervalMinutes*60000)):new Date(current.getTime()-audit.preferences.intervalMinutes*60000));
    setEditor({start:suggestedStart,end:suggestedEnd,backfill});
  };
  const saveEntry=(entry:Entry,newActivity?:CustomActivity)=>{mutate(state=>({...state,customActivities:newActivity?[...(state.customActivities??[]),newActivity]:state.customActivities,entries:[...state.entries.filter(e=>e.id!==entry.id),entry]}));setEditor(null);setToast(say('紀錄已儲存','Entry saved'));};
  const deleteEntry=(entry:Entry)=>{mutate(state=>({...state,entries:state.entries.map(e=>e.id===entry.id?{...e,deletedAt:nowIso(),updatedAt:nowIso(),revision:e.revision+1}:e)}));setEditor(null);};
  const resolveConflict=(conflict:SyncConflict,choice:'local'|'remote')=>{
    const winner=choice==='local'?conflict.local:conflict.remote;
    const revised={...winner,revision:Math.max(conflict.local.revision,conflict.remote.revision)+1,updatedAt:nowIso()};
    mutate(state=>({...state,entries:[...state.entries.filter(e=>e.id!==winner.id),revised]}));
    setConflicts(list=>list.filter(c=>c.local.id!==winner.id));
  };
  const navItems:Array<{id:Page;icon:React.ElementType;key:TranslationKey}>=[{id:'today',icon:Clock3,key:'today'},{id:'calendar',icon:CalendarDays,key:'calendar'},{id:'insights',icon:BarChart3,key:'insights'},{id:'reflection',icon:Compass,key:'reflection'},{id:'settings',icon:Settings2,key:'settings'}];

  const openPage=(destination:Page)=>{if(destination==='today')setViewDay(shortDate(new Date()));setPage(destination);setMobileNav(false);};

  if(!profile)return <div className="welcome-screen"><div className="welcome-orbit orbit-a"/><div className="welcome-orbit orbit-b"/><div className="welcome-card"><div className="brand-mark large"><Clock3 size={28}/></div><span className="overline">TIME AUDIT</span><h1>{translate(welcomeLocale,'welcome')}</h1><p>{translate(welcomeLocale,'welcomeText')}</p><div className="welcome-actions">{googleClientId?<div ref={googleButton} className="google-button"/>:<div className="setup-note"><ShieldCheck size={18}/>{translate(welcomeLocale,'googleNotReady')}</div>}<button className="link-button" onClick={()=>setProfile({sub:'demo',name:'Demo',email:'',demo:true})}>{translate(welcomeLocale,'startPreview')} <ArrowRight size={16}/></button></div><div className="welcome-foot"><a href={publicPath('privacy.html')} target="_blank" rel="noreferrer">{welcomeLocale==='zh-TW'?'隱私說明':'Privacy'}</a><span>·</span><a href={publicPath('terms.html')} target="_blank" rel="noreferrer">{welcomeLocale==='zh-TW'?'使用條款':'Terms'}</a><span>·</span><a href={publicPath('copyright.html')} target="_blank" rel="noreferrer">{welcomeLocale==='zh-TW'?'版權聲明':'Copyright'}</a></div></div></div>;
  if(!loaded)return <div className="loading-screen"><div className="brand-mark"><Clock3/></div><p>Time Audit</p></div>;

  return <div className="app-shell" style={{'--sidebar-width':`${sidebarWidth}px`} as React.CSSProperties}>
    <aside className={`sidebar ${mobileNav?'mobile-open':''}`}>
      <div className="sidebar-brand"><div className="brand-mark"><Clock3 size={21}/></div><div><strong>Time Audit <small className="version-inline">v{APP_VERSION}</small></strong><span>{t('tagline')}</span></div></div>
      <nav className="main-nav">{navItems.map(item=><button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>openPage(item.id)}><item.icon size={19}/><span>{item.id==='today'?relativeDayLabel(parseDay(viewDay),locale):t(item.key)}</span>{page===item.id&&<span className="nav-indicator"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-quote"><Sparkles size={18}/><p>{say('時間不是要被填滿，而是用來承載你重視的事。','Time is there to hold what matters, not merely to be filled.')}</p></div><div className="sidebar-profile"><div className="avatar">{profile.picture?<img src={profile.picture} alt=""/>:profile.name.charAt(0)}</div><div><b>{profile.name||'Time Audit'}</b><small>{profile.demo?t('preview'):profile.email}</small></div></div></div>
      <div className="sidebar-resizer" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={say('調整側欄寬度','Resize sidebar')} aria-valuenow={sidebarWidth} aria-valuemin={220} aria-valuemax={380} onPointerDown={startSidebarResize} onKeyDown={event=>{if(event.key==='ArrowRight')setSidebarWidth(v=>Math.min(380,v+12));if(event.key==='ArrowLeft')setSidebarWidth(v=>Math.max(220,v-12));}}/>
    </aside>
    <div className="main-wrap"><header className="topbar"><button className="mobile-menu icon-button" onClick={()=>setMobileNav(v=>!v)} aria-label="Menu"><Menu size={22}/></button><div className="breadcrumb">{page==='today'?relativeDayLabel(parseDay(viewDay),locale):t(navItems.find(n=>n.id===page)?.key??'today')}</div><div className="top-actions"><div className="language-switch" role="group" aria-label={t('language')}><button className={locale==='zh-TW'?'active':''} aria-pressed={locale==='zh-TW'} onClick={()=>changeLocale('zh-TW')}>繁中</button><button className={locale==='en'?'active':''} aria-pressed={locale==='en'} onClick={()=>changeLocale('en')}>EN</button></div>{!profile.demo&&<button className={`top-drive-button ${syncStatus}`} disabled={syncStatus==='syncing'} onClick={()=>{if(token)void doSync(token,audit);else void connectDrive();}} title={token?t('syncNow'):t('connectDrive')} aria-label={token?t('syncNow'):t('connectDrive')}><Cloud size={16}/><span>{syncStatus==='syncing'?t('syncing'):token?t('syncNowShort'):t('connectDriveShort')}</span></button>}<span className={`sync-pill ${syncStatus}`}>{profile.demo?<CloudOff size={14}/>:syncStatus==='synced'?<Cloud size={14}/>:<CloudOff size={14}/>} {profile.demo?t('preview'):t(syncStatus)}</span><button className="icon-button" title={t('reminders')} onClick={()=>setPage('settings')}><Bell size={19}/></button><div className="top-avatar">{profile.name.charAt(0)}</div></div></header>
      <nav className="mobile-nav" aria-label={say('主要導覽','Main navigation')}>{navItems.map(item=><button key={item.id} className={page===item.id?'active':''} aria-current={page===item.id?'page':undefined} onClick={()=>openPage(item.id)}><item.icon size={17}/><span>{item.id==='today'?relativeDayLabel(parseDay(viewDay),locale):t(item.key)}</span></button>)}</nav>
      <main className="content">
        {profile.demo&&<div className="preview-banner"><ShieldCheck size={17}/><span>{t('previewNote')}</span></div>}
        {!profile.demo&&!token&&<div className="preview-banner drive-banner"><CloudOff size={17}/><span>{say('Google Drive 尚未授權。此時新增的紀錄只會暫存在這台裝置；請授權後同步到你的 Drive。','Google Drive is not connected. New entries stay on this device until you authorize and sync.')}</span><button className="secondary-button compact" onClick={connectDrive}>{t('connectDrive')}</button></div>}
        {page==='today'&&<TodayPage audit={audit} entries={entries} locale={locale} selected={viewDay} setSelected={setViewDay} openNew={openNew} edit={entry=>setEditor({entry})} goCalendar={()=>{setCalendarDay(viewDay);setPage('calendar');}}/>}
        {page==='calendar'&&<CalendarPage audit={audit} entries={entries} locale={locale} selected={calendarDay} setSelected={setCalendarDay} openDetail={date=>{setViewDay(date);setPage('today');}} openNew={openNew} edit={entry=>setEditor({entry})}/>}
        {page==='insights'&&<InsightsPage audit={audit} entries={entries} locale={locale}/>}
        {page==='reflection'&&<ReflectionPage audit={audit} entries={entries} locale={locale} mutate={mutate}/>}
        {page==='settings'&&<SettingsPage audit={audit} profile={profile} locale={locale} mutate={mutate} token={token} connectDrive={connectDrive} syncNow={()=>token&&doSync(token,audit)} conflicts={conflicts} resolveConflict={resolveConflict} fontScale={fontScale} setFontScale={setFontScale} sidebarWidth={sidebarWidth} setSidebarWidth={setSidebarWidth} installPrompt={installPrompt} installApp={async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;setInstallPrompt(null);}} signOut={()=>{signOutGoogle();setProfile(null);setToken(null);setLoaded(false);}}/>}
      </main>
    </div>
    {editor&&<EntryEditor key={editor.entry?.id??`${editor.start?.toISOString()}`} initial={editor} audit={audit} entries={entries} values={audit.values} goals={audit.goals} locale={locale} onClose={()=>setEditor(null)} onSave={saveEntry} onDelete={deleteEntry}/>}
    {toast&&<div className="toast" role="status">{toast}<button onClick={()=>setToast('')} aria-label="Close"><X size={14}/></button></div>}
  </div>;
}

function SectionTitle({eyebrow,title,action}:{eyebrow?:string;title:string;action?:React.ReactNode}){return <div className="section-head"><div>{eyebrow&&<span className="overline">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>;}
function EntryRow({entry,audit,locale,start,end,onClick}:{entry:Entry;audit:AuditState;locale:Locale;start?:number;end?:number;onClick:()=>void}){const color=categoryMeta(categoryOf(entry.activityId,audit.categoryOverrides)).color;const shownStart=Math.max(Date.parse(entry.startAt),start??-Infinity),shownEnd=Math.min(Date.parse(entry.endAt),end??Infinity);return <button className="entry-row" onClick={onClick}><span className="entry-dot" style={{background:color}}/><span className="entry-time">{fmtDate(new Date(shownStart),locale,{hour:'2-digit',minute:'2-digit'})}<small>{fmtDate(new Date(shownEnd),locale,{hour:'2-digit',minute:'2-digit'})}</small></span><span className="entry-name"><b>{activityName(locale,entry,audit)}</b>{entry.customText&&entry.activityId!=='other.custom'&&<small>{entry.customText}</small>}</span><span className="entry-duration">{fmtDuration((shownEnd-shownStart)/60000,locale)}</span><ChevronRight size={16}/></button>;}
function categoryTotals(entries:Entry[],start:number,end:number,audit:AuditState){const totals=new Map<string,number>();for(const entry of entries){const mins=overlapMinutes(entry,start,end);if(mins)totals.set(categoryOf(entry.activityId,audit.categoryOverrides),(totals.get(categoryOf(entry.activityId,audit.categoryOverrides))??0)+mins);}return [...totals].sort((a,b)=>b[1]-a[1]);}

function TodayPage({audit,entries,locale,selected,setSelected,openNew,edit,goCalendar}:{audit:AuditState;entries:Entry[];locale:Locale;selected:string;setSelected:(date:string)=>void;openNew:(a?:Date,b?:Date,c?:boolean)=>void;edit:(e:Entry)=>void;goCalendar:()=>void}){
  const t=(key:TranslationKey)=>translate(locale,key);
  const day=parseDay(selected),current=shortDate(new Date()),isToday=selected===current;
  const [start,end]=dayBounds(day),visibleEnd=Math.max(start,Math.min(end,Date.now()));
  const dayEntries=entries.filter(e=>overlapMinutes(e,start,end)>0).sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt));
  const gaps=visibleEnd>start?getGaps(entries,start,visibleEnd):[];
  const missing=gaps.reduce((n,[a,b])=>n+(b-a)/60000,0),elapsed=(visibleEnd-start)/60000;
  const recorded=Math.max(0,elapsed-missing),coverage=elapsed?Math.round(recorded/elapsed*100):0;
  const totals=categoryTotals(dayEntries,start,end,audit),total=totals.reduce((n,[,v])=>n+v,0);
  const gradient=totals.length?`conic-gradient(${totals.reduce((a,[key,value],i)=>{const from=totals.slice(0,i).reduce((s,[,v])=>s+v,0)/total*100;return `${a}${i?',':''}${categoryMeta(key).color} ${from}% ${from+value/total*100}%`;},'')})`:'conic-gradient(#dce7ee 0 100%)';
  const move=(offset:number)=>setSelected(shortDate(dayOffset(day,offset)));
  const startTouch=useRef<{x:number;y:number}|null>(null);
  const onTouchStart=(event:React.TouchEvent)=>{const point=event.changedTouches[0];startTouch.current={x:point.clientX,y:point.clientY};};
  const onTouchEnd=(event:React.TouchEvent)=>{const origin=startTouch.current;startTouch.current=null;if(!origin)return;const point=event.changedTouches[0],dx=point.clientX-origin.x,dy=point.clientY-origin.y;if(Math.abs(dx)>=65&&Math.abs(dx)>Math.abs(dy)*1.3)move(dx<0?1:-1);};
  const firstGap=gaps.find(([a,b])=>b-a>=60000);
  const recordForDay=()=>{if(isToday){openNew();return;}if(firstGap)openNew(new Date(firstGap[0]),new Date(Math.min(firstGap[1],firstGap[0]+audit.preferences.intervalMinutes*60000)),true);};
  const heading=isToday?t('todayOverview'):locale==='zh-TW'?`${fmtDate(day,locale,{month:'long',day:'numeric'})}的時間`:`${fmtDate(day,locale,{month:'long',day:'numeric'})} at a glance`;
  return <div className="day-dashboard" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
    <div className="day-switcher" aria-label={locale==='zh-TW'?'切換日期':'Switch date'}><button className="icon-button" onClick={()=>move(-1)} aria-label={locale==='zh-TW'?'前一天':'Previous day'}><ArrowLeft size={19}/></button><strong>{relativeDayLabel(day,locale)} · {fmtDate(day,locale,{year:'numeric',month:'long',day:'numeric'})}</strong><button className="icon-button" onClick={()=>move(1)} aria-label={locale==='zh-TW'?'後一天':'Next day'}><ArrowRight size={19}/></button>{!isToday&&<button className="text-button" onClick={()=>setSelected(current)}>{t('today')}</button>}</div>
    <div className="hero"><div><span className="overline">{fmtDate(day,locale,{weekday:'long',month:'long',day:'numeric'})}</span><h1>{heading}</h1><p>{locale==='zh-TW'?'用每一段真實的時間，慢慢看見自己的選擇。':'Each real stretch of time helps you see your choices more clearly.'}</p><div className="hero-actions">{(isToday||firstGap)&&<button className="primary-button" onClick={recordForDay}><Plus size={18}/>{isToday?t('quickRecord'):t('backfill')}</button>}<button className="secondary-button" onClick={goCalendar}><CalendarDays size={17}/>{t('viewCalendar')}</button></div></div><div className="hero-art"><div className="hero-clock"><Clock3 size={72} strokeWidth={1.2}/></div><span className="art-orbit orbit-one"/><span className="art-orbit orbit-two"/></div></div>
    <div className="stat-grid"><div className="stat-card"><span>{t('recorded')}</span><strong>{fmtDuration(recorded,locale)}</strong><small>{coverage}% {t('coverage')}</small></div><div className="stat-card"><span>{t('unknown')}</span><strong>{fmtDuration(missing,locale)}</strong><small>{locale==='zh-TW'?'可從日曆補登':'Backfill from the calendar'}</small></div><div className="stat-card"><span>{locale==='zh-TW'?'紀錄筆數':'Entries'}</span><strong>{dayEntries.length}</strong><small>{locale==='zh-TW'?'以時長統計分析':'Insights use duration'}</small></div></div>
    <div className="dashboard-grid"><section className="card timeline-card"><SectionTitle eyebrow="TIMELINE" title={locale==='zh-TW'?`${relativeDayLabel(day,locale)}的軌跡`:`${relativeDayLabel(day,locale)}’s timeline`} action={<button className="text-button" onClick={goCalendar}>{locale==='zh-TW'?'完整時間軸':'Full timeline'} <ArrowRight size={15}/></button>}/>{dayEntries.length?dayEntries.map(e=><EntryRow key={e.id} entry={e} audit={audit} locale={locale} start={start} end={end} onClick={()=>edit(e)}/>):<div className="empty-state"><Clock3 size={32}/><p>{selected>current?(locale==='zh-TW'?'這一天尚未到來。':'This day has not begun yet.'):(locale==='zh-TW'?'這一天還沒有紀錄。':'No entries for this day yet.')}</p>{(isToday||firstGap)&&<button className="secondary-button" onClick={recordForDay}>{isToday?t('record'):t('backfill')}</button>}</div>}</section><section className="card flow-card"><SectionTitle eyebrow="TIME FLOW" title={t('totalByCategory')}/><div className="flow-visual"><div className="donut" style={{background:gradient}}><div><strong>{fmtDuration(total,locale)}</strong><small>{t('recorded')}</small></div></div></div><div className="flow-legend">{totals.slice(0,5).map(([key,value])=><div key={key}><span className="legend-name"><i style={{background:categoryMeta(key).color}}/>{translateCategory(locale,key)}</span><b>{fmtDuration(value,locale)}</b></div>)}</div></section></div>
    {gaps.length>0&&<section className="card gap-card"><SectionTitle eyebrow="UNRECORDED" title={locale==='zh-TW'?'可以補上的空白':'Unrecorded time'} action={<button className="text-button" onClick={goCalendar}>{t('viewCalendar')} <ArrowRight size={15}/></button>}/><div className="gap-list">{gaps.filter(([a,b])=>b-a>=5*60000).slice(-4).reverse().map(([a,b])=><button key={a} onClick={()=>openNew(new Date(a),new Date(b),true)}><Plus size={16}/>{fmtDate(new Date(a),locale,{hour:'2-digit',minute:'2-digit'})} — {fmtDate(new Date(b),locale,{hour:'2-digit',minute:'2-digit'})}<span>{t('backfill')}</span></button>)}</div></section>}
  </div>;
}

function CalendarPage({audit,entries,locale,selected,setSelected,openDetail,openNew,edit}:{audit:AuditState;entries:Entry[];locale:Locale;selected:string;setSelected:(date:string)=>void;openDetail:(date:string)=>void;openNew:(a?:Date,b?:Date,c?:boolean)=>void;edit:(e:Entry)=>void}){
  const [month,setMonth]=useState(()=>{const date=parseDay(selected);return new Date(date.getFullYear(),date.getMonth(),1);});const lastTap=useRef<{date:string;at:number}|null>(null);const pickDay=(date:string)=>{const now=Date.now();if(lastTap.current?.date===date&&now-lastTap.current.at<420){lastTap.current=null;openDetail(date);return;}lastTap.current={date,at:now};setSelected(date);};const day=parseDay(selected);const [dayStart,dayEnd]=dayBounds(day);const pastEnd=Math.min(dayEnd,Date.now());const dayEntries=entries.filter(e=>overlapMinutes(e,dayStart,dayEnd)>0).sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt));const gaps=pastEnd>dayStart?getGaps(entries,dayStart,pastEnd).filter(([a,b])=>b-a>=60000):[];
  const firstWeekday=(new Date(month.getFullYear(),month.getMonth(),1).getDay()+6)%7;const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();const cells=Array.from({length:firstWeekday+days},(_,i)=>i-firstWeekday+1);
  const weekday=locale==='zh-TW'?['一','二','三','四','五','六','日']:['M','T','W','T','F','S','S'];
  const timeline:Array<{start:number;end:number;entry?:Entry}>=[];for(const e of dayEntries)timeline.push({start:Math.max(dayStart,Date.parse(e.startAt)),end:Math.min(dayEnd,Date.parse(e.endAt)),entry:e});for(const [a,b] of gaps)timeline.push({start:a,end:b});timeline.sort((a,b)=>a.start-b.start);
  return <><SectionTitle eyebrow="CALENDAR" title={translate(locale,'monthOverview')} action={<button className="primary-button compact" onClick={()=>openNew()}><Plus size={17}/>{translate(locale,'record')}</button>}/><div className="calendar-layout"><section className="card month-card"><div className="month-nav"><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ArrowLeft size={19}/></button><h3>{fmtDate(month,locale,{year:'numeric',month:'long'})}</h3><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ArrowRight size={19}/></button></div><div className="calendar-grid">{weekday.map((label,i)=><div className="weekday" key={i}>{label}</div>)}{cells.map((d,i)=>{if(d<1)return <div key={`blank${i}`}/>;const current=new Date(month.getFullYear(),month.getMonth(),d);const [a,b]=dayBounds(current);const elapsed=Math.max(0,Math.min(Date.now(),b)-a);const gap=elapsed>0?getGaps(entries,a,Math.min(Date.now(),b)).reduce((sum,[x,y])=>sum+y-x,0):0;const coverage=elapsed?Math.max(0,Math.min(1,(elapsed-gap)/elapsed)):0;const id=shortDate(current);return <button key={id} className={`calendar-day ${id===selected?'selected':''} ${id===shortDate(new Date())?'current':''}`} onClick={()=>pickDay(id)} title={locale==='zh-TW'?'點兩下查看詳細':'Double-tap for details'}><span>{d}</span><i style={{width:`${Math.max(coverage*100,coverage?8:0)}%`}}/><small>{coverage?`${Math.round(coverage*100)}%`:''}</small></button>;})}</div><div className="calendar-legend"><span><i className="legend-recorded"/>{translate(locale,'recorded')}</span><span><i className="legend-empty"/>{translate(locale,'unknown')}</span></div></section><section className="card day-card"><SectionTitle eyebrow={fmtDate(day,locale,{weekday:'long',month:'long',day:'numeric'})} title={translate(locale,'dayTimeline')} action={<button className="secondary-button compact" onClick={()=>openDetail(selected)}>{locale==='zh-TW'?'查看詳細':'Detailed view'} <ArrowRight size={15}/></button>}/>{timeline.length? <div className="day-timeline">{timeline.map((slot,i)=>{const left=fmtDate(new Date(slot.start),locale,{hour:'2-digit',minute:'2-digit'}),right=fmtDate(new Date(slot.end),locale,{hour:'2-digit',minute:'2-digit'});return <button key={`${slot.start}-${i}`} className={`timeline-slot ${slot.entry?'filled':'empty'}`} style={{borderLeftColor:slot.entry?categoryMeta(categoryOf(slot.entry.activityId,audit.categoryOverrides)).color:'#ccdce9'}} onClick={()=>slot.entry?edit(slot.entry):openNew(new Date(slot.start),new Date(slot.end),true)}><span>{left}<small>{right}</small></span><b>{slot.entry?activityName(locale,slot.entry,audit):translate(locale,'emptySlot')}</b><em>{fmtDuration((slot.end-slot.start)/60000,locale)}</em>{!slot.entry&&<Plus size={15}/>}</button>;})}</div>:<div className="empty-state"><CalendarDays size={30}/><p>{selected>shortDate(new Date())?(locale==='zh-TW'?'未來日期':'Future day'):translate(locale,'noData')}</p></div>}</section></div></>;
}

function InsightsPage({audit,entries,locale}:{audit:AuditState;entries:Entry[];locale:Locale}){
  const [range,setRange]=useState<1|7|30>(7);const now=new Date();const start=range===1?dayBounds(now)[0]:new Date(now.getFullYear(),now.getMonth(),now.getDate()-range+1).getTime();const end=Date.now();const included=entries.filter(e=>overlapMinutes(e,start,end)>0);const totals=categoryTotals(included,start,end,audit);const total=totals.reduce((n,[,v])=>n+v,0);const max=Math.max(...totals.map(x=>x[1]),1);
  const gaps=getGaps(entries,start,end);const missing=gaps.reduce((n,[a,b])=>n+(b-a)/60000,0);const elapsed=(end-start)/60000;const coverage=elapsed?Math.round((elapsed-missing)/elapsed*100):0;
  const t=(key:TranslationKey)=>translate(locale,key);
  const quadrants=[{id:'important-urgent',test:(e:Entry)=>(e.ratings.importance??0)>=5&&(e.ratings.urgency??0)>=5,zh:'重要且急迫',en:'Important & urgent'},{id:'important-calm',test:(e:Entry)=>(e.ratings.importance??0)>=5&&(e.ratings.urgency??8)<=3,zh:'重要但不急',en:'Important, not urgent'},{id:'less-urgent',test:(e:Entry)=>(e.ratings.importance??8)<=3&&(e.ratings.urgency??0)>=5,zh:'較不重要但急迫',en:'Less important, urgent'},{id:'less-calm',test:(e:Entry)=>(e.ratings.importance??8)<=3&&(e.ratings.urgency??8)<=3,zh:'較不重要且不急',en:'Less important, not urgent'}].map(q=>({...q,minutes:included.filter(q.test).reduce((n,e)=>n+overlapMinutes(e,start,end),0)}));
  const goalTimes=audit.goals.map(goal=>({goal,minutes:included.filter(e=>e.goalIds.includes(goal.id)).reduce((n,e)=>n+overlapMinutes(e,start,end),0)}));
  return <><SectionTitle eyebrow="INSIGHTS" title={locale==='zh-TW'?'看見時間的分配':'See your time allocation'} action={<div className="segmented">{([1,7,30] as const).map(n=><button key={n} className={range===n?'active':''} onClick={()=>setRange(n)}>{n===1?t('todayOnly'):n===7?t('sevenDays'):t('thirtyDays')}</button>)}</div>}/><div className="stat-grid"><div className="stat-card"><span>{t('recorded')}</span><strong>{fmtDuration(total,locale)}</strong><small>{included.length} {locale==='zh-TW'?'筆紀錄':'entries'}</small></div><div className="stat-card"><span>{t('coverage')}</span><strong>{coverage}%</strong><small>{locale==='zh-TW'?'已過時間的紀錄比例':'Of elapsed time'}</small></div><div className="stat-card"><span>{t('unknown')}</span><strong>{fmtDuration(missing,locale)}</strong><small>{locale==='zh-TW'?'未納入活動分析':'Excluded from activity analysis'}</small></div></div><div className="insight-layout"><section className="card"><SectionTitle eyebrow="ALLOCATION" title={t('totalByCategory')}/>{totals.length?<div className="bar-list">{totals.map(([category,minutes])=><div className="bar-row" key={category}><div><span>{translateCategory(locale,category)}</span><b>{fmtDuration(minutes,locale)} <small>{Math.round(minutes/total*100)}%</small></b></div><div className="bar-track"><i style={{width:`${minutes/max*100}%`,background:categoryMeta(category).color}}/></div></div>)}</div>:<div className="empty-state"><BarChart3 size={30}/>{t('noData')}</div>}</section><section className="card"><SectionTitle eyebrow="RATINGS" title={t('valueChart')}/><div className="rating-charts">{ratings.map(key=>{const buckets=Array.from({length:7},(_,i)=>included.reduce((sum,e)=>sum+(e.ratings[key]===i+1?overlapMinutes(e,start,end):0),0));const rated=buckets.reduce((a,b)=>a+b,0),unrated=total-rated,peak=Math.max(...buckets,1);return <div className="rating-chart" key={key}><div className="rating-chart-head"><b>{t(ratingLabel[key])}</b><small>{fmtDuration(rated,locale)} {t('reportedMinutes')} · {fmtDuration(unrated,locale)} {t('unratedMinutes')}</small></div><div className="rating-bars">{buckets.map((minutes,i)=><div key={i} title={`${i+1}: ${fmtDuration(minutes,locale)}`}><i style={{height:`${Math.max(minutes/peak*100,minutes?4:0)}%`}}/><span>{i+1}</span></div>)}</div></div>})}</div></section></div><div className="insight-layout extra-insights"><section className="card"><SectionTitle eyebrow="DECISIONS" title={locale==='zh-TW'?'重要 × 急迫':'Importance × urgency'}/><div className="quadrant-grid">{quadrants.map(q=><div key={q.id}><span>{locale==='zh-TW'?q.zh:q.en}</span><strong>{fmtDuration(q.minutes,locale)}</strong></div>)}</div><p className="hint">{locale==='zh-TW'?'只統計兩題都有評分且屬於 1–3 或 5–7 的時段；中間值與未評另外保留。':'Includes time with both ratings in 1–3 or 5–7; middle and unrated time stay outside the quadrants.'}</p></section><section className="card"><SectionTitle eyebrow="GOALS" title={locale==='zh-TW'?'目標投入':'Time linked to goals'}/>{goalTimes.length?<div className="bar-list">{goalTimes.map(({goal,minutes})=><div className="bar-row" key={goal.id}><div><span>{goal.text}</span><b>{fmtDuration(minutes,locale)}</b></div><div className="bar-track"><i style={{width:`${total?minutes/total*100:0}%`}}/></div></div>)}</div>:<div className="empty-state"><Compass size={28}/>{locale==='zh-TW'?'可先在設定中加入目標，記錄時再關聯。':'Add goals in Settings, then link them to entries.'}</div>}<p className="hint">{locale==='zh-TW'?'未關聯目標的時間不等於沒有價值。':'Time without a linked goal is not necessarily less valuable.'}</p></section></div><p className="method-note">{locale==='zh-TW'?'所有比例與分數分布均按實際分鐘數計算；空白時段與未評分數分開顯示。':'All proportions and ratings are weighted by actual minutes; unrecorded and unrated time are shown separately.'}</p></>;
}

function ReflectionPage({audit,entries,locale,mutate}:{audit:AuditState;entries:Entry[];locale:Locale;mutate:(fn:(s:AuditState)=>AuditState)=>void}){
  const [draft,setDraft]=useState('');const t=(key:TranslationKey)=>translate(locale,key);const lookback=Date.now()-30*86400000;const recent=entries.filter(e=>Date.parse(e.endAt)>=lookback);const urgent=recent.filter(e=>(e.ratings.urgency??0)>=5&&(e.ratings.importance??8)<=3);const low=recent.filter(e=>(e.ratings.valueAlignment??8)<=3);const mins=(list:Entry[])=>list.reduce((sum,e)=>sum+durationMinutes(e),0);
  const items=[{title:t('highUrgency'),list:urgent,question:t('highUrgencyQuestion'),icon:Bell},{title:t('lowAlignment'),list:low,question:t('lowAlignmentQuestion'),icon:Heart}];
  const experiments=audit.experiments??[];
  return <><SectionTitle eyebrow="REFLECTION" title={t('reflectTitle')}/><p className="page-lead">{t('reflectLead')}</p><div className="reflection-grid">{items.map(item=><section className="card reflection-card" key={item.title}><div className="reflection-icon"><item.icon size={21}/></div><h3>{item.title}</h3><strong>{fmtDuration(mins(item.list),locale)}</strong><small>{locale==='zh-TW'?'最近 30 天 · 按時長':'Last 30 days · by duration'}</small><p>{item.question}</p>{item.list.length>0&&<div className="evidence-list">{item.list.slice(0,4).map(e=><div key={e.id}><span>{activityName(locale,e,audit)}</span><b>{fmtDuration(durationMinutes(e),locale)}</b></div>)}</div>}</section>)}</div><section className="card experiment-card"><SectionTitle eyebrow="NEXT STEP" title={t('experiment')}/><p>{locale==='zh-TW'?'先選一個可試一週的小改變，之後再回來對照紀錄。':'Choose a small change to try for a week, then compare your records.'}</p><div className="experiment-input"><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder={t('experimentPlaceholder')} maxLength={300}/><button className="primary-button" disabled={!draft.trim()} onClick={()=>{mutate(s=>({...s,experiments:[...(s.experiments??[]),{id:crypto.randomUUID(),text:draft.trim(),createdAt:nowIso()}]}));setDraft('');}}>{t('saveExperiment')}</button></div>{experiments.length>0&&<div className="experiment-list">{experiments.slice().reverse().map(e=><div key={e.id}><Check size={16}/><span>{e.text}</span><small>{fmtDate(e.createdAt,locale,{month:'numeric',day:'numeric'})}</small></div>)}</div>}</section><p className="method-note">{locale==='zh-TW'?'這些提示只描述紀錄中的型態，不能推定討好、完美主義或任何臨床狀態。':'These prompts describe patterns in records. They cannot infer people pleasing, perfectionism, or clinical conditions.'}</p></>;
}

function SettingsPage({audit,profile,locale,mutate,token,connectDrive,syncNow,conflicts,resolveConflict,fontScale,setFontScale,sidebarWidth,setSidebarWidth,installPrompt,installApp,signOut}:{audit:AuditState;profile:Profile;locale:Locale;mutate:(fn:(s:AuditState)=>AuditState)=>void;token:string|null;connectDrive:()=>void;syncNow:()=>void;conflicts:SyncConflict[];resolveConflict:(c:SyncConflict,choice:'local'|'remote')=>void;fontScale:number;setFontScale:React.Dispatch<React.SetStateAction<number>>;sidebarWidth:number;setSidebarWidth:React.Dispatch<React.SetStateAction<number>>;installPrompt:InstallPromptEvent|null;installApp:()=>void;signOut:()=>void}){
  const [valueDraft,setValueDraft]=useState(''),[goalDraft,setGoalDraft]=useState(''),[showQuestionnaire,setShowQuestionnaire]=useState(false),[answers,setAnswers]=useState<Record<string,number>>({});const fileInput=useRef<HTMLInputElement>(null);const t=(key:TranslationKey)=>translate(locale,key);
  const [updateStatus,setUpdateStatus]=useState<'idle'|'checking'|'latest'|'error'>('idle');
  const checkAndUpdate=async()=>{
    setUpdateStatus('checking');
    try{
      const published=await latestBundlePath(import.meta.env.BASE_URL);
      const current=document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
      if(current&&new URL(current,location.href).pathname===published){setUpdateStatus('latest');return;}
      // IndexedDB is the offline journal cache. Finish its write before leaving this page.
      await saveProfile(profile.sub,audit);
      if('serviceWorker' in navigator){try{const registration=await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);await registration?.update();}catch(error){console.warn('Service worker update',error);}}
      const destination=new URL(location.href);
      destination.searchParams.set('time-audit-updated',String(Date.now()));
      location.replace(destination.href);
    }catch(error){console.warn('Update check',error);setUpdateStatus('error');}
  };
  const setPref=<K extends keyof AuditState['preferences']>(key:K,value:AuditState['preferences'][K])=>mutate(s=>({...s,preferences:{...s.preferences,[key]:value}}));
  const addCompass=(kind:'values'|'goals',text:string)=>{if(!text.trim())return;mutate(s=>({...s,[kind]:[...s[kind],{id:crypto.randomUUID(),text:text.trim()}]}));kind==='values'?setValueDraft(''):setGoalDraft('');};
  const exportCsv=()=>{const head=['id','startAt','endAt','durationMinutes','activityId','description','importance','urgency','valueAlignment','captureMode','recallConfidence'];const esc=(x:unknown)=>`"${String(x??'').replaceAll('"','""')}"`;const rows=activeEntries(audit.entries).map(e=>[e.id,e.startAt,e.endAt,durationMinutes(e),e.activityId,e.customText,e.ratings.importance,e.ratings.urgency,e.ratings.valueAlignment,e.captureMode,e.recallConfidence].map(esc).join(','));download(`time-audit-${shortDate(new Date())}.csv`,[head.join(','),...rows].join('\n'),'text/csv;charset=utf-8');};
  const importJson=async(file:File)=>{try{const value=JSON.parse(await file.text()) as Partial<AuditState>;if(!Array.isArray(value.entries)||!value.entries.every(e=>typeof e.id==='string'&&typeof e.startAt==='string'&&typeof e.endAt==='string'))throw new Error('Invalid Time Audit file');mutate(s=>({...s,entries:[...new Map([...s.entries,...value.entries!].map(e=>[e.id,e])).values()],customActivities:[...new Map([...(s.customActivities??[]),...(value.customActivities??[])].map(a=>[a.id,a])).values()],categoryOverrides:{...(s.categoryOverrides??{}),...(value.categoryOverrides??{})}}));}catch(e){alert(e instanceof Error?e.message:String(e));}};
  const saved=audit.questionnaires.find(q=>q.instrument==='IPIP-50'&&q.completedAt);const scores=saved?scoreIpip(saved.responses):null;const completed=Object.keys(answers).length;
  return <><SectionTitle eyebrow="PREFERENCES" title={t('settings')}/><div className="settings-grid"><section className="card settings-card"><SectionTitle eyebrow="COMPASS" title={t('valuesGoals')}/>{(['values','goals'] as const).map(kind=><div className="setting-group" key={kind}><h3>{t(kind)}</h3><div className="tag-list">{audit[kind].map(item=><span className="tag" key={item.id}>{item.text}<button aria-label="Remove" onClick={()=>mutate(s=>({...s,[kind]:s[kind].filter(x=>x.id!==item.id)}))}><X size={13}/></button></span>)}</div><div className="inline-add"><input value={kind==='values'?valueDraft:goalDraft} onChange={e=>kind==='values'?setValueDraft(e.target.value):setGoalDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCompass(kind,kind==='values'?valueDraft:goalDraft);}} placeholder={t(kind==='values'?'addValue':'addGoal')}/><button className="icon-button" onClick={()=>addCompass(kind,kind==='values'?valueDraft:goalDraft)}><Plus size={18}/></button></div></div>)}</section>
  <section className="card settings-card"><SectionTitle eyebrow="DISPLAY" title={locale==='zh-TW'?'顯示與字體':'Display & text'}/><label className="appearance-row"><span>{locale==='zh-TW'?'字體大小':'Text size'} <strong>{Math.round(fontScale*100)}%</strong></span><input type="range" min="1" max="1.5" step="0.05" value={fontScale} onChange={e=>setFontScale(Number(e.target.value))}/></label><label className="appearance-row desktop-only"><span>{locale==='zh-TW'?'側欄寬度':'Sidebar width'} <strong>{sidebarWidth}px</strong></span><input type="range" min="220" max="380" step="10" value={sidebarWidth} onChange={e=>setSidebarWidth(Number(e.target.value))}/></label><p className="hint">{locale==='zh-TW'?'在電腦上也可以拖動側欄邊緣。顯示設定會保存在這台裝置。':'On desktop, drag the sidebar edge to resize it. Display settings are saved on this device.'}</p></section>
  <section className="card settings-card"><SectionTitle eyebrow="INSTALL" title={locale==='zh-TW'?'安裝在裝置上':'Install on your device'}/><p className="hint">{locale==='zh-TW'?'安裝後可從主畫面開啟。同步資料仍需網路與 Google Drive 授權。':'Open from your home screen after installing. Sync still needs a network connection and Google Drive authorization.'}</p>{installPrompt&&<button className="primary-button" onClick={installApp}>{locale==='zh-TW'?'安裝 Time Audit':'Install Time Audit'}</button>}<p className="hint">{locale==='zh-TW'?'若沒有顯示安裝按鈕：在 iPhone Safari 點「分享」→「加入主畫面」；在電腦瀏覽器使用網址列或選單的「安裝」。':'If no install button appears: on iPhone Safari, tap Share → Add to Home Screen; on desktop, use the install option in your browser menu or address bar.'}</p></section>
  <section className="card settings-card"><SectionTitle eyebrow="REMINDERS" title={t('reminders')}/><label className="setting-line"><span>{t('reminders')}</span><input type="checkbox" checked={audit.preferences.reminders} onChange={e=>setPref('reminders',e.target.checked)}/></label><label className="setting-line"><span>{t('reminderInterval')}</span><select value={audit.preferences.intervalMinutes} onChange={e=>setPref('intervalMinutes',Number(e.target.value))}>{[15,20,30,45,60,90,120].map(n=><option key={n} value={n}>{n} {t('minutes')}</option>)}</select></label><div className="setting-line"><span>{t('quietHours')}</span><div className="time-pair"><input type="time" value={audit.preferences.quietStart} onChange={e=>setPref('quietStart',e.target.value)}/><span>–</span><input type="time" value={audit.preferences.quietEnd} onChange={e=>setPref('quietEnd',e.target.value)}/></div></div><label className="setting-line"><span>{t('notifyPermission')}</span><input type="checkbox" checked={audit.preferences.notifications} onChange={async e=>{if(e.target.checked){if(!('Notification' in window)){alert('Notifications are unavailable');return;}const permission=await Notification.requestPermission();setPref('notifications',permission==='granted');}else setPref('notifications',false);}}/></label><p className="hint">{t('notificationHint')}</p></section>
  <section className="card settings-card"><SectionTitle eyebrow="OWNERSHIP" title={t('sync')}/><p className="hint">{profile.demo?t('previewNote'):t('privacy')}</p>{!profile.demo&&<div className="button-stack">{!token?<button className="primary-button" onClick={connectDrive}><Cloud size={17}/>{t('connectDrive')}</button>:<button className="secondary-button" onClick={syncNow}><Cloud size={17}/>{t('syncNow')}</button>}{audit.preferences.sheetId&&<a className="secondary-button" href={`https://docs.google.com/spreadsheets/d/${audit.preferences.sheetId}/edit`} target="_blank" rel="noreferrer"><FileSpreadsheet size={17}/>{t('openSheet')}</a>}</div>}{conflicts.length>0&&<div className="conflict-box"><h4>{locale==='zh-TW'?'同步衝突':'Sync conflicts'}</h4>{conflicts.map(c=><div key={c.local.id}><span>{activityName(locale,c.local,audit)} · {fmtDate(c.local.startAt,locale,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span><button onClick={()=>resolveConflict(c,'local')}>{locale==='zh-TW'?'使用本機':'Use local'}</button><button onClick={()=>resolveConflict(c,'remote')}>{locale==='zh-TW'?'使用雲端':'Use remote'}</button></div>)}</div>}<div className="button-stack"><button className="secondary-button" onClick={()=>download(`time-audit-${shortDate(new Date())}.json`,JSON.stringify(audit,null,2),'application/json')}><Download size={16}/>{t('exportJson')}</button><button className="secondary-button" onClick={exportCsv}><Download size={16}/>{t('exportCsv')}</button><button className="secondary-button" onClick={()=>fileInput.current?.click()}>{t('importJson')}</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void importJson(file);e.target.value='';}}/></div></section>
  <section className="card settings-card"><SectionTitle eyebrow="ACCOUNT" title={t('account')}/><div className="account-info"><div className="avatar">{profile.name.charAt(0)}</div><div><strong>{profile.name}</strong><small>{profile.email||t('preview')}</small></div></div><button className="text-button signout" onClick={signOut}>{t('signOut')} <ArrowRight size={15}/></button></section>
  <section className="card settings-card"><SectionTitle eyebrow="VERSION" title={`Time Audit v${APP_VERSION}`}/><p className="hint">{locale==='zh-TW'?'0.96：修正「今天」詳細頁的滑動方向：向左滑看下一天，向右滑看前一天；保留 0.95 的版權聲明與同步指引。':'0.96: Corrected the daily dashboard swipe direction: swipe left for the next day and right for the previous day. The 0.95 copyright notice and sync guide remain available.'}</p><div className="button-stack"><button className="secondary-button" disabled={updateStatus==='checking'} onClick={()=>void checkAndUpdate()}><RefreshCw size={16}/>{locale==='zh-TW'?'檢查並更新':'Check for updates'}</button></div><p className="hint" role="status">{updateStatus==='checking'?(locale==='zh-TW'?'正在檢查公開網站…':'Checking the published site…'):updateStatus==='latest'?(locale==='zh-TW'?'目前已是最新版本。':'This is the latest build.'):updateStatus==='error'?(locale==='zh-TW'?'無法檢查更新，請確認網路後重試。':'Could not check for updates. Check your connection and try again.'):(locale==='zh-TW'?'有新版時會儲存本機紀錄並重新載入；需要連上網路。':'When a new build is available, local entries are saved before reloading. Internet is required.')}</p><p className="hint"><a href={publicPath('copyright.html')} target="_blank" rel="noreferrer">© 2026–2027 Shu-Yen Wan（萬書言） · {locale==='zh-TW'?'版權聲明':'Copyright notice'}</a></p></section></div>
  <section className="card activity-catalog-card"><SectionTitle eyebrow="ACTIVITY CATALOG" title={locale==='zh-TW'?'活動與分類':'Activities and categories'}/><p className="hint">{locale==='zh-TW'?'紀錄保留活動 ID；這裡調整的是分析及選擇器使用的分類，既有紀錄會依新分類重新統計。':'Entries keep their activity IDs. Changing a category here updates the picker and recalculates past category totals.'}</p><details><summary>{locale==='zh-TW'?'管理活動分類':'Manage activity categories'}</summary><div className="activity-management">{[...builtInActivitiesFor(audit),...(audit.customActivities??[]).map(a=>({id:a.id,key:null,name:a.name}))].map(a=><label key={a.id}><span>{'name' in a?a.name:translate(locale,a.key)}</span><select value={categoryOf(a.id,audit.categoryOverrides)} onChange={e=>mutate(s=>({...s,categoryOverrides:{...(s.categoryOverrides??{}),[a.id]:e.target.value}}))}>{categories.map(c=><option key={c.id} value={c.id}>{t(c.key)}</option>)}</select></label>)}</div></details></section>
  <section className="card questionnaire-card"><SectionTitle eyebrow="OPTIONAL" title={t('questionnaire')} action={<button className="secondary-button compact" onClick={()=>setShowQuestionnaire(x=>!x)}>{showQuestionnaire?locale==='zh-TW'?'收起':'Close':locale==='zh-TW'?'填寫 IPIP-50':'Take IPIP-50'}<ChevronDown size={16}/></button>}/><p className="hint">{t('questionnaireInfo')} <a href="https://ipip.ori.org/" target="_blank" rel="noreferrer">IPIP public-domain item pool</a></p>{scores&&<div className="factor-grid">{scores.map((score,i)=><div key={i}><span>{factorNames[locale][i]}</span><strong>{score}/50</strong><div className="bar-track"><i style={{width:`${score/50*100}%`}}/></div></div>)}</div>}{showQuestionnaire&&<div className="questionnaire-form"><div className="questionnaire-intro"><strong>{t('ipip')}</strong><span>{completed}/50</span></div><p>{locale==='zh-TW'?'依平常的自己評估：1 非常不符合，5 非常符合。50 題全部填完才計分。':'Rate your typical self: 1 very inaccurate, 5 very accurate. All 50 items are required to score.'}</p>{ipipItems.map((item,i)=><div className="question-row" key={i}><span>{i+1}. {locale==='zh-TW'?item.zh:item.en}</span><div>{[1,2,3,4,5].map(n=><button key={n} className={answers[String(i)]===n?'selected':''} onClick={()=>setAnswers(a=>({...a,[i]:n}))}>{n}</button>)}</div></div>)}<button className="primary-button" disabled={completed!==50} onClick={()=>{const score=scoreIpip(answers);if(!score)return;mutate(s=>({...s,questionnaires:[...s.questionnaires.filter(q=>q.instrument!=='IPIP-50'),{id:crypto.randomUUID(),instrument:'IPIP-50',version:'public-domain-50',locale,responses:answers,completedAt:nowIso()}]}));setShowQuestionnaire(false);}}>{locale==='zh-TW'?'完成並計分':'Finish and score'}</button></div>}</section></>;
}

function EntryEditor({initial,audit,entries,values,goals,locale,onClose,onSave,onDelete}:{initial:{entry?:Entry;start?:Date;end?:Date;backfill?:boolean};audit:AuditState;entries:Entry[];values:AuditState['values'];goals:AuditState['goals'];locale:Locale;onClose:()=>void;onSave:(e:Entry,newActivity?:CustomActivity)=>void;onDelete:(e:Entry)=>void}){
  const previous=initial.entry;
  const [start,setStart]=useState(toLocalInput(previous?new Date(previous.startAt):initial.start??new Date(Date.now()-30*60000)));
  const [end,setEnd]=useState(toLocalInput(previous?new Date(previous.endAt):initial.end??new Date()));
  const [activity,setActivity]=useState(previous?.activityId??'');
  const [newName,setNewName]=useState(previous?.activityId==='other.custom'?previous.customText:'');
  const [custom,setCustom]=useState(previous?.activityId==='other.custom'?'':previous?.customText??'');
  const [selectedCategory,setSelectedCategory]=useState(categoryOf(previous?.activityId??'work',audit.categoryOverrides));
  const [rating,setRating]=useState<Record<RatingKey,number|null>>(previous?.ratings??{importance:null,urgency:null,valueAlignment:null});
  const [status,setStatus]=useState<Record<RatingKey,'answered'|'not_applicable'|'unanswered'>>(previous?.ratingStatus??{importance:'unanswered',urgency:'unanswered',valueAlignment:'unanswered'});
  const [valueIds,setValueIds]=useState(previous?.valueIds??[]);
  const [goalIds,setGoalIds]=useState(previous?.goalIds??[]);
  const [recall,setRecall]=useState<Entry['recallConfidence']>(previous?.recallConfidence??null);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [acceptedSuggestion,setAcceptedSuggestion]=useState<string|null>(previous?.classification?.method==='rule_confirmed'?previous.classification.matched??null:null);
  const suggestion=useMemo(()=>suggestActivity(custom),[custom]);
  const t=(key:TranslationKey)=>translate(locale,key);
  const minutes=Math.max(0,(new Date(end).getTime()-new Date(start).getTime())/60000);
  const allActivities=[...builtInActivitiesFor(audit).map(a=>({id:a.id,name:t(a.key)})),...(audit.customActivities??[]).map(a=>({id:a.id,name:a.name}))];
  const recent=Object.entries(entries.reduce<Record<string,{count:number;last:number}>>((map,e)=>{const item=map[e.activityId]??{count:0,last:0};item.count++;item.last=Math.max(item.last,Date.parse(e.updatedAt));map[e.activityId]=item;return map;},{})).filter(([id])=>id!=='other.custom'&&allActivities.some(a=>a.id===id)).sort((a,b)=>b[1].count-a[1].count||b[1].last-a[1].last).slice(0,6).map(([id])=>id);
  const query=search.trim().normalize('NFKC').toLocaleLowerCase();
  const matches=(text:string)=>{const value=text.normalize('NFKC').toLocaleLowerCase();if(value.includes(query))return true;let position=0;for(const char of query){const found=value.indexOf(char,position);if(found<0)return false;position=found+1;}return true;};
  const matchRank=(name:string,category:string)=>{const n=name.normalize('NFKC').toLocaleLowerCase(),c=category.normalize('NFKC').toLocaleLowerCase();return n.startsWith(query)?0:n.includes(query)?1:c.includes(query)?2:3;};
  const searchMatches=query?allActivities.filter(a=>matches(a.name)||matches(translateCategory(locale,categoryOf(a.id,audit.categoryOverrides)))).sort((a,b)=>matchRank(a.name,translateCategory(locale,categoryOf(a.id,audit.categoryOverrides)))-matchRank(b.name,translateCategory(locale,categoryOf(b.id,audit.categoryOverrides)))):allActivities.filter(a=>categoryOf(a.id,audit.categoryOverrides)===selectedCategory);
  const choose=(id:string)=>{setActivity(id);setSelectedCategory(categoryOf(id,audit.categoryOverrides));setAcceptedSuggestion(null);setError('');};
  const adjust=(which:'start'|'end',minutes:number)=>{const value=which==='start'?start:end;const next=toLocalInput(new Date(new Date(value).getTime()+minutes*60000));which==='start'?setStart(next):setEnd(next);};
  const submit=()=>{
    const a=new Date(start).getTime(),b=new Date(end).getTime();
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a){setError(t('invalidTime'));return;}
    if(b>Date.now()+60000){setError(t('futureTime'));return;}
    if(entries.some(e=>e.id!==previous?.id&&Date.parse(e.startAt)<b&&Date.parse(e.endAt)>a)){setError(t('overlap'));return;}
    if(!activity){setError(locale==='zh-TW'?'請選擇一項活動':'Choose an activity');return;}
    if(ratings.some(key=>status[key]==='unanswered')){setError(t('selectRatings'));return;}
    let activityId=activity;let newActivity:CustomActivity|undefined;
    if(activity==='other.custom'){
      const name=newName.trim();
      if(!name){setError(locale==='zh-TW'?'請輸入新活動名稱':'Enter a name for the new activity');return;}
      const existing=(audit.customActivities??[]).find(item=>item.name.toLocaleLowerCase()===name.toLocaleLowerCase());
      activityId=existing?.id??`custom.${crypto.randomUUID()}`;
      if(!existing)newActivity={id:activityId,name,createdAt:nowIso()};
    }
    const timestamp=nowIso();
    onSave({id:previous?.id??crypto.randomUUID(),startAt:fromLocalInput(start),endAt:fromLocalInput(end),activityId,customText:custom.trim(),classification:acceptedSuggestion&&suggestion?.id===activityId?{method:'rule_confirmed',confidence:suggestion.confidence,matched:acceptedSuggestion}:{method:'user',confidence:1},ratings:rating,ratingStatus:status as Entry['ratingStatus'],valueIds,goalIds,captureMode:previous?.captureMode??(initial.backfill?'backfill':'manual'),recallConfidence:initial.backfill||previous?.captureMode==='backfill'?recall:null,createdAt:previous?.createdAt??timestamp,updatedAt:timestamp,revision:(previous?.revision??0)+1,deletedAt:null},newActivity);
  };
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="entry-modal" role="dialog" aria-modal="true" aria-label={previous?t('edit'):t('record')}>
    <div className="modal-head"><div><span className="overline">TIME ENTRY</span><h2>{previous?t('edit'):t('record')}</h2></div><button className="icon-button" onClick={onClose} aria-label={t('cancel')}><X size={20}/></button></div>
    <div className="modal-body"><div className="time-grid">{(['start','end'] as const).map(which=><div className="time-control" key={which}><label>{t(which)}</label><input type="datetime-local" value={which==='start'?start:end} onChange={e=>which==='start'?setStart(e.target.value):setEnd(e.target.value)}/><div className="time-adjust"><button onClick={()=>adjust(which,-5)}>−5m</button><button onClick={()=>adjust(which,5)}>+5m</button></div></div>)}</div><div className="duration-line"><Clock3 size={16}/>{t('duration')} <strong>{fmtDuration(minutes,locale)}</strong></div>
      <div className="editor-section"><h3>{t('whatDoing')}</h3>{recent.length>0&&<><p className="picker-caption">{locale==='zh-TW'?'常用活動 · 直接點選':'Frequent activities · tap to select'}</p><div className="recent-chips">{recent.map(id=><button key={id} className={activity===id?'selected':''} onClick={()=>choose(id)}>{activityLabel(locale,id,audit.customActivities)}</button>)}</div></>}
        <label className="activity-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={locale==='zh-TW'?'搜尋活動或分類':'Search activities or categories'} aria-label={locale==='zh-TW'?'搜尋活動或分類':'Search activities or categories'}/></label>
        {!query&&<div className="category-tabs">{categories.map(c=><button key={c.id} className={selectedCategory===c.id?'active':''} onClick={()=>setSelectedCategory(c.id)}>{t(c.key)}</button>)}</div>}
        <div className="activity-options">{searchMatches.map(a=><button key={a.id} className={activity===a.id?'selected':''} onClick={()=>choose(a.id)}><span>{a.name}</span>{query&&<small>{translateCategory(locale,categoryOf(a.id,audit.categoryOverrides))}</small>}{activity===a.id&&<Check size={14}/>}</button>)}</div>
        {(!query&&selectedCategory==='other'||query)&&<button className={`new-activity-choice ${activity==='other.custom'?'selected':''}`} onClick={()=>{choose('other.custom');setSearch('');if(query)setNewName(search.trim());}}><Plus size={16}/>{locale==='zh-TW'?`其他／新增活動${query&&searchMatches.length===0?`「${search.trim()}」`:''}`:`Other / new activity${query&&searchMatches.length===0?` “${search.trim()}”`:''}`}</button>}
        {activity==='other.custom'&&<label className="new-activity-field"><span>{locale==='zh-TW'?'新活動名稱':'New activity name'}</span><input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} placeholder={locale==='zh-TW'?'例如：禱告、園藝':'For example: gardening'} maxLength={80}/><small>{locale==='zh-TW'?'儲存後會成為可再次點選的活動，先歸在「其他」。':'Saved as a reusable activity under Other. You can change its category in Settings.'}</small></label>}
        {activity&&activity!=='other.custom'&&<label className="new-activity-field"><span>{locale==='zh-TW'?'補充說明（可選）':'Optional note'}</span><input value={custom} onChange={e=>{setCustom(e.target.value);setAcceptedSuggestion(null);}} placeholder={t('customPlaceholder')} maxLength={300}/></label>}
        {suggestion&&suggestion.id!==activity&&<button className="suggestion" onClick={()=>{choose(suggestion.id);setAcceptedSuggestion(suggestion.matched);}}><Sparkles size={14}/>{locale==='zh-TW'?'本機建議':'Local suggestion'}：{activityLabel(locale,suggestion.id)}<small>{locale==='zh-TW'?'依「':'From “'}{suggestion.matched}{locale==='zh-TW'?'」':'”'}</small></button>}
      </div>
      <div className="editor-section"><h3>{locale==='zh-TW'?'如何看待這段時間':'How did this time feel?'}</h3>{ratings.map(key=><div className="rating-row" key={key}><div><b>{t(ratingLabel[key])}</b><small>1 {t('low')} · 7 {t('high')}</small></div><div className="rating-choices">{[1,2,3,4,5,6,7].map(n=><button key={n} className={rating[key]===n?'selected':''} onClick={()=>{setRating(v=>({...v,[key]:n}));setStatus(v=>({...v,[key]:'answered'}));}}>{n}</button>)}<button className={`na-button ${status[key]==='not_applicable'?'selected':''}`} onClick={()=>{setRating(v=>({...v,[key]:null}));setStatus(v=>({...v,[key]:'not_applicable'}));}}>{locale==='zh-TW'?'略過':'N/A'}</button></div></div>)}</div>
      {(values.length>0||goals.length>0)&&<div className="editor-section"><h3>{t('valuesGoals')}</h3>{([{kind:'values',items:values,selected:valueIds,set:setValueIds},{kind:'goals',items:goals,selected:goalIds,set:setGoalIds}] as const).map(group=>group.items.length>0&&<div key={group.kind} className="tag-selection"><small>{t(group.kind)}</small><div>{group.items.map(item=><button key={item.id} className={group.selected.includes(item.id)?'selected':''} onClick={()=>group.set(ids=>ids.includes(item.id)?ids.filter(x=>x!==item.id):[...ids,item.id])}>{item.text}</button>)}</div></div>)}</div>}
      {(initial.backfill||previous?.captureMode==='backfill')&&<div className="editor-section"><h3>{t('recallConfidence')}</h3><div className="recent-chips">{(['high','medium','low'] as const).map(level=><button key={level} className={recall===level?'selected':''} onClick={()=>setRecall(level)}>{t(level==='high'?'highConfidence':level==='medium'?'mediumConfidence':'lowConfidence')}</button>)}</div></div>}
      {error&&<div className="form-error" role="alert">{error}</div>}
    </div><div className="modal-footer">{previous&&<button className="delete-button" onClick={()=>{if(confirm(locale==='zh-TW'?'刪除這筆紀錄？':'Delete this entry?'))onDelete(previous);}}>{t('delete')}</button>}<span/><button className="secondary-button" onClick={onClose}>{t('cancel')}</button><button className="primary-button" onClick={submit}><Check size={17}/>{previous?t('update'):t('save')}</button></div>
  </div></div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(publicPath('sw.js'),{scope:import.meta.env.BASE_URL}).catch(console.warn));
}
