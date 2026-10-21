import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Download, ExternalLink, ShieldCheck } from 'lucide-react';
import './manual.css';

type Lang = 'zh-TW' | 'en';
type Copy = { title:string; intro:string; jump:string; back:string; download:string; logo:string; note:string; sections:{id:string;number:string;title:string;lead:string;items:{title:string;body:string}[]}[] };
const copy:Record<Lang,Copy>={
  'zh-TW':{
    title:'從記錄時間，到看見生活的方向',
    intro:'這份一頁式手冊帶你完成第一次記錄、跨裝置同步、每日回顧與每週反思。登入前就能閱讀，也可以下載 PDF、DOCX 或文字版留存。',
    jump:'開始閱讀',back:'返回 Time Audit',download:'下載 PDF 手冊',logo:'下載高解析標誌 PNG',note:'建議的起點：先連續記錄 3–7 天，再看分析。睡眠、休息與空白時段也算時間的一部分。',
    sections:[
      {id:'start',number:'01',title:'開始使用',lead:'第一次打開 App 時，先決定資料要放在哪裡。',items:[
        {title:'Google 登入',body:'在首頁選擇 Google 帳號登入。登入後，按上方的「授權同步」並同意 Google Drive 權限；授權完成才會開始跨裝置同步。若再次登入後顯示尚未連結，可再按一次授權同步。'},
        {title:'預覽模式',body:'想先試用可選「預覽」。資料只保存在目前瀏覽器，不能靠 Google Drive 跨裝置使用；清除瀏覽器資料時也可能遺失。'},
        {title:'安裝到主畫面',body:'iPhone 用 Safari 開啟網站，點「分享」→「加入主畫面」。Chrome 或 Edge 可用網址列或瀏覽器選單的安裝功能。安裝後可像 App 一樣啟動；Drive 同步仍需要網路與授權。'}]},
      {id:'record',number:'02',title:'記錄一天',lead:'以實際做的活動為主，時間可以自由調整。',items:[
        {title:'新增時段',body:'在「今天」按新增記錄，調整開始與結束時間。預設間隔只是起點，可以記錄更短、更長的活動；例如睡眠可一次記錄整段。'},
        {title:'選擇活動',body:'先點常用活動，或用搜尋找到既有活動。上方大分類方便瀏覽；實際記錄的是具獨立 ID 的活動。「工作會議」與「研究會議」各有獨立活動 ID；「研究」保留作專心研究。「家庭」包含家務、家庭相處和家庭旅遊。找不到時選「其他」新增活動，之後可在設定調整它的分類。'},
        {title:'快速評分',body:'可選填活動當下的感受，以及重要性、急迫性、價值一致感；各用 1–7 分，數字愈大表示愈強。沒有把握可以略過。描述、價值和目標連結也可依需要填寫。'},
        {title:'補記與修改',body:'「日曆」能看到有記錄與空白的時段，點日期即可補填或編輯。今天頁可左右滑動切換日期：向左看後一天，向右看前一天；桌機可用日期箭頭。'}]},
      {id:'journal',number:'03',title:'寫每天的日記',lead:'讓時間記錄成為回望一天的線索。',items:[
        {title:'自動摘要與心情',body:'「今天」下方的日記會根據當天活動產生摘要，新增後續時段時摘要也會更新。可另外寫自己的筆記，並選填 1–7 分的整日心情；筆記會自動儲存。'},
        {title:'口述輸入',body:'點麥克風依提示說話。若瀏覽器或主畫面 App 不支援網頁語音辨識，改用手機鍵盤上的麥克風。看到文字進入筆記後，再檢查辨識結果。'}]},
      {id:'insights',number:'04',title:'閱讀分析',lead:'圖表按實際分鐘數計算，而不是按記錄筆數。',items:[
        {title:'選擇時間範圍',body:'「分析」可選今天、近 3 天、7 天、30 天、半年或一年；「反思」也可調整觀察期間。先看資料品質和未記錄時數，再解讀其他圖表。'},
        {title:'看時間流向與節律',body:'時間流向顯示各類活動的時長占比。時間節律則呈現一週 7 天、一天 24 小時的分布；也可檢查工作是否落在自己設定的生活邊界之外。'},
        {title:'對照評分與感受',body:'看重要性、急迫性、價值一致感的時間分布，以及活動感受與整日心情的探索性關聯。未評分與未記錄時間會另外呈現；這些是個人回顧線索，不是心理診斷。'}]},
      {id:'reflect',number:'05',title:'把反思變成行動',lead:'每週選一個小改變，比一次重排整個人生更容易觀察。',items:[
        {title:'讀取證據卡',body:'在「反思」查看按時長整理的模式與每週回顧卡，回到來源紀錄確認它是否符合你的經驗。你也可以回饋卡片是否有用。'},
        {title:'設定一個實驗',body:'用「如果……那麼……」寫下一個可執行的做法，例如「如果晚飯後打開影集，那麼先讀書 10 分鐘」。之後比較實驗前後的記錄，再決定保留或調整。'},
        {title:'價值與目標',body:'在設定中建立自己的價值與目標，記錄時可視需要連結。目標投入只會依已有連結或可辨識的資料估算；零分鐘不一定代表沒有努力。'}]},
      {id:'data',number:'06',title:'同步、備份與隱私',lead:'自己的資料值得多一層保護。',items:[
        {title:'確認同步',body:'完成 Google Drive 授權後，可按畫面上方的同步鍵。同步時會出現進度，跨裝置使用前先確認兩邊都已同步。資料會保存在本機，並在授權後同步到自己 Google Drive 的 App 檔案。'},
        {title:'備份與還原',body:'在設定中可先同步，再在自己的 Google Drive 建立獨立 JSON 備份。選取副本先預覽筆數；還原時會先封存目前 Drive 資料。其他裝置應更新至 V1.20.1 後再同步。另可下載 JSON／CSV 到裝置或匯入 JSON。'},
        {title:'其他設定',body:'可切換繁中／英文、調整字體和側欄、設定瀏覽器開啟時的提醒、管理活動分類、填寫可選的 IPIP-50，以及檢查網站更新。'}]}
    ]
  },
  en:{
    title:'From recording time to seeing its direction',
    intro:'This one-page guide covers your first entry, cross-device sync, daily review, and weekly reflection. Read it before signing in or download the PDF, DOCX, or text version.',
    jump:'Read the guide',back:'Back to Time Audit',download:'Download PDF guide',logo:'Download high-resolution logo PNG',note:'A good start: record for 3–7 days before interpreting the charts. Sleep, rest, and unrecorded gaps are part of the picture.',
    sections:[
      {id:'start',number:'01',title:'Get started',lead:'Choose where your data should live.',items:[
        {title:'Sign in with Google',body:'Choose a Google account on the welcome screen. After signing in, use Authorize sync at the top and grant Google Drive access. Cross-device sync starts only after that authorization. If a later session shows Drive disconnected, authorize it again.'},
        {title:'Preview mode',body:'Use Preview to explore first. Preview data stays in this browser, cannot sync through Drive, and can disappear if browser storage is cleared.'},
        {title:'Install on your device',body:'On iPhone, open the site in Safari and choose Share → Add to Home Screen. In Chrome or Edge, use the address bar or browser menu to install. Drive sync still needs internet and authorization.'}]},
      {id:'record',number:'02',title:'Record your day',lead:'Log the activity you actually did and adjust the time freely.',items:[
        {title:'Add a time block',body:'On Today, add an entry and adjust its start and end. The default interval is only a starting point. A long sleep can be entered as one block.'},
        {title:'Choose an activity',body:'Pick a frequent activity or search the catalog. Categories help you browse; each saved activity has its own ID. Work meeting and Research meeting are separate activities; Research remains for focused research. Family includes chores, family time, and trips. Choose Other to add a new activity, then change its category in Settings if needed.'},
        {title:'Quick ratings',body:'Optionally rate how you felt during the activity, then its importance, urgency, and alignment with your values. Each scale runs from 1 to 7, with higher meaning more. Skip any uncertain rating; add a description or link values and goals only when helpful.'},
        {title:'Backfill and edit',body:'The Calendar shows entries and gaps. Open a day to fill missed time or edit an entry. On Today, swipe left to move forward one day and right to move back; desktop users can use the date arrows.'}]},
      {id:'journal',number:'03',title:'Keep a daily journal',lead:'Let the timeline prompt a more personal reflection.',items:[
        {title:'Summary and mood',body:'The journal on Today includes an automatically updated activity summary. Add your own note and, if you wish, a 1–7 daily mood rating. Your note saves automatically.'},
        {title:'Dictation',body:'Tap the microphone and speak. If speech recognition is unavailable in your browser or home-screen app, use the microphone on your phone keyboard instead. Review the transcribed text before leaving.'}]},
      {id:'insights',number:'04',title:'Read the insights',lead:'Charts use actual duration, not the number of entries.',items:[
        {title:'Choose a window',body:'Insights supports today, the last 3, 7, or 30 days, six months, and one year. Reflection has adjustable ranges too. Check data quality and unrecorded hours before interpreting other charts.'},
        {title:'Allocation and rhythm',body:'Time allocation shows duration by category. The weekly rhythm covers seven days and 24 hours, and the boundary view compares recorded work with the hours you set.'},
        {title:'Ratings and feelings',body:'Explore time spent across importance, urgency, and value alignment ratings, plus exploratory links between activity feelings and daily mood. Unrated and unrecorded time stay visible. These are prompts for reflection, not diagnoses.'}]},
      {id:'reflect',number:'05',title:'Turn reflection into action',lead:'Try one small change each week and observe what happens.',items:[
        {title:'Review evidence cards',body:'Reflection highlights time-weighted patterns and weekly review cards. Open the source entries to judge whether a pattern fits your experience, then mark cards that were useful.'},
        {title:'Run an if–then experiment',body:'Write one concrete plan, such as “If I start watching a show after dinner, then I will read for ten minutes first.” Compare records before and after, then keep or revise the plan.'},
        {title:'Values and goals',body:'Create your own values and goals in Settings and link them to entries when useful. Goal time depends on available links or recognizable data; zero minutes does not necessarily mean zero effort.'}]},
      {id:'data',number:'06',title:'Sync, backup, and privacy',lead:'Keep an extra copy of what matters to you.',items:[
        {title:'Check sync',body:'After Google Drive authorization, use the sync button in the top bar. A progress indicator appears. Before switching devices, make sure both have synchronized. Data is stored locally and, when authorized, in your own Google Drive app files.'},
        {title:'Backup and restore',body:'In Settings, sync and create independent JSON copies in your own Google Drive. Preview a copy before restoring; current Drive files are archived first. Update other devices to V1.20.1 before syncing after a restore. Local JSON/CSV downloads and JSON import remain available.'},
        {title:'More settings',body:'Switch between Traditional Chinese and English, change font and sidebar size, set reminders while the browser is open, manage activity categories, take the optional IPIP-50, and check for updates.'}]}
    ]
  }
};

