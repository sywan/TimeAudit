import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, BarChart3, Bell, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, Cloud, CloudOff, Compass, Download, FileSpreadsheet, Heart, Menu, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { activeEntries, categoryOf, dayBounds, durationMinutes, fromLocalInput, getGaps, initialState, makeDemoState, overlapMinutes, publicEquivalentForCustomName, toLocalInput, withV09CategoryDefaults, type AuditState, type CustomActivity, type DailyJournal, type Entry, type Profile, type RatingKey } from './types';
import { activityLabel, categories, categoryMeta, translate, type Locale, type TranslationKey } from './i18n';
import { loadProfile, saveProfile } from './storage';
import { googleClientId, mountGoogleButton, requestDriveToken, signOutGoogle } from './google';
import { mergeEntries, mergeQuestionnaires, syncWithDrive, updateSheetMirror, type SyncConflict, type SyncProgress } from './drive';
import { factorNames, ipipItems, scoreIpip } from './questionnaire';
import { suggestActivity } from './classify';
import { latestBundlePath } from './update';
import InsightsPage from './insights';
import {insightWindow, type InsightRange} from './insightRange';
import {mergeJournalVersions} from './journal';
import {mergeExperiments} from './experiments';
import {mergeInsightFeedback} from './insightFeedback';
import {dataQuality} from './auditAnalytics';
import DailyJournalCard from './DailyJournalCard';
import DailyVerse from './DailyVerse';
import LogoStory from './LogoStory';
import {initUsageAnalytics, publicUsageStatsUrl, setUsageAnalyticsOptOut, trackUsage, usageAnalyticsConfigured, usageAnalyticsOptedOut} from './usageAnalytics';
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
const activityName = (locale:Locale, entry:Entry, audit:AuditState) => {
  if(entry.activityId==='other.custom'&&entry.customText)return entry.customText;
  const personal=(audit.customActivities??[]).find(item=>item.id===entry.activityId);
  const equivalent=personal&&publicEquivalentForCustomName(personal.name);
  return equivalent&&categoryOf(entry.activityId,audit.categoryOverrides)===categoryOf(equivalent,audit.categoryOverrides)
    ?activityLabel(locale,equivalent):activityLabel(locale,entry.activityId,audit.customActivities);
};
const builtInActivitiesFor = (_audit:AuditState) => categories.flatMap(c=>c.activities).filter(item=>item.id!=='other.custom');
const APP_VERSION = '1.11';
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
  const [syncProgress,setSyncProgress]=useState<SyncProgress|null>(null);
  const [conflicts,setConflicts]=useState<SyncConflict[]>([]);
  const [toast,setToast]=useState<string>('');
  const [mobileNav,setMobileNav]=useState(false);
  const [sidebarAccountOpen,setSidebarAccountOpen]=useState(false);
  const [fontScale,setFontScale]=useState(()=>Math.max(1,Math.min(1.5,Number(localStorage.getItem('timeAuditFontScale')??1.15)||1.15)));
  const [sidebarWidth,setSidebarWidth]=useState(()=>Math.max(220,Math.min(380,Number(localStorage.getItem('timeAuditSidebarWidth')??260)||260)));
  const [installPrompt,setInstallPrompt]=useState<InstallPromptEvent|null>(null);
  const googleButton=useRef<HTMLDivElement>(null);
  const sidebarAccountMenu=useRef<HTMLDivElement>(null);
  const lastSynced=useRef<string>('');
  const syncLock=useRef(false);
  const journalTrackedDays=useRef(new Set<string>());
  const locale=audit.preferences.locale;
  const t=useCallback((key:TranslationKey)=>translate(locale,key),[locale]);
  const say=(zh:string,en:string)=>locale==='zh-TW'?zh:en;

  useEffect(()=>initUsageAnalytics(),[]);

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
  useEffect(()=>{
    if(!sidebarAccountOpen)return;
    const closeOutside=(event:PointerEvent)=>{if(event.target instanceof Node&&!sidebarAccountMenu.current?.contains(event.target))setSidebarAccountOpen(false);};
    const closeEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setSidebarAccountOpen(false);};
    document.addEventListener('pointerdown',closeOutside);
    document.addEventListener('keydown',closeEscape);
    return()=>{document.removeEventListener('pointerdown',closeOutside);document.removeEventListener('keydown',closeEscape);};
  },[sidebarAccountOpen]);

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
    syncLock.current=true;setSyncStatus('syncing');setSyncProgress({stage:'discover',completed:0,total:0});
    try{
      const result=await syncWithDrive(source,currentToken,setSyncProgress);
      setConflicts(result.conflicts);
      if(result.conflicts.length){setSyncStatus('syncFailed');setToast(say('有同步衝突，請在設定中選擇版本。','Sync conflict: resolve it in Settings.'));return false;}
      let next=withV09CategoryDefaults(result.state);
      try{
        const sheetId=await updateSheetMirror(next,currentToken,result.folderId,setSyncProgress);
        if(sheetId!==next.preferences.sheetId)next={...next,preferences:{...next.preferences,sheetId},updatedAt:nowIso()};
      }catch(error){console.warn('Sheet mirror sync',error);setToast(say('日誌已同步，試算表鏡像稍後可重試。','Journal synced; Sheet mirror can be retried.'));}
      lastSynced.current=next.updatedAt;
      setAudit(current=>{
        if(current.updatedAt===source.updatedAt)return next;
        const merged=mergeEntries(current.entries,next.entries);
        return {...current,entries:merged.entries,questionnaires:mergeQuestionnaires(current.questionnaires??[],next.questionnaires??[]),journals:mergeJournalVersions(current.journals??[],next.journals??[]),experiments:mergeExperiments(current.experiments??[],next.experiments??[]),insightFeedback:mergeInsightFeedback(current.insightFeedback??[],next.insightFeedback??[]),updatedAt:nowIso()};
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
    finally{syncLock.current=false;setSyncProgress(null);}
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
      setSyncProgress({stage:'authorization',completed:0,total:0});
      const accessToken=await requestDriveToken(profile.sub);
      setToken(accessToken);
      if(await doSync(accessToken,audit))setToast(say('Drive 授權與同步已完成。','Drive authorization and sync are complete.'));
    }catch(error){setSyncStatus('syncFailed');setToast(error instanceof Error?error.message:String(error));}
    finally{setSyncProgress(null);}
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
  const saveEntry=(entry:Entry,newActivity?:CustomActivity)=>{mutate(state=>({...state,customActivities:newActivity?[...(state.customActivities??[]),newActivity]:state.customActivities,entries:[...state.entries.filter(e=>e.id!==entry.id),entry]}));trackUsage('entry_saved');setEditor(null);setToast(say('紀錄已儲存','Entry saved'));};
  const saveJournal=(item:DailyJournal)=>{mutate(state=>({...state,journals:mergeJournalVersions(state.journals??[],[item])}));if(item.note.trim()&&!journalTrackedDays.current.has(item.day)){journalTrackedDays.current.add(item.day);trackUsage('journal_edited');}};
  const deleteEntry=(entry:Entry)=>{mutate(state=>({...state,entries:state.entries.map(e=>e.id===entry.id?{...e,deletedAt:nowIso(),updatedAt:nowIso(),revision:e.revision+1}:e)}));setEditor(null);};
  const resolveConflict=(conflict:SyncConflict,choice:'local'|'remote')=>{
    const winner=choice==='local'?conflict.local:conflict.remote;
    const revised={...winner,revision:Math.max(conflict.local.revision,conflict.remote.revision)+1,updatedAt:nowIso()};
    mutate(state=>({...state,entries:[...state.entries.filter(e=>e.id!==winner.id),revised]}));
    setConflicts(list=>list.filter(c=>c.local.id!==winner.id));
  };
  const navItems:Array<{id:Page;icon:React.ElementType;key:TranslationKey}>=[{id:'today',icon:Clock3,key:'today'},{id:'calendar',icon:CalendarDays,key:'calendar'},{id:'insights',icon:BarChart3,key:'insights'},{id:'reflection',icon:Compass,key:'reflection'},{id:'settings',icon:Settings2,key:'settings'}];

  const openPage=(destination:Page)=>{if(destination==='today')setViewDay(shortDate(new Date()));if(page!==destination&&destination==='insights')trackUsage('insights_opened');if(page!==destination&&destination==='reflection')trackUsage('reflection_opened');setPage(destination);setMobileNav(false);setSidebarAccountOpen(false);};
  const openReminderSettings=()=>{setPage('settings');setSidebarAccountOpen(false);setTimeout(()=>document.getElementById('reminder-settings')?.scrollIntoView({behavior:'smooth',block:'start'}),0);};
  const signOut=()=>{setSidebarAccountOpen(false);setMobileNav(false);signOutGoogle();setProfile(null);setToken(null);setLoaded(false);};

  if(!profile)return <div className="welcome-screen"><div className="welcome-orbit orbit-a"/><div className="welcome-orbit orbit-b"/><div className="welcome-card"><LogoStory locale={welcomeLocale} src={publicPath('logo-v108.svg')} imageClassName="brand-logo large"/><span className="overline">TIME AUDIT</span><h1>{translate(welcomeLocale,'welcome')}</h1><p>{translate(welcomeLocale,'welcomeText')}</p><div className="welcome-actions">{googleClientId?<div ref={googleButton} className="google-button"/>:<div className="setup-note"><ShieldCheck size={18}/>{translate(welcomeLocale,'googleNotReady')}</div>}<button className="link-button" onClick={()=>setProfile({sub:'demo',name:'Demo',email:'',demo:true})}>{translate(welcomeLocale,'startPreview')} <ArrowRight size={16}/></button></div><div className="welcome-foot"><a href={publicPath('privacy.html')} target="_blank" rel="noreferrer">{welcomeLocale==='zh-TW'?'隱私說明':'Privacy'}</a><span>·</span><a href={publicPath('terms.html')} target="_blank" rel="noreferrer">{welcomeLocale==='zh-TW'?'使用條款':'Terms'}</a><span>·</span><a href={publicPath('copyright.html')} target="_blank" rel="noreferrer">{welcomeLocale==='zh-TW'?'版權聲明':'Copyright'}</a>{publicUsageStatsUrl&&<><span>·</span><a href={publicUsageStatsUrl} target="_blank" rel="noreferrer">{welcomeLocale==='zh-TW'?'網站使用統計':'Site statistics'}</a></>}</div></div></div>;
  if(!loaded)return <div className="loading-screen"><img className="brand-logo" src={publicPath('logo-v108.svg')} alt=""/><p>Time Audit</p></div>;

  return <div className="app-shell" style={{'--sidebar-width':`${sidebarWidth}px`} as React.CSSProperties}>
    <aside className={`sidebar ${mobileNav?'mobile-open':''}`}>
      <div className="sidebar-brand"><LogoStory locale={locale} src={publicPath('logo-v108.svg')} imageClassName="brand-logo"/><div><strong>Time Audit <small className="version-inline">V{APP_VERSION}版</small></strong><span>{t('tagline')}</span></div></div>
      <nav className="main-nav">{navItems.map(item=><button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>openPage(item.id)}><item.icon size={19}/><span>{item.id==='today'?relativeDayLabel(parseDay(viewDay),locale):t(item.key)}</span>{page===item.id&&<span className="nav-indicator"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-quote"><Sparkles size={18}/><p>{say('時間不是要被填滿，而是用來承載你重視的事。','Time is there to hold what matters, not merely to be filled.')}</p></div><div className="sidebar-account-wrap" ref={sidebarAccountMenu}><button type="button" className="sidebar-profile sidebar-profile-button" aria-label={say('開啟帳號選單','Open account menu')} aria-haspopup="menu" aria-expanded={sidebarAccountOpen} onClick={()=>setSidebarAccountOpen(open=>!open)}><span className="avatar">{profile.picture?<img src={profile.picture} alt=""/>:profile.name.charAt(0)}</span><span className="sidebar-profile-name"><b>{profile.name||'Time Audit'}</b><small>{profile.demo?t('preview'):profile.email}</small></span><ChevronDown size={16} aria-hidden="true"/></button>{sidebarAccountOpen&&<div className="account-menu sidebar-account-menu" role="menu"><div className="account-menu-identity"><strong>{profile.name}</strong><small>{profile.demo?t('preview'):profile.email}</small></div><button type="button" role="menuitem" onClick={signOut}>{t('signOut')}</button></div>}</div></div>
      <div className="sidebar-resizer" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={say('調整側欄寬度','Resize sidebar')} aria-valuenow={sidebarWidth} aria-valuemin={220} aria-valuemax={380} onPointerDown={startSidebarResize} onKeyDown={event=>{if(event.key==='ArrowRight')setSidebarWidth(v=>Math.min(380,v+12));if(event.key==='ArrowLeft')setSidebarWidth(v=>Math.max(220,v-12));}}/>
    </aside>
    <div className="main-wrap"><header className="topbar"><button className="mobile-menu icon-button" onClick={()=>setMobileNav(v=>!v)} aria-label="Menu"><Menu size={22}/></button><div className="breadcrumb">{page==='today'?relativeDayLabel(parseDay(viewDay),locale):t(navItems.find(n=>n.id===page)?.key??'today')}</div><div className="top-actions"><div className="language-switch" role="group" aria-label={t('language')}><button className={locale==='zh-TW'?'active':''} aria-pressed={locale==='zh-TW'} onClick={()=>changeLocale('zh-TW')}>繁中</button><button className={locale==='en'?'active':''} aria-pressed={locale==='en'} onClick={()=>changeLocale('en')}>EN</button></div>{!profile.demo&&<button className={`top-drive-button ${syncStatus}`} disabled={syncStatus==='syncing'} onClick={()=>{if(token)void doSync(token,audit);else void connectDrive();}} title={token?t('syncNow'):t('connectDrive')} aria-label={token?t('syncNow'):t('connectDrive')}><Cloud size={16}/><span>{syncStatus==='syncing'?t('syncing'):token?t('syncNowShort'):t('connectDriveShort')}</span></button>}<span className={`sync-pill ${syncStatus}`}>{profile.demo?<CloudOff size={14}/>:syncStatus==='synced'?<Cloud size={14}/>:<CloudOff size={14}/>} {profile.demo?t('preview'):t(syncStatus)}</span><button className="icon-button" title={say('開啟記錄提醒設定','Open reminder settings')} aria-label={say('開啟記錄提醒設定','Open reminder settings')} onClick={openReminderSettings}><Bell size={19}/></button></div></header>
      {syncStatus==='syncing'&&syncProgress&&<div className="sync-progress-banner" role="status" aria-live="polite"><div className="sync-progress-label"><strong>{locale==='zh-TW'?({authorization:'正在等待 Google 授權',discover:'正在尋找 Drive 資料',download:'正在讀取 Drive 檔案',upload:'正在寫入 Drive 檔案',sheet:'正在更新試算表'} as const)[syncProgress.stage]:({authorization:'Waiting for Google authorization',discover:'Finding Drive data',download:'Reading Drive files',upload:'Writing Drive files',sheet:'Updating spreadsheet'} as const)[syncProgress.stage]}</strong>{syncProgress.total>0&&<span>{syncProgress.completed}/{syncProgress.total}</span>}</div><div className={`sync-progress-track ${syncProgress.total===0?'indeterminate':''}`} role="progressbar" aria-label={locale==='zh-TW'?'同步進度':'Sync progress'} aria-valuemin={0} aria-valuemax={syncProgress.total||undefined} aria-valuenow={syncProgress.total?syncProgress.completed:undefined}><i style={syncProgress.total?{width:`${100*syncProgress.completed/syncProgress.total}%`}:undefined}/></div></div>}
      <nav className="mobile-nav" aria-label={say('主要導覽','Main navigation')}>{navItems.map(item=><button key={item.id} className={page===item.id?'active':''} aria-current={page===item.id?'page':undefined} onClick={()=>openPage(item.id)}><item.icon size={17}/><span>{item.id==='today'?relativeDayLabel(parseDay(viewDay),locale):t(item.key)}</span></button>)}</nav>
      <main className="content">
        {profile.demo&&<div className="preview-banner"><ShieldCheck size={17}/><span>{t('previewNote')}</span></div>}
        {!profile.demo&&!token&&<div className="preview-banner drive-banner"><CloudOff size={17}/><span>{say('Google Drive 尚未授權。此時新增的紀錄只會暫存在這台裝置；請授權後同步到你的 Drive。','Google Drive is not connected. New entries stay on this device until you authorize and sync.')}</span><button className="secondary-button compact" onClick={connectDrive}>{t('connectDrive')}</button></div>}
        {page==='today'&&<TodayPage audit={audit} entries={entries} locale={locale} selected={viewDay} setSelected={setViewDay} openNew={openNew} edit={entry=>setEditor({entry})} saveJournal={saveJournal} goCalendar={()=>{setCalendarDay(viewDay);setPage('calendar');}}/>}
        {page==='calendar'&&<CalendarPage audit={audit} entries={entries} locale={locale} selected={calendarDay} setSelected={setCalendarDay} openDetail={date=>{setViewDay(date);setPage('today');}} openNew={openNew} edit={entry=>setEditor({entry})}/>}
        {page==='insights'&&<InsightsPage audit={audit} entries={entries} locale={locale} goCalendar={()=>setPage('calendar')} mutate={mutate}/>}
        {page==='reflection'&&<ReflectionPage audit={audit} entries={entries} locale={locale} mutate={mutate} goCalendar={day=>{setCalendarDay(day);setPage('calendar');}}/>}
        {page==='settings'&&<SettingsPage audit={audit} profile={profile} locale={locale} mutate={mutate} token={token} connectDrive={connectDrive} syncNow={()=>token&&doSync(token,audit)} conflicts={conflicts} resolveConflict={resolveConflict} fontScale={fontScale} setFontScale={setFontScale} sidebarWidth={sidebarWidth} setSidebarWidth={setSidebarWidth} installPrompt={installPrompt} installApp={async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;setInstallPrompt(null);}} signOut={signOut}/>}
      </main>
    </div>
    {editor&&<EntryEditor key={editor.entry?.id??`${editor.start?.toISOString()}`} initial={editor} audit={audit} entries={entries} values={audit.values} goals={audit.goals} locale={locale} onClose={()=>setEditor(null)} onSave={saveEntry} onDelete={deleteEntry}/>}
    {toast&&<div className="toast" role="status">{toast}<button onClick={()=>setToast('')} aria-label="Close"><X size={14}/></button></div>}
  </div>;
}

function SectionTitle({eyebrow,title,action}:{eyebrow?:string;title:string;action?:React.ReactNode}){return <div className="section-head"><div>{eyebrow&&<span className="overline">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>;}
function EntryRow({entry,audit,locale,start,end,onClick}:{entry:Entry;audit:AuditState;locale:Locale;start?:number;end?:number;onClick:()=>void}){const color=categoryMeta(categoryOf(entry.activityId,audit.categoryOverrides)).color;const shownStart=Math.max(Date.parse(entry.startAt),start??-Infinity),shownEnd=Math.min(Date.parse(entry.endAt),end??Infinity);return <button className="entry-row" onClick={onClick}><span className="entry-dot" style={{background:color}}/><span className="entry-time">{fmtDate(new Date(shownStart),locale,{hour:'2-digit',minute:'2-digit'})}<small>{fmtDate(new Date(shownEnd),locale,{hour:'2-digit',minute:'2-digit'})}</small></span><span className="entry-name"><b>{activityName(locale,entry,audit)}</b>{entry.customText&&entry.activityId!=='other.custom'&&<small>{entry.customText}</small>}</span><span className="entry-duration">{fmtDuration((shownEnd-shownStart)/60000,locale)}</span><ChevronRight size={16}/></button>;}
function categoryTotals(entries:Entry[],start:number,end:number,audit:AuditState){const totals=new Map<string,number>();for(const entry of entries){const mins=overlapMinutes(entry,start,end);if(mins)totals.set(categoryOf(entry.activityId,audit.categoryOverrides),(totals.get(categoryOf(entry.activityId,audit.categoryOverrides))??0)+mins);}return [...totals].sort((a,b)=>b[1]-a[1]);}

function TodayPage({audit,entries,locale,selected,setSelected,openNew,edit,saveJournal,goCalendar}:{audit:AuditState;entries:Entry[];locale:Locale;selected:string;setSelected:(date:string)=>void;openNew:(a?:Date,b?:Date,c?:boolean)=>void;edit:(e:Entry)=>void;saveJournal:(item:DailyJournal)=>void;goCalendar:()=>void}){
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
    <div className="hero"><div className="hero-intro"><div className="hero-head"><LogoStory locale={locale} src={publicPath('logo-v108.svg')} imageClassName="hero-logo"/><div><span className="overline">{fmtDate(day,locale,{weekday:'long',month:'long',day:'numeric'})}</span><h1>{heading}</h1></div></div><p>{locale==='zh-TW'?'用每一段真實的時間，慢慢看見自己的選擇。':'Each real stretch of time helps you see your choices more clearly.'}</p><div className="hero-actions">{(isToday||firstGap)&&<button className="primary-button" onClick={recordForDay}><Plus size={18}/>{isToday?t('quickRecord'):t('backfill')}</button>}<button className="secondary-button" onClick={goCalendar}><CalendarDays size={17}/>{t('viewCalendar')}</button></div></div><DailyVerse date={selected} locale={locale}/></div>
    <div className="stat-grid"><div className="stat-card"><span>{t('recorded')}</span><strong>{fmtDuration(recorded,locale)}</strong><small>{coverage}% {t('coverage')}</small></div><div className="stat-card"><span>{t('unknown')}</span><strong>{fmtDuration(missing,locale)}</strong><small>{locale==='zh-TW'?'可從日曆補登':'Backfill from the calendar'}</small></div><div className="stat-card"><span>{locale==='zh-TW'?'紀錄筆數':'Entries'}</span><strong>{dayEntries.length}</strong><small>{locale==='zh-TW'?'以時長統計分析':'Insights use duration'}</small></div></div>
    <div className="dashboard-grid"><section className="card timeline-card"><SectionTitle eyebrow="TIMELINE" title={locale==='zh-TW'?`${relativeDayLabel(day,locale)}的軌跡`:`${relativeDayLabel(day,locale)}’s timeline`} action={<button className="text-button" onClick={goCalendar}>{locale==='zh-TW'?'完整時間軸':'Full timeline'} <ArrowRight size={15}/></button>}/>{dayEntries.length?dayEntries.map(e=><EntryRow key={e.id} entry={e} audit={audit} locale={locale} start={start} end={end} onClick={()=>edit(e)}/>):<div className="empty-state"><Clock3 size={32}/><p>{selected>current?(locale==='zh-TW'?'這一天尚未到來。':'This day has not begun yet.'):(locale==='zh-TW'?'這一天還沒有紀錄。':'No entries for this day yet.')}</p>{(isToday||firstGap)&&<button className="secondary-button" onClick={recordForDay}>{isToday?t('record'):t('backfill')}</button>}</div>}</section><section className="card flow-card"><SectionTitle eyebrow="TIME FLOW" title={t('totalByCategory')}/><div className="flow-visual"><div className="donut" style={{background:gradient}}><div><strong>{fmtDuration(total,locale)}</strong><small>{t('recorded')}</small></div></div></div><div className="flow-legend">{totals.slice(0,5).map(([key,value])=><div key={key}><span className="legend-name"><i style={{background:categoryMeta(key).color}}/>{translateCategory(locale,key)}</span><b>{fmtDuration(value,locale)}</b></div>)}</div></section></div>
    {selected<=current&&<DailyJournalCard key={selected} audit={audit} entries={dayEntries} day={selected} start={start} end={visibleEnd} locale={locale} save={saveJournal}/>}
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

function ReflectionPage({audit,entries,locale,mutate,goCalendar}:{audit:AuditState;entries:Entry[];locale:Locale;mutate:(fn:(s:AuditState)=>AuditState)=>void;goCalendar:(day:string)=>void}){
  const [ifContext,setIfContext]=useState('');
  const [thenAction,setThenAction]=useState('');
  const [metric,setMetric]=useState('');
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
  const [range,setRange]=useState<InsightRange>('30d');
  const t=(key:TranslationKey)=>translate(locale,key);
  const [start,end]=insightWindow(range,new Date());
  const recent=entries.filter(e=>overlapMinutes(e,start,end)>0);
  const urgent=recent.filter(e=>(e.ratings.urgency??0)>=5&&(e.ratings.importance??8)<=3);
  const low=recent.filter(e=>(e.ratings.valueAlignment??8)<=3);
  const mins=(list:Entry[])=>list.reduce((sum,e)=>sum+overlapMinutes(e,start,end),0);
  const options:Array<{id:InsightRange;zh:string;en:string}>=[
    {id:'today',zh:'今天',en:'Today'},{id:'3d',zh:'3 天',en:'3 days'},
    {id:'7d',zh:'7 天',en:'7 days'},{id:'30d',zh:'30 天',en:'30 days'},
    {id:'6m',zh:'半年',en:'6 months'},{id:'1y',zh:'一年',en:'1 year'},
  ];
  const selected=options.find(option=>option.id===range)!;
  const items=[{title:t('highUrgency'),list:urgent,question:t('highUrgencyQuestion'),icon:Bell},{title:t('lowAlignment'),list:low,question:t('lowAlignmentQuestion'),icon:Heart}];
  const experiments=audit.experiments??[];
  return <><SectionTitle eyebrow="REFLECTION" title={t('reflectTitle')}/><p className="page-lead">{t('reflectLead')}</p><div className="segmented reflection-range" role="group" aria-label={locale==='zh-TW'?'反思期間':'Reflection period'}>{options.map(option=><button key={option.id} className={range===option.id?'active':''} aria-pressed={range===option.id} onClick={()=>setRange(option.id)}>{locale==='zh-TW'?option.zh:option.en}</button>)}</div><WeeklyReviewCards audit={audit} entries={entries} locale={locale} goCalendar={goCalendar} mutate={mutate}/><div className="reflection-grid">{items.map(item=><section className="card reflection-card" key={item.title}><div className="reflection-icon"><item.icon size={21}/></div><h3>{item.title}</h3><strong>{fmtDuration(mins(item.list),locale)}</strong><small>{locale==='zh-TW'?`${selected.zh} · 按時長`:`${selected.en} · by duration`}</small><p>{item.question}</p>{item.list.length>0&&<div className="evidence-list">{item.list.slice().sort((a,b)=>Date.parse(b.startAt)-Date.parse(a.startAt)).slice(0,4).map(e=><div key={e.id}><span>{activityName(locale,e,audit)}</span><b>{fmtDuration(overlapMinutes(e,start,end),locale)}</b></div>)}</div>}</section>)}</div><section className="card experiment-card"><SectionTitle eyebrow="NEXT STEP" title={t('experiment')}/><p>{locale==='zh-TW'?'選一個可試一週的小改變，並寫下如何檢查。':'Choose a small change for one week and how you will check it.'}</p><div className="experiment-fields"><input value={ifContext} onChange={e=>setIfContext(e.target.value)} placeholder={locale==='zh-TW'?'若遇到什麼情境…':'If this situation occurs…'} maxLength={180}/><input value={thenAction} onChange={e=>setThenAction(e.target.value)} placeholder={locale==='zh-TW'?'我就採取什麼行動…':'Then I will…'} maxLength={180}/><input value={metric} onChange={e=>setMetric(e.target.value)} placeholder={locale==='zh-TW'?'一週後檢查什麼紀錄或感受？':'What record or feeling will I review in a week?'} maxLength={180}/><button className="primary-button" disabled={!ifContext.trim()||!thenAction.trim()} onClick={()=>{const createdAt=nowIso();const reviewAt=new Date(Date.now()+7*86400000).toISOString();const [baselineStart,baselineEnd]=insightWindow('7d',new Date());const baselineQuality=dataQuality(entries,baselineStart,baselineEnd);const baselineCoverage=baselineQuality.coverage;mutate(s=>({...s,experiments:[...(s.experiments??[]),{id:crypto.randomUUID(),text:`若 ${ifContext.trim()}，則 ${thenAction.trim()}`,ifContext:ifContext.trim(),thenAction:thenAction.trim(),metric:metric.trim(),createdAt,updatedAt:createdAt,reviewAt,status:'active',baselineStart:new Date(baselineStart).toISOString(),baselineEnd:new Date(baselineEnd).toISOString(),baselineCoverage,baselineRecorded:baselineQuality.recorded,baselineEntries:entries.filter(entry=>overlapMinutes(entry,baselineStart,baselineEnd)>0).length}]}));setIfContext('');setThenAction('');setMetric('');}}>{t('saveExperiment')}</button></div>{experiments.length>0&&<div className="experiment-list">{experiments.slice().reverse().map(e=><div key={e.id} className="experiment-item"><Check size={16}/><div><span>{e.text}</span><small>{e.reviewAt?`${locale==='zh-TW'?'回顧':'Review'} ${fmtDate(e.reviewAt,locale,{month:'numeric',day:'numeric'})}`:fmtDate(e.createdAt,locale,{month:'numeric',day:'numeric'})}</small>{e.metric&&<small>{locale==='zh-TW'?'檢查：':'Check: '}{e.metric}</small>}{e.baselineCoverage!=null&&<small>{locale==='zh-TW'?`建立時近 7 天：${fmtDuration(e.baselineRecorded??0,locale)}、${e.baselineEntries??0} 筆、覆蓋 ${Math.round(e.baselineCoverage*100)}%`:`Baseline 7 days: ${fmtDuration(e.baselineRecorded??0,locale)}, ${e.baselineEntries??0} entries, ${Math.round(e.baselineCoverage*100)}% coverage`}</small>}{e.reviewCoverage!=null&&<small>{locale==='zh-TW'?`回顧時近 7 天：${fmtDuration(e.reviewRecorded??0,locale)}、${e.reviewEntries??0} 筆、覆蓋 ${Math.round(e.reviewCoverage*100)}%`:`Review 7 days: ${fmtDuration(e.reviewRecorded??0,locale)}, ${e.reviewEntries??0} entries, ${Math.round(e.reviewCoverage*100)}% coverage`}</small>}{e.resultNote&&<small>{e.resultNote}</small>}{e.status&&e.status!=='active'&&<small>{locale==='zh-TW'?'結論：':'Result: '}{e.status}</small>}{e.status==='active'&&<div className="experiment-review"><input value={reviewNotes[e.id]??''} onChange={event=>setReviewNotes(notes=>({...notes,[e.id]:event.target.value}))} placeholder={locale==='zh-TW'?'回顧時的感受或結果（可選）':'Review note (optional)'} maxLength={300}/>{(['continue','adjust','stop'] as const).map(choice=><button type="button" key={choice} onClick={()=>mutate(s=>({...s,experiments:s.experiments.map(item=>item.id===e.id?{...item,status:choice,resultNote:reviewNotes[e.id]?.trim()??'',updatedAt:nowIso(),reviewCoverage:dataQuality(activeEntries(s.entries),...insightWindow('7d',new Date())).coverage,reviewRecorded:dataQuality(activeEntries(s.entries),...insightWindow('7d',new Date())).recorded,reviewEntries:activeEntries(s.entries).filter(entry=>overlapMinutes(entry,...insightWindow('7d',new Date()))>0).length}:item)}))}>{choice==='continue'?(locale==='zh-TW'?'繼續':'Continue'):choice==='adjust'?(locale==='zh-TW'?'調整':'Adjust'):(locale==='zh-TW'?'停止':'Stop')}</button>)}</div>}</div></div>)}</div>}</section><p className="method-note">{locale==='zh-TW'?'這些提示只描述紀錄中的型態，不能推定討好、完美主義或任何臨床狀態。':'These prompts describe patterns in records. They cannot infer people pleasing, perfectionism, or clinical conditions.'}</p></>;
}

function WeeklyReviewCards({audit,entries,locale,goCalendar,mutate}:{audit:AuditState;entries:Entry[];locale:Locale;goCalendar:(day:string)=>void;mutate:(fn:(s:AuditState)=>AuditState)=>void}){
  const [start,end]=insightWindow('7d',new Date());
  const monday=new Date();monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
  const weekKey=shortDate(monday);
  const recent=entries.filter(e=>overlapMinutes(e,start,end)>0);
  const quality=dataQuality(recent,start,end);
  const minutes=(items:Entry[])=>items.reduce((sum,e)=>sum+overlapMinutes(e,start,end),0);
  const cards=[
    {id:'urgent',items:recent.filter(e=>(e.ratings.urgency??0)>=5&&(e.ratings.importance??8)<=3),zh:'急迫但較不重要',en:'Urgent, lower importance',questionZh:'這些事情的期限和責任人是誰？',questionEn:'Whose deadline and responsibility were these?'},
    {id:'alignment',items:recent.filter(e=>(e.ratings.valueAlignment??8)<=3),zh:'價值一致感較低',en:'Lower value alignment',questionZh:'哪些是必要投入，哪些可以重新安排？',questionEn:'Which were necessary, and which could be rearranged?'},
    {id:'feeling',items:recent.filter(e=>e.feeling!=null&&e.feeling<=3),zh:'活動當下感受較低',en:'Less pleasant activity time',questionZh:'當時的情境是什麼？是否有可調整的地方？',questionEn:'What was happening then, and what might be adjustable?'},
  ].filter(card=>card.items.length>0).sort((a,b)=>minutes(b.items)-minutes(a.items)).slice(0,3);
  return <section className="card weekly-review"><SectionTitle eyebrow="WEEKLY REVIEW" title={locale==='zh-TW'?'本週值得回看的紀錄':'Records worth reviewing this week'}/><p className="hint">{locale==='zh-TW'?`最近 7 天 · 覆蓋率 ${Math.round(quality.coverage*100)}% · 最多 3 張觀察卡。以下是主觀評分與原始紀錄的線索。`:`Last 7 days · ${Math.round(quality.coverage*100)}% coverage · up to 3 observations from your ratings and records.`}</p>{cards.length?<div className="weekly-review-grid">{cards.map(card=><article key={card.id}><strong>{locale==='zh-TW'?card.zh:card.en}</strong><b>{fmtDuration(minutes(card.items),locale)}</b><small>{card.items.length} {locale==='zh-TW'?'筆紀錄':'entries'} · {locale==='zh-TW'?'按時長':'by duration'}</small><p>{locale==='zh-TW'?card.questionZh:card.questionEn}</p><div className="weekly-sources">{card.items.slice(0,3).map(e=><button key={e.id} onClick={()=>goCalendar(shortDate(new Date(e.startAt)))}>{activityName(locale,e,audit)} · {fmtDate(e.startAt,locale,{month:'numeric',day:'numeric'})}</button>)}</div><div className="weekly-actions">{(['helpful','not_applicable'] as const).map(decision=>{const id=`${weekKey}:${card.id}`;const selected=audit.insightFeedback?.find(item=>item.id===id)?.decision===decision;return <button type="button" key={decision} aria-pressed={selected} className={selected?'selected':''} onClick={()=>mutate(state=>({...state,insightFeedback:mergeInsightFeedback(state.insightFeedback??[],[{id,decision,updatedAt:nowIso()}])}))}>{decision==='helpful'?(locale==='zh-TW'?'有幫助':'Helpful'):(locale==='zh-TW'?'不適用':'Not applicable')}</button>})}<button className="text-button" onClick={()=>goCalendar(shortDate(new Date(card.items[0].startAt)))}>{locale==='zh-TW'?'到日曆回看':'Review in Calendar'} <ArrowRight size={14}/></button></div></article>)}</div>:<p className="hint">{locale==='zh-TW'?'這週暫無符合這三種條件的已評紀錄；這不代表好壞。':'No rated entries match these three prompts this week.'}</p>}{quality.coverage<.6&&<p className="quality-caution">{locale==='zh-TW'?'資料覆蓋有限，這些觀察可能隨補登而改變。':'Coverage is limited; these observations may change after backfilling.'}</p>}</section>;
}

function SettingsPage({audit,profile,locale,mutate,token,connectDrive,syncNow,conflicts,resolveConflict,fontScale,setFontScale,sidebarWidth,setSidebarWidth,installPrompt,installApp,signOut}:{audit:AuditState;profile:Profile;locale:Locale;mutate:(fn:(s:AuditState)=>AuditState)=>void;token:string|null;connectDrive:()=>void;syncNow:()=>void;conflicts:SyncConflict[];resolveConflict:(c:SyncConflict,choice:'local'|'remote')=>void;fontScale:number;setFontScale:React.Dispatch<React.SetStateAction<number>>;sidebarWidth:number;setSidebarWidth:React.Dispatch<React.SetStateAction<number>>;installPrompt:InstallPromptEvent|null;installApp:()=>void;signOut:()=>void}){
  const [valueDraft,setValueDraft]=useState(''),[goalDraft,setGoalDraft]=useState(''),[showQuestionnaire,setShowQuestionnaire]=useState(false),[answers,setAnswers]=useState<Record<string,number>>({});const fileInput=useRef<HTMLInputElement>(null);const t=(key:TranslationKey)=>translate(locale,key);
  const [updateStatus,setUpdateStatus]=useState<'idle'|'checking'|'latest'|'error'>('idle');
  const [showCopyright,setShowCopyright]=useState(false);
  const copyrightTrigger=useRef<HTMLButtonElement>(null);
  const closeCopyright=()=>{setShowCopyright(false);requestAnimationFrame(()=>copyrightTrigger.current?.focus());};
  const checkAndUpdate=async()=>{
    setUpdateStatus('checking');
    try{
      const published=await latestBundlePath(import.meta.env.BASE_URL);
      const current=document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
      if(current&&new URL(current,location.href).pathname===published){setUpdateStatus('latest');return;}
      // IndexedDB is the offline journal cache. Finish its write before leaving this page.
      await saveProfile(profile.sub,audit);
      if('serviceWorker' in navigator){try{const registration=await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);await registration?.update();}catch(error){console.warn('Service worker update',error);}}
      const destination=new URL(import.meta.env.BASE_URL,location.origin);
      destination.searchParams.set('time-audit-updated',String(Date.now()));
      location.replace(destination.href);
    }catch(error){console.warn('Update check',error);setUpdateStatus('error');}
  };
  const setPref=<K extends keyof AuditState['preferences']>(key:K,value:AuditState['preferences'][K])=>mutate(s=>({...s,preferences:{...s.preferences,[key]:value}}));
  const addCompass=(kind:'values'|'goals',text:string)=>{if(!text.trim())return;mutate(s=>({...s,[kind]:[...s[kind],{id:crypto.randomUUID(),text:text.trim()}]}));kind==='values'?setValueDraft(''):setGoalDraft('');};
  const exportCsv=()=>{const head=['id','startAt','endAt','durationMinutes','activityId','description','feeling','importance','urgency','valueAlignment','captureMode','recallConfidence'];const esc=(x:unknown)=>`"${String(x??'').replaceAll('"','""')}"`;const rows=activeEntries(audit.entries).map(e=>[e.id,e.startAt,e.endAt,durationMinutes(e),e.activityId,e.customText,e.feeling,e.ratings.importance,e.ratings.urgency,e.ratings.valueAlignment,e.captureMode,e.recallConfidence].map(esc).join(','));download(`time-audit-${shortDate(new Date())}.csv`,[head.join(','),...rows].join('\n'),'text/csv;charset=utf-8');};
  const importJson=async(file:File)=>{try{const value=JSON.parse(await file.text()) as Partial<AuditState>;if(!Array.isArray(value.entries)||!value.entries.every(e=>typeof e.id==='string'&&typeof e.startAt==='string'&&typeof e.endAt==='string'))throw new Error('Invalid Time Audit file');mutate(s=>withV09CategoryDefaults({...s,entries:[...new Map([...s.entries,...value.entries!].map(e=>[e.id,e])).values()],customActivities:[...new Map([...(s.customActivities??[]),...(value.customActivities??[])].map(a=>[a.id,a])).values()],categoryOverrides:{...(s.categoryOverrides??{}),...(value.categoryOverrides??{})},questionnaires:mergeQuestionnaires(s.questionnaires??[],value.questionnaires??[]),journals:mergeJournalVersions(s.journals??[],value.journals??[]),experiments:mergeExperiments(s.experiments??[],value.experiments??[]),insightFeedback:mergeInsightFeedback(s.insightFeedback??[],value.insightFeedback??[])}));}catch(e){alert(e instanceof Error?e.message:String(e));}};
  const saved=mergeQuestionnaires(audit.questionnaires??[],[]).find(q=>q.instrument==='IPIP-50'&&q.completedAt);const scores=saved?scoreIpip(saved.responses):null;const completed=Object.keys(answers).length;
  return <><SectionTitle eyebrow="PREFERENCES" title={t('settings')}/><div className="settings-grid"><section className="card settings-card"><SectionTitle eyebrow="COMPASS" title={t('valuesGoals')}/>{(['values','goals'] as const).map(kind=><div className="setting-group" key={kind}><h3>{t(kind)}</h3><div className="tag-list">{audit[kind].map(item=><span className="tag" key={item.id}>{item.text}<button aria-label="Remove" onClick={()=>mutate(s=>({...s,[kind]:s[kind].filter(x=>x.id!==item.id)}))}><X size={13}/></button></span>)}</div><div className="inline-add"><input value={kind==='values'?valueDraft:goalDraft} onChange={e=>kind==='values'?setValueDraft(e.target.value):setGoalDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCompass(kind,kind==='values'?valueDraft:goalDraft);}} placeholder={t(kind==='values'?'addValue':'addGoal')}/><button className="icon-button" onClick={()=>addCompass(kind,kind==='values'?valueDraft:goalDraft)}><Plus size={18}/></button></div></div>)}</section>
  <section className="card settings-card"><SectionTitle eyebrow="DISPLAY" title={locale==='zh-TW'?'顯示與字體':'Display & text'}/><label className="appearance-row"><span>{locale==='zh-TW'?'字體大小':'Text size'} <strong>{Math.round(fontScale*100)}%</strong></span><input type="range" min="1" max="1.5" step="0.05" value={fontScale} onChange={e=>setFontScale(Number(e.target.value))}/></label><label className="appearance-row desktop-only"><span>{locale==='zh-TW'?'側欄寬度':'Sidebar width'} <strong>{sidebarWidth}px</strong></span><input type="range" min="220" max="380" step="10" value={sidebarWidth} onChange={e=>setSidebarWidth(Number(e.target.value))}/></label><p className="hint">{locale==='zh-TW'?'在電腦上也可以拖動側欄邊緣。顯示設定會保存在這台裝置。':'On desktop, drag the sidebar edge to resize it. Display settings are saved on this device.'}</p></section>
  <section className="card settings-card"><SectionTitle eyebrow="INSTALL" title={locale==='zh-TW'?'安裝在裝置上':'Install on your device'}/><p className="hint">{locale==='zh-TW'?'安裝後可從主畫面開啟。同步資料仍需網路與 Google Drive 授權。':'Open from your home screen after installing. Sync still needs a network connection and Google Drive authorization.'}</p>{installPrompt&&<button className="primary-button" onClick={installApp}>{locale==='zh-TW'?'安裝 Time Audit':'Install Time Audit'}</button>}<p className="hint">{locale==='zh-TW'?'若沒有顯示安裝按鈕：在 iPhone Safari 點「分享」→「加入主畫面」；在電腦瀏覽器使用網址列或選單的「安裝」。':'If no install button appears: on iPhone Safari, tap Share → Add to Home Screen; on desktop, use the install option in your browser menu or address bar.'}</p></section>
  <section id="reminder-settings" className="card settings-card"><SectionTitle eyebrow="REMINDERS" title={t('reminders')}/><label className="setting-line"><span>{t('reminders')}</span><input type="checkbox" checked={audit.preferences.reminders} onChange={e=>setPref('reminders',e.target.checked)}/></label><label className="setting-line"><span>{t('reminderInterval')}</span><select value={audit.preferences.intervalMinutes} onChange={e=>setPref('intervalMinutes',Number(e.target.value))}>{[15,20,30,45,60,90,120].map(n=><option key={n} value={n}>{n} {t('minutes')}</option>)}</select></label><div className="setting-line"><span>{t('quietHours')}</span><div className="time-pair"><input type="time" value={audit.preferences.quietStart} onChange={e=>setPref('quietStart',e.target.value)}/><span>–</span><input type="time" value={audit.preferences.quietEnd} onChange={e=>setPref('quietEnd',e.target.value)}/></div></div><label className="setting-line"><span>{t('notifyPermission')}</span><input type="checkbox" checked={audit.preferences.notifications} onChange={async e=>{if(e.target.checked){if(!('Notification' in window)){alert('Notifications are unavailable');return;}const permission=await Notification.requestPermission();setPref('notifications',permission==='granted');}else setPref('notifications',false);}}/></label><p className="hint">{t('notificationHint')}</p></section>
  <section className="card settings-card"><SectionTitle eyebrow="OWNERSHIP" title={t('sync')}/><p className="hint">{profile.demo?t('previewNote'):t('privacy')}</p>{!profile.demo&&<div className="button-stack">{!token?<button className="primary-button" onClick={connectDrive}><Cloud size={17}/>{t('connectDrive')}</button>:<button className="secondary-button" onClick={syncNow}><Cloud size={17}/>{t('syncNow')}</button>}{audit.preferences.sheetId&&<a className="secondary-button" href={`https://docs.google.com/spreadsheets/d/${audit.preferences.sheetId}/edit`} target="_blank" rel="noreferrer"><FileSpreadsheet size={17}/>{t('openSheet')}</a>}</div>}{conflicts.length>0&&<div className="conflict-box"><h4>{locale==='zh-TW'?'同步衝突':'Sync conflicts'}</h4>{conflicts.map(c=><div key={c.local.id}><span>{activityName(locale,c.local,audit)} · {fmtDate(c.local.startAt,locale,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span><button onClick={()=>resolveConflict(c,'local')}>{locale==='zh-TW'?'使用本機':'Use local'}</button><button onClick={()=>resolveConflict(c,'remote')}>{locale==='zh-TW'?'使用雲端':'Use remote'}</button></div>)}</div>}<div className="button-stack"><button className="secondary-button" onClick={()=>download(`time-audit-${shortDate(new Date())}.json`,JSON.stringify(audit,null,2),'application/json')}><Download size={16}/>{t('exportJson')}</button><button className="secondary-button" onClick={exportCsv}><Download size={16}/>{t('exportCsv')}</button><button className="secondary-button" onClick={()=>fileInput.current?.click()}>{t('importJson')}</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void importJson(file);e.target.value='';}}/></div></section>
  <section className="card settings-card"><SectionTitle eyebrow="ACCOUNT" title={t('account')}/><div className="account-info"><div className="avatar">{profile.name.charAt(0)}</div><div><strong>{profile.name}</strong><small>{profile.email||t('preview')}</small></div></div><button className="text-button signout" onClick={signOut}>{t('signOut')} <ArrowRight size={15}/></button></section>
  {usageAnalyticsConfigured&&<section className="card settings-card site-usage-card"><SectionTitle eyebrow="SITE USAGE" title={locale==='zh-TW'?'網站使用統計':'Site statistics'}/><p className="hint">{locale==='zh-TW'?'網站會匿名統計開啟次數，以及儲存紀錄、編輯日記、查看分析與反思的次數；不傳送紀錄內容、日記文字或 Google 帳號。':'The site anonymously counts visits and use of recording, journal, insights and reflection. Entries, journal text and Google identity are not sent.'}</p><label className="setting-line"><span>{locale==='zh-TW'?'允許匿名使用統計':'Allow anonymous usage statistics'}</span><input type="checkbox" checked={!usageAnalyticsOptedOut()} onChange={event=>setUsageAnalyticsOptOut(!event.target.checked)}/></label>{publicUsageStatsUrl&&<><details><summary>{locale==='zh-TW'?'在這裡查看統計圖表':'View statistics here'}</summary><iframe className="usage-stats-frame" src={publicUsageStatsUrl} loading="lazy" referrerPolicy="no-referrer" title={locale==='zh-TW'?'網站使用統計圖表':'Site usage dashboard'}/></details><a className="secondary-button" href={publicUsageStatsUrl} target="_blank" rel="noreferrer">{locale==='zh-TW'?'另開統計頁 ↗':'Open statistics in a new tab ↗'}</a></>}<p className="hint">{locale==='zh-TW'?'變更後會重新載入；此選擇只保存在這台裝置。':'Changing this reloads the app; the choice is saved on this device only.'}</p></section>}
  <section className="card settings-card"><SectionTitle eyebrow="VERSION" title={`Time Audit V${APP_VERSION}版`}/><p className="hint">{locale==='zh-TW'?'V1.11版：已啟用匿名網站使用統計，可在此頁管理統計偏好。':'V1.11: Anonymous site usage statistics are available, with controls on this page.'}</p><div className="button-stack"><button className="secondary-button" disabled={updateStatus==='checking'} onClick={()=>void checkAndUpdate()}><RefreshCw size={16}/>{locale==='zh-TW'?'檢查並更新':'Check for updates'}</button></div><p className="hint" role="status">{updateStatus==='checking'?(locale==='zh-TW'?'正在檢查公開網站…':'Checking the published site…'):updateStatus==='latest'?(locale==='zh-TW'?'目前已是最新版本。':'This is the latest build.'):updateStatus==='error'?(locale==='zh-TW'?'無法檢查更新，請確認網路後重試。':'Could not check for updates. Check your connection and try again.'):(locale==='zh-TW'?'有新版時會儲存本機紀錄並重新載入；需要連上網路。':'When a new build is available, local entries are saved before reloading. Internet is required.')}</p><p className="hint"><button ref={copyrightTrigger} className="copyright-open" onClick={()=>setShowCopyright(true)}>© 2026–2027 Shu-Yen Wan（萬書言） · {locale==='zh-TW'?'版權聲明':'Copyright notice'}</button></p></section></div>
  <section className="card activity-catalog-card"><SectionTitle eyebrow="ACTIVITY CATALOG" title={locale==='zh-TW'?'活動與分類':'Activities and categories'}/><p className="hint">{locale==='zh-TW'?'紀錄保留活動 ID；這裡調整的是分析及選擇器使用的分類，既有紀錄會依新分類重新統計。':'Entries keep their activity IDs. Changing a category here updates the picker and recalculates past category totals.'}</p><details><summary>{locale==='zh-TW'?'管理活動分類':'Manage activity categories'}</summary><div className="activity-management">{[...builtInActivitiesFor(audit),...(audit.customActivities??[]).map(a=>({id:a.id,key:null,name:a.name}))].map(a=><label key={a.id}><span>{'name' in a?a.name:translate(locale,a.key)}</span><select value={categoryOf(a.id,audit.categoryOverrides)} onChange={e=>mutate(s=>({...s,categoryOverrides:{...(s.categoryOverrides??{}),[a.id]:e.target.value}}))}>{categories.map(c=><option key={c.id} value={c.id}>{t(c.key)}</option>)}</select></label>)}</div></details></section>
  <section className="card questionnaire-card"><SectionTitle eyebrow="OPTIONAL" title={t('questionnaire')} action={<button className="secondary-button compact" onClick={()=>setShowQuestionnaire(x=>!x)}>{showQuestionnaire?locale==='zh-TW'?'收起':'Close':locale==='zh-TW'?'填寫 IPIP-50':'Take IPIP-50'}<ChevronDown size={16}/></button>}/><p className="hint">{t('questionnaireInfo')} <a href="https://ipip.ori.org/" target="_blank" rel="noreferrer">IPIP public-domain item pool</a></p>{scores&&<div className="factor-grid">{scores.map((score,i)=><div key={i}><span>{factorNames[locale][i]}</span><strong>{score}/50</strong><div className="bar-track"><i style={{width:`${score/50*100}%`}}/></div></div>)}</div>}{showQuestionnaire&&<div className="questionnaire-form"><div className="questionnaire-intro"><strong>{t('ipip')}</strong><span>{completed}/50</span></div><p>{locale==='zh-TW'?'依平常的自己評估：1 非常不符合，5 非常符合。50 題全部填完才計分。':'Rate your typical self: 1 very inaccurate, 5 very accurate. All 50 items are required to score.'}</p>{ipipItems.map((item,i)=><div className="question-row" key={i}><span>{i+1}. {locale==='zh-TW'?item.zh:item.en}</span><div>{[1,2,3,4,5].map(n=><button key={n} className={answers[String(i)]===n?'selected':''} onClick={()=>setAnswers(a=>({...a,[i]:n}))}>{n}</button>)}</div></div>)}<button className="primary-button" disabled={completed!==50} onClick={()=>{const score=scoreIpip(answers);if(!score)return;mutate(s=>({...s,questionnaires:[...(s.questionnaires??[]),{id:crypto.randomUUID(),instrument:'IPIP-50',version:'public-domain-50',locale,responses:answers,completedAt:nowIso()}]}));setShowQuestionnaire(false);}}>{locale==='zh-TW'?'完成並計分':'Finish and score'}</button></div>}</section>{showCopyright&&<CopyrightDialog locale={locale} onClose={closeCopyright}/>}</>;
}

function CopyrightDialog({locale,onClose}:{locale:Locale;onClose:()=>void}){
  const closeButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    closeButton.current?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[onClose]);
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="entry-modal copyright-dialog" role="dialog" aria-modal="true" aria-labelledby="copyright-title">
    <div className="modal-head"><div><span className="overline">TIME AUDIT</span><h2 id="copyright-title">{locale==='zh-TW'?'版權聲明':'Copyright notice'}</h2></div><button ref={closeButton} className="icon-button" onClick={onClose} aria-label={locale==='zh-TW'?'關閉版權聲明':'Close copyright notice'}><X size={20}/></button></div>
    <div className="modal-body copyright-content"><p className="copyright-owner">© 2026–2027 Shu-Yen Wan（萬書言）. All rights reserved.</p><p>Time Audit 的原創程式、介面設計與網站文字由萬書言保留權利。使用者自行輸入的時間紀錄與個人內容仍屬使用者本人。</p><p>書籍、研究文獻、商標與第三方程式庫各有其權利人及適用授權；本聲明不宣稱擁有這些第三方內容。</p><h3>English</h3><p>Original Time Audit code, interface design, and site text are © 2026–2027 Shu-Yen Wan. Users retain their own journal entries and personal content. Third-party works remain subject to their respective owners and licenses.</p></div>
    <div className="modal-footer"><span/><button className="secondary-button" onClick={onClose}>{locale==='zh-TW'?'返回設定':'Back to Settings'}</button></div>
  </section></div>;
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
  const [feeling,setFeeling]=useState<number|null>(previous?.feeling??null);
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
  const allActivities=[...builtInActivitiesFor(audit).map(a=>({id:a.id,name:t(a.key)})),...(audit.customActivities??[]).filter(a=>{const equivalent=publicEquivalentForCustomName(a.name);return a.id===previous?.activityId||!equivalent||categoryOf(a.id,audit.categoryOverrides)!==categoryOf(equivalent,audit.categoryOverrides);}).map(a=>({id:a.id,name:a.name}))];
  const recent=Object.entries(entries.reduce<Record<string,{count:number;last:number}>>((map,e)=>{const personal=(audit.customActivities??[]).find(a=>a.id===e.activityId);const equivalent=personal&&publicEquivalentForCustomName(personal.name);const id=equivalent&&categoryOf(e.activityId,audit.categoryOverrides)===categoryOf(equivalent,audit.categoryOverrides)?equivalent:e.activityId;const item=map[id]??{count:0,last:0};item.count++;item.last=Math.max(item.last,Date.parse(e.updatedAt));map[id]=item;return map;},{})).filter(([id])=>id!=='other.custom'&&allActivities.some(a=>a.id===id)).sort((a,b)=>b[1].count-a[1].count||b[1].last-a[1].last).slice(0,6).map(([id])=>id);
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
    onSave({id:previous?.id??crypto.randomUUID(),startAt:fromLocalInput(start),endAt:fromLocalInput(end),activityId,customText:custom.trim(),classification:acceptedSuggestion&&suggestion?.id===activityId?{method:'rule_confirmed',confidence:suggestion.confidence,matched:acceptedSuggestion}:{method:'user',confidence:1},ratings:rating,feeling,ratingStatus:status as Entry['ratingStatus'],valueIds,goalIds,captureMode:previous?.captureMode??(initial.backfill?'backfill':'manual'),recallConfidence:initial.backfill||previous?.captureMode==='backfill'?recall:null,createdAt:previous?.createdAt??timestamp,updatedAt:timestamp,revision:(previous?.revision??0)+1,deletedAt:null},newActivity);
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
      <div className="editor-section"><h3>{locale==='zh-TW'?'如何看待這段時間':'How do you view this time?'}</h3><div className="rating-row"><div><b>{locale==='zh-TW'?'活動當下的感受':'Feeling during this activity'}</b><small>{locale==='zh-TW'?'1 非常不愉快 · 4 平淡 · 7 非常愉快；可略過':'1 very unpleasant · 4 neutral · 7 very pleasant; optional'}</small></div><div className="rating-choices">{[1,2,3,4,5,6,7].map(n=><button key={n} type="button" aria-label={`${locale==='zh-TW'?'感受':'Feeling'} ${n}`} aria-pressed={feeling===n} className={feeling===n?'selected':''} onClick={()=>setFeeling(n)}>{n}</button>)}<button type="button" className={`na-button ${feeling===null?'selected':''}`} onClick={()=>setFeeling(null)}>{locale==='zh-TW'?'略過':'Skip'}</button></div></div>{ratings.map(key=><div className="rating-row" key={key}><div><b>{t(ratingLabel[key])}</b><small>1 {t('low')} · 7 {t('high')}</small></div><div className="rating-choices">{[1,2,3,4,5,6,7].map(n=><button key={n} className={rating[key]===n?'selected':''} onClick={()=>{setRating(v=>({...v,[key]:n}));setStatus(v=>({...v,[key]:'answered'}));}}>{n}</button>)}<button className={`na-button ${status[key]==='not_applicable'?'selected':''}`} onClick={()=>{setRating(v=>({...v,[key]:null}));setStatus(v=>({...v,[key]:'not_applicable'}));}}>{locale==='zh-TW'?'略過':'N/A'}</button></div></div>)}</div>
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
