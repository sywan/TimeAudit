// Site usage is separate from each person's Time Audit records. Never pass
// entries, journal text, Google identities, or answers to this tracker.
const websiteId=(import.meta.env.VITE_UMAMI_WEBSITE_ID as string|undefined)?.trim()??'';
const configuredShareUrl=(import.meta.env.VITE_UMAMI_SHARE_URL as string|undefined)?.trim()??'';
const optOutKey='timeAuditUsageAnalyticsOptOut';

export const usageAnalyticsConfigured=Boolean(websiteId);
export const usageAnalyticsOptedOut=()=>localStorage.getItem(optOutKey)==='true';
export const publicUsageStatsUrl=(()=>{
  try{
    const url=new URL(configuredShareUrl);
    return url.protocol==='https:'&&url.pathname.startsWith('/share/')?url.href:'';
  }catch{return '';}
})();

const mayTrack=()=>import.meta.env.PROD&&location.hostname==='sywan.github.io'&&Boolean(websiteId)&&!usageAnalyticsOptedOut()&&navigator.doNotTrack!=='1'&&navigator.doNotTrack!=='yes';

export function setUsageAnalyticsOptOut(value:boolean){
  localStorage.setItem(optOutKey,String(value));
  location.reload();
}

export function initUsageAnalytics(){
  if(!mayTrack()||document.getElementById('time-audit-usage-analytics'))return;
  const script=document.createElement('script');
  script.id='time-audit-usage-analytics';
  script.src='https://cloud.umami.is/script.js';
  script.defer=true;
  script.dataset.websiteId=websiteId;
  script.dataset.domains='sywan.github.io';
  script.dataset.excludeSearch='true';
  script.dataset.excludeHash='true';
  script.dataset.doNotTrack='true';
  document.head.appendChild(script);
}

type UsageEvent='entry_saved'|'journal_edited'|'insights_opened'|'reflection_opened';

export function trackUsage(event:UsageEvent){
  if(!mayTrack())return;
  const trackedWindow=window as Window & {umami?:{track:(name:string)=>void}};
  trackedWindow.umami?.track(event);
}