function Manual(){
  const [lang,setLang]=useState<Lang>(()=>{try{return localStorage.getItem('timeAuditLocale')==='en'?'en':'zh-TW';}catch{return 'zh-TW';}});
  const c=copy[lang];
  const change=(next:Lang)=>{setLang(next);try{localStorage.setItem('timeAuditLocale',next);}catch{/* A downloaded file may not have storage access. */}document.documentElement.lang=next==='zh-TW'?'zh-Hant':'en';document.title=`${next==='zh-TW'?'使用手冊':'User guide'} · Time Audit`;};
  const base=import.meta.env.BASE_URL;
  const offlineAssets=(window as Window & {__TA_OFFLINE_ASSETS__?:Record<string,string>}).__TA_OFFLINE_ASSETS__;
  const asset=(name:string)=>offlineAssets?.[name]??`${base}${name}`;
  const home=offlineAssets?'https://sywan.github.io/TimeAudit/':base;
  return <div className="manual-page">
    <header className="manual-top"><a className="manual-brand" href={home} aria-label="Time Audit"><img src={asset('logo-v108.svg')} alt=""/><strong>Time Audit</strong><span>GUIDE</span></a><div className="manual-actions"><div className="manual-language" aria-label="Language"><button className={lang==='zh-TW'?'active':''} onClick={()=>change('zh-TW')} aria-pressed={lang==='zh-TW'}>繁中</button><button className={lang==='en'?'active':''} onClick={()=>change('en')} aria-pressed={lang==='en'}>EN</button></div><a className="manual-back" href={home}><ArrowLeft size={17}/><span>{c.back}</span></a></div></header>
    <main><section className="manual-hero"><div className="manual-hero-copy"><span className="manual-eyebrow">TIME AUDIT · USER GUIDE</span><h1>{c.title}</h1><p>{c.intro}</p><div className="manual-hero-links"><a className="manual-primary" href="#start">{c.jump}<ArrowRight size={17}/></a><a className="manual-outline" href={asset(lang==='zh-TW'?'USER-MANUAL.zh-TW.pdf':'USER-MANUAL.en.pdf')} download><Download size={17}/>{c.download}</a></div></div><div className="manual-hero-mark"><img src={asset('logo-v108.svg')} alt="Time Audit logo"/><span>V1.20.1</span></div></section>
    <div className="manual-layout"><nav className="manual-toc" aria-label={lang==='zh-TW'?'手冊目錄':'Guide contents'}><span className="manual-eyebrow">{lang==='zh-TW'?'閱讀目錄':'CONTENTS'}</span>{c.sections.map(s=><a key={s.id} href={`#${s.id}`}><small>{s.number}</small>{s.title}</a>)}</nav><div className="manual-body"><aside className="manual-note"><CheckCircle2 size={21}/><p>{c.note}</p></aside>{c.sections.map(section=><section className="manual-section" id={section.id} key={section.id}><div className="manual-heading"><span>{section.number}</span><div><h2>{section.title}</h2><p>{section.lead}</p></div></div><div className="manual-grid">{section.items.map(item=><article key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div></section>)}<section className="manual-resource"><div><span className="manual-eyebrow">RESOURCES</span><h2>{lang==='zh-TW'?'把標誌與手冊帶走':'Take the logo and guide with you'}</h2><p>{lang==='zh-TW'?'高解析 PNG 為 4096 × 4096 像素，背景四角透明；SVG 保留向量品質。':'The PNG is 4096 × 4096 pixels with transparent corners; SVG preserves vector quality.'}</p></div><div className="manual-resource-links"><a href={asset('time-audit-logo-4096.png')} download="time-audit-logo-4096.png"><Download size={17}/>{c.logo}</a><a href={asset('logo-v108.svg')} download="logo-v108.svg"><ExternalLink size={17}/>SVG</a><a href={asset(lang==='zh-TW'?'USER-MANUAL.zh-TW.pdf':'USER-MANUAL.en.pdf')} download><Download size={17}/>{c.download}</a><a href={asset(lang==='zh-TW'?'USER-MANUAL.zh-TW.docx':'USER-MANUAL.en.docx')} download><Download size={17}/>{lang==='zh-TW'?'下載 DOCX 手冊':'Download DOCX guide'}</a><a href={asset(lang==='zh-TW'?'USER-MANUAL.md':'USER-MANUAL.en.md')} download><BookOpen size={17}/>{lang==='zh-TW'?'下載 Markdown 文字版':'Download Markdown text'}</a><a href={asset('Time-Audit-Manual-Offline.html')} download="Time-Audit-Manual-Offline.html"><Download size={17}/>{lang==='zh-TW'?'下載離線 HTML':'Download offline HTML'}</a><a href={asset('Time-Audit-Downloads.zip')} download="Time-Audit-Downloads.zip"><Download size={17}/>{lang==='zh-TW'?'下載全部檔案':'Download all files'}</a></div></section><footer className="manual-footer"><ShieldCheck size={16}/><span>© 2026–2027 Shu-Yen Wan（萬書言）</span><a href={home}>{c.back} ↗</a></footer></div></div></main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Manual/></React.StrictMode>);
