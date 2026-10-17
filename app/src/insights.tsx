import {useState} from 'react';
import {BarChart3, CalendarDays, Compass, Info} from 'lucide-react';
import {categoryOf, getGaps, overlapMinutes, type AuditState, type Entry, type RatingKey} from './types.ts';
import {categories, categoryMeta, translate, type Locale} from './i18n.ts';
import {insightWindow, type InsightRange} from './insightRange.ts';
import {dataQuality,feelingByCategory,moodAssociations,weeklyRhythm,weeklyRhythmComposition,workOutsideHours} from './auditAnalytics.ts';

type Section='allocation'|'ratings'|'decisions'|'goals';
const ratingKeys:RatingKey[]=['importance','urgency','valueAlignment'];
const ratingLabels:Record<RatingKey,'importance'|'urgency'|'alignment'>={importance:'importance',urgency:'urgency',valueAlignment:'alignment'};
const share=(part:number,whole:number)=>whole?Math.round(part/whole*100):0;
const duration=(minutes:number,locale:Locale)=>minutes<5?`${Math.round(minutes)} ${locale==='zh-TW'?'分鐘':'min'}`:`${(minutes/60).toFixed(1)} ${locale==='zh-TW'?'小時':'h'}`;

function SectionHeader({eyebrow,title,action,className=''}:{eyebrow:string;title:string;action?:React.ReactNode;className?:string}){
  return <div className={`section-head ${className}`}><div><span className="overline">{eyebrow}</span><h2>{title}</h2></div>{action}</div>;
}

function Explanation({id,lines,locale,goCalendar}:{id:Section;lines:string[];locale:Locale;goCalendar:()=>void}){
  return <div id={`explain-${id}`} className="insight-explanation" role="note"><strong>{locale==='zh-TW'?'資料怎麼看':'How to read this'}</strong><p className="insight-premise">{locale==='zh-TW'?'以下依你的紀錄與主觀評分提供觀察線索；不能單憑這些數字判定客觀效益、心理界線或因果關係。':'These observations use your entries and subjective ratings. The numbers alone cannot establish objective benefits, personal boundaries, or causes.'}</p>{lines.map((line,index)=><p key={index}>{line}</p>)}{id==='goals'&&<button className="text-button" onClick={goCalendar}><CalendarDays size={15}/>{locale==='zh-TW'?'到日曆為紀錄關聯目標':'Open Calendar to link entries to a goal'}</button>}</div>;
}

export default function InsightsPage({audit,entries,locale,goCalendar,mutate}:{audit:AuditState;entries:Entry[];locale:Locale;goCalendar:()=>void;mutate:(fn:(s:AuditState)=>AuditState)=>void}){
  const [range,setRange]=useState<InsightRange>('7d');
  const [open,setOpen]=useState<Section|null>(null);
  const [rhythmCategory,setRhythmCategory]=useState('all');
  const [start,end]=insightWindow(range,new Date());
  const included=entries.filter(entry=>overlapMinutes(entry,start,end)>0);
  const quality=dataQuality(included,start,end);
  const rhythm=weeklyRhythm(included,audit,start,end,rhythmCategory);
  const rhythmComposition=weeklyRhythmComposition(included,audit,start,end);
  const rhythmPeak=Math.max(1,...rhythm.flat());
  const rhythmCategories=new Set(rhythmComposition.flat(2).map(segment=>segment.category));
  const workStart=audit.preferences.workStart??'09:00';
  const workEnd=audit.preferences.workEnd??'17:00';
  const outsideWork=workOutsideHours(included,audit,start,end,workStart,workEnd);
  const feelings=feelingByCategory(included,audit,start,end);
  const moodByDay=new Map<string,NonNullable<AuditState['journals']>[number]>();
  for(const journal of audit.journals??[]){const old=moodByDay.get(journal.day);if(!old||journal.updatedAt>old.updatedAt)moodByDay.set(journal.day,journal);}
  const dailyMoods=[...moodByDay.values()].filter(j=>j.mood!=null&&j.mood>=1&&j.mood<=7&&new Date(`${j.day}T12:00:00`).getTime()>=start&&new Date(`${j.day}T12:00:00`).getTime()<end);
  const moodLinks=moodAssociations(included,dailyMoods,audit,categories.map(c=>c.id)).filter(item=>item.comparable);
  const totalsMap=new Map<string,number>();
  for(const entry of included){const category=categoryOf(entry.activityId,audit.categoryOverrides);totalsMap.set(category,(totalsMap.get(category)??0)+overlapMinutes(entry,start,end));}
  const totals=[...totalsMap].sort((a,b)=>b[1]-a[1]);
  const total=totals.reduce((sum,[,minutes])=>sum+minutes,0);
  const max=Math.max(...totals.map(([,minutes])=>minutes),1);
  const gaps=getGaps(entries,start,end);
  const missing=gaps.reduce((sum,[a,b])=>sum+(b-a)/60000,0);
  const elapsed=(end-start)/60000;
  const covered=Math.max(0,elapsed-missing);
  const coverage=share(covered,elapsed);
  const coverageLabel=coverage===0&&covered>0?(locale==='zh-TW'?'少於 1%':'<1%'):`${coverage}%`;
  const t=(key:Parameters<typeof translate>[1])=>translate(locale,key);
  const quadrants=[
    {id:'important-urgent',zh:'重要且急迫',en:'Important & urgent',test:(e:Entry)=>(e.ratings.importance??0)>=5&&(e.ratings.urgency??0)>=5},
    {id:'important-calm',zh:'重要但不急',en:'Important, not urgent',test:(e:Entry)=>(e.ratings.importance??0)>=5&&(e.ratings.urgency??8)<=3},
    {id:'less-urgent',zh:'較不重要但急迫',en:'Less important, urgent',test:(e:Entry)=>(e.ratings.importance??8)<=3&&(e.ratings.urgency??0)>=5},
    {id:'less-calm',zh:'較不重要且不急',en:'Less important, not urgent',test:(e:Entry)=>(e.ratings.importance??8)<=3&&(e.ratings.urgency??8)<=3},
  ].map(item=>({...item,minutes:included.filter(item.test).reduce((sum,e)=>sum+overlapMinutes(e,start,end),0)}));
  const goalTimes=audit.goals.map(goal=>({goal,minutes:included.filter(e=>e.goalIds.includes(goal.id)).reduce((sum,e)=>sum+overlapMinutes(e,start,end),0)}));
  const ratingData=ratingKeys.map(key=>{
    const buckets=Array.from({length:7},(_,index)=>included.reduce((sum,e)=>sum+(e.ratings[key]===index+1?overlapMinutes(e,start,end):0),0));
    return {key,buckets,rated:buckets.reduce((a,b)=>a+b,0),high:buckets.slice(4).reduce((a,b)=>a+b,0)};
  });
  const classified=quadrants.reduce((sum,q)=>sum+q.minutes,0);
  const faithValue=audit.values.find(value=>/信仰|神|靈修|禱告|faith|spiritual|prayer|god/i.test(value.text));
  const linkedValues=audit.values.map(value=>({value,minutes:included.filter(e=>e.valueIds.includes(value.id)).reduce((sum,e)=>sum+overlapMinutes(e,start,end),0)})).sort((a,b)=>b.minutes-a.minutes);
  const notes:Record<Section,string[]>={allocation:[],ratings:[],decisions:[],goals:[]};
  if(!total)notes.allocation.push(locale==='zh-TW'?'這段期間還沒有活動紀錄；先記錄或補登，才能比較時間流向。':'There are no activity entries in this period yet. Record or backfill time before comparing categories.');
  else{
    const [leading,minutes]=totals[0];
    notes.allocation.push(locale==='zh-TW'?`已記錄的 ${duration(total,locale)} 中，「${t(categoryMeta(leading).key)}」最多：${duration(minutes,locale)}，占已記錄活動時間 ${share(minutes,total)}%。「休息」包含睡眠。`:`Of ${duration(total,locale)} recorded, ${t(categoryMeta(leading).key)} is largest at ${duration(minutes,locale)} (${share(minutes,total)}% of recorded activity time). Rest includes sleep.`);
    if(faithValue){const faithMinutes=totalsMap.get('faith')??0;notes.allocation.push(locale==='zh-TW'?`你列出的價值「${faithValue.text}」可與信仰活動對照：這段期間記錄了 ${duration(faithMinutes,locale)}，占已記錄活動 ${share(faithMinutes,total)}%。時間比重不能單獨判定是否足夠；可再對照你希望的頻率與實際感受。`:`Your value “${faithValue.text}” can be compared with Faith activities: ${duration(faithMinutes,locale)}, ${share(faithMinutes,total)}% of recorded activity time. Time alone cannot say whether it is enough; compare it with your desired rhythm and experience.`);}
    const linked=linkedValues.find(item=>item.minutes>0);
    if(linked)notes.allocation.push(locale==='zh-TW'?`你明確關聯到價值「${linked.value.text}」的紀錄共有 ${duration(linked.minutes,locale)}；沒有關聯的活動仍可能有價值。`:`Entries explicitly linked to “${linked.value.text}” total ${duration(linked.minutes,locale)}. Unlinked activities may still matter.`);
    else if(audit.values.length)notes.allocation.push(locale==='zh-TW'?'你已設定個人價值，但尚未把這段期間的紀錄關聯到價值；目前只能依活動分類觀察，不能推定你的價值是否實現。':'You have personal values, but no entries in this period are linked to them. Categories alone cannot establish whether those values were fulfilled.');
  }
  if(coverage<80)notes.allocation.push(locale==='zh-TW'?`這段期間已過時間的覆蓋率為 ${coverageLabel}；未記錄的時間可能改變排序與比重。`:`Coverage of elapsed time is ${coverageLabel}; unrecorded time could change the ranking and shares.`);
  for(const item of ratingData){
    if(item.rated)notes.ratings.push(locale==='zh-TW'?`在已評「${t(ratingLabels[item.key])}」的 ${duration(item.rated,locale)} 中，5–7 分占 ${share(item.high,item.rated)}%。`:`Among ${duration(item.rated,locale)} rated for ${t(ratingLabels[item.key])}, ${share(item.high,item.rated)}% received 5–7.`);
    else notes.ratings.push(locale==='zh-TW'?`「${t(ratingLabels[item.key])}」尚無評分，無法解讀其分布。`:`${t(ratingLabels[item.key])} has no ratings to interpret.`);
  }
  notes.ratings.push(locale==='zh-TW'?'可對照重要性與價值一致感的高分時間，看看兩者是否都集中在你重視的活動。':'Compare high-importance and high-alignment time to see whether both cluster around activities you value.');
  if(classified){const leading=quadrants.reduce((a,b)=>a.minutes>=b.minutes?a:b);notes.decisions.push(locale==='zh-TW'?`在可歸入四象限的 ${duration(classified,locale)} 中，「${leading.zh}」最多，占 ${share(leading.minutes,classified)}%。中間分數與未評時段不在四象限內。`:`Among ${duration(classified,locale)} classifiable into the four quadrants, ${leading.en} is largest (${share(leading.minutes,classified)}%). Middle and unrated time is excluded.`);}
  else notes.decisions.push(locale==='zh-TW'?'目前沒有同時具備重要性與急迫性有效評分的時段，不能比較四象限。':'There are no periods with usable scores for both importance and urgency yet.');
  if(quadrants[1].minutes)notes.decisions.push(locale==='zh-TW'?`「重要但不急」有 ${duration(quadrants[1].minutes,locale)}。你可以回看這些時段是否有足夠空間投入長期重視的事。`:`Important but not urgent time totals ${duration(quadrants[1].minutes,locale)}. Review whether this gave you room for longer-term priorities.`);
  if(quadrants[2].minutes)notes.decisions.push(locale==='zh-TW'?`「較不重要但急迫」有 ${duration(quadrants[2].minutes,locale)}；可回看這些時段的期限、責任與外部要求。`:`Less important but urgent time totals ${duration(quadrants[2].minutes,locale)}. Review the deadlines, responsibilities, and outside requests for those periods.`);
  if(!goalTimes.length)notes.goals.push(locale==='zh-TW'?'尚未設定目標。先在設定加入目標，再於記錄時選擇相關目標。':'No goals are set yet. Add a goal in Settings, then link relevant entries to it.');
  for(const {goal,minutes} of goalTimes.slice(0,4))notes.goals.push(locale==='zh-TW'?`「${goal.text}」已明確關聯 ${duration(minutes,locale)}${total?`，占已記錄活動 ${share(minutes,total)}%`:''}。${minutes?'這是投入時間，不等於目標已完成。':'零分鐘表示目前沒有紀錄關聯此目標，不表示沒有進展。'}`:`“${goal.text}” has ${duration(minutes,locale)} explicitly linked${total?` (${share(minutes,total)}% of recorded activity time)`:''}. ${minutes?'Time spent does not prove the goal was achieved.':'Zero means no entry is linked, not that no progress happened.'}`);
  if(goalTimes.length>4)notes.goals.push(locale==='zh-TW'?`另有 ${goalTimes.length-4} 個目標未逐項顯示於此，可查看下方圖表。`:`${goalTimes.length-4} more goals appear in the chart below.`);
  notes.goals.push(locale==='zh-TW'?'目標文字不會與活動名稱自動對字或推斷成果。像「減少拖延」是結果型目標，可先決定哪些具體時段（例如開始原本延後的任務）算投入，再到日曆點選紀錄並勾選目標。':'Goal text is not matched automatically to activity names or used to infer outcomes. For a goal such as “reduce procrastination,” decide which concrete periods count, then open an entry in Calendar and link the goal.');
  const info=(section:Section)=><button className={`insight-info ${open===section?'active':''}`} title={locale==='zh-TW'?'查看這項分析的解讀':'Interpret this analysis'} aria-label={locale==='zh-TW'?`解讀${section==='allocation'?t('totalByCategory'):section==='ratings'?t('valueChart'):section==='decisions'?'重要與急迫':'目標投入'}`:`Interpret ${section}`} aria-expanded={open===section} aria-controls={`explain-${section}`} onClick={()=>setOpen(current=>current===section?null:section)}><Info size={17}/></button>;
  const explanation=(section:Section)=>open===section?<Explanation id={section} lines={notes[section]} locale={locale} goCalendar={goCalendar}/>:null;
  const options:Array<{id:InsightRange;zh:string;en:string}>=[{id:'today',zh:'今天',en:'Today'},{id:'7d',zh:'7 天',en:'7 days'},{id:'30d',zh:'30 天',en:'30 days'},{id:'6m',zh:'半年',en:'6 months'},{id:'1y',zh:'一年',en:'1 year'}];
  return <><SectionHeader className="insights-header" eyebrow="INSIGHTS" title={locale==='zh-TW'?'看見時間的分配':'See your time allocation'} action={<div className="segmented insight-range" role="group" aria-label={locale==='zh-TW'?'分析期間':'Analysis period'}>{options.map(option=><button key={option.id} className={range===option.id?'active':''} aria-pressed={range===option.id} onClick={()=>setRange(option.id)}>{locale==='zh-TW'?option.zh:option.en}</button>)}</div>}/>
    <div className="stat-grid"><div className="stat-card"><span>{t('recorded')}</span><strong>{duration(total,locale)}</strong><small>{included.length} {locale==='zh-TW'?'筆紀錄':'entries'}</small></div><div className="stat-card"><span>{t('coverage')}</span><strong>{coverageLabel}</strong><small>{locale==='zh-TW'?'已過時間的紀錄比例':'Of elapsed time'}</small></div><div className="stat-card"><span>{t('unknown')}</span><strong>{duration(missing,locale)}</strong><small>{locale==='zh-TW'?'未納入活動分析':'Excluded from activity analysis'}</small></div></div>
    <section className="card audit-quality"><SectionHeader eyebrow="DATA QUALITY" title={locale==='zh-TW'?'資料品質':'Data quality'}/><div className="quality-grid"><div><small>{locale==='zh-TW'?'已記錄／已過時間':'Recorded / elapsed'}</small><strong>{duration(quality.recorded,locale)} / {duration(quality.windowMinutes,locale)}</strong><span>{Math.round(quality.coverage*100)}% {t('coverage')}</span></div><div><small>{locale==='zh-TW'?'未記錄':'Unrecorded'}</small><strong>{duration(quality.missing,locale)}</strong></div><div><small>{locale==='zh-TW'?'補登':'Backfilled'}</small><strong>{duration(quality.backfill,locale)}</strong></div><div><small>{locale==='zh-TW'?'低回憶信心':'Low recall confidence'}</small><strong>{duration(quality.lowRecall,locale)}</strong></div></div><p className="hint">{locale==='zh-TW'?`工作日有紀錄 ${quality.weekday.covered}/${quality.weekday.days} 天 · 週末有紀錄 ${quality.weekend.covered}/${quality.weekend.days} 天 · 重疊紀錄 ${duration(quality.overlap,locale)}`:`Days with entries: weekdays ${quality.weekday.covered}/${quality.weekday.days}, weekends ${quality.weekend.covered}/${quality.weekend.days} · overlapping time ${duration(quality.overlap,locale)}`}</p><div className="quality-ratings">{ratingKeys.map(key=><span key={key}>{t(ratingLabels[key])}：{duration(quality.rated[key],locale)}</span>)}<span>{locale==='zh-TW'?'活動感受':'Activity feeling'}：{duration(quality.feeling,locale)}</span></div>{quality.coverage<.6&&<p className="quality-caution">{locale==='zh-TW'?'此期間紀錄較少，以下圖表只代表已記錄時間；先補登再比較。':'Coverage is limited. Charts below describe recorded time only; backfill before comparing.'}</p>}</section>
    <section className="card rhythm-card">
      <SectionHeader eyebrow="RHYTHM" title={locale==='zh-TW'?'時間節律與生活邊界':'Time rhythm and boundaries'} action={<select aria-label={locale==='zh-TW'?'選擇活動分類':'Choose category'} value={rhythmCategory} onChange={e=>setRhythmCategory(e.target.value)}><option value="all">{locale==='zh-TW'?'全部活動':'All activities'}</option>{categories.map(c=><option key={c.id} value={c.id}>{t(c.key)}</option>)}</select>}/>
      <div className="rhythm-scroll"><div className="rhythm-map">
        <span/>
        <div className="rhythm-days">{(locale==='zh-TW'?['一','二','三','四','五','六','日']:['M','T','W','T','F','S','S']).map((label,i)=><span key={i}>{label}</span>)}</div>
        {Array.from({length:24},(_,hour)=><div className="rhythm-line" key={hour}>
          <small>{String(hour).padStart(2,'0')}</small>
          {rhythm.map((day,index)=>{
            const segments=rhythmCategory==='all'?rhythmComposition[index][hour]:day[hour]>0?[{category:rhythmCategory,minutes:day[hour]}]:[];
            const breakdown=segments.map(segment=>`${t(categoryMeta(segment.category).key)} ${duration(segment.minutes,locale)}`).join(' · ');
            const label=`${locale==='zh-TW'?'週':'Day'} ${index+1} ${String(hour).padStart(2,'0')}:00 · ${duration(day[hour],locale)}${breakdown?` · ${breakdown}`:''}`;
            return <button key={index} className="rhythm-cell" type="button" title={label} aria-label={label} onClick={goCalendar}>{segments.map(segment=><span key={segment.category} className="rhythm-segment" aria-hidden="true" style={{width:`${segment.minutes/rhythmPeak*100}%`,background:categoryMeta(segment.category).color}}/>)}</button>;
          })}
        </div>)}
      </div></div>
      {rhythmCategory==='all'&&rhythmCategories.size>0&&<div className="rhythm-legend" aria-label={locale==='zh-TW'?'活動分類顏色':'Activity category colours'}>{categories.filter(category=>rhythmCategories.has(category.id)).map(category=><span key={category.id}><i style={{background:category.color}}/>{t(category.key)}</span>)}</div>}
      <div className="work-hours"><span>{locale==='zh-TW'?'參考工作時段（每日）':'Reference work hours (daily)'}</span><label><span>{locale==='zh-TW'?'起':'From'}</span><input type="time" value={workStart} onChange={e=>{const value=e.target.value;if(value&&value!==workEnd)mutate(s=>({...s,preferences:{...s.preferences,workStart:value}}));}}/></label><label><span>{locale==='zh-TW'?'迄':'To'}</span><input type="time" value={workEnd} onChange={e=>{const value=e.target.value;if(value&&value!==workStart)mutate(s=>({...s,preferences:{...s.preferences,workEnd:value}}));}}/></label></div>
      <p className="hint">{locale==='zh-TW'?`在自選時段 ${workStart}–${workEnd} 外記錄的工作：${duration(outsideWork.minutes,locale)}，分布於 ${outsideWork.days} 天。是否符合你的生活界線由你判斷。`:`Work recorded outside your ${workStart}–${workEnd} window: ${duration(outsideWork.minutes,locale)} across ${outsideWork.days} days. Only you can judge whether that fits your boundaries.`}</p>
      <p className="hint">{locale==='zh-TW'?'每格依實際記錄分鐘與分類上色；跨小時會拆開，重疊時段只計一次。較長期間是多週累計；點格子可到日曆回看。':'Cells use category colours and actual recorded minutes. Long entries split by hour; overlaps count once. Longer periods sum multiple weeks. Tap a cell to review Calendar.'}</p>
    </section>
    <div className="insight-layout"><section className="card"><SectionHeader eyebrow="ALLOCATION" title={t('totalByCategory')} action={info('allocation')}/>{totals.length?<div className="bar-list">{totals.map(([category,minutes])=><div className="bar-row" key={category}><div><span>{t(categoryMeta(category).key)}</span><b>{duration(minutes,locale)} <small>{share(minutes,total)}%</small></b></div><div className="bar-track"><i style={{width:`${minutes/max*100}%`,background:categoryMeta(category).color}}/></div></div>)}</div>:<div className="empty-state"><BarChart3 size={30}/>{t('noData')}</div>}{explanation('allocation')}</section>
      <section className="card"><SectionHeader eyebrow="RATINGS" title={t('valueChart')} action={info('ratings')}/><div className="rating-charts">{ratingData.map(item=>{const peak=Math.max(...item.buckets,1);return <div className="rating-chart" key={item.key}><div className="rating-chart-head"><b>{t(ratingLabels[item.key])}</b><small>{duration(item.rated,locale)} {t('reportedMinutes')} · {duration(total-item.rated,locale)} {t('unratedMinutes')}</small></div><div className="rating-bars">{item.buckets.map((minutes,index)=><div key={index} title={`${index+1}: ${duration(minutes,locale)}`}><i style={{height:`${Math.max(minutes/peak*100,minutes?4:0)}%`}}/><span>{index+1}</span></div>)}</div></div>;})}</div>{explanation('ratings')}</section></div>
    <div className="insight-layout extra-insights"><section className="card"><SectionHeader eyebrow="DECISIONS" title={locale==='zh-TW'?'重要 × 急迫':'Importance × urgency'} action={info('decisions')}/><div className="quadrant-grid">{quadrants.map(q=><div key={q.id}><span>{locale==='zh-TW'?q.zh:q.en}</span><strong>{duration(q.minutes,locale)}</strong></div>)}</div><p className="hint">{locale==='zh-TW'?'只統計兩題都有評分且屬於 1–3 或 5–7 的時段；中間值與未評另外保留。':'Includes time with both ratings in 1–3 or 5–7; middle and unrated time stay outside the quadrants.'}</p>{explanation('decisions')}</section>
      <section className="card"><SectionHeader eyebrow="GOALS" title={locale==='zh-TW'?'目標投入':'Time linked to goals'} action={info('goals')}/>{goalTimes.length?<div className="bar-list">{goalTimes.map(({goal,minutes})=><div className="bar-row" key={goal.id}><div><span>{goal.text}</span><b>{duration(minutes,locale)}</b></div><div className="bar-track"><i style={{width:`${total?minutes/total*100:0}%`}}/></div></div>)}</div>:<div className="empty-state"><Compass size={28}/>{locale==='zh-TW'?'可先在設定中加入目標，記錄時再關聯。':'Add goals in Settings, then link them to entries.'}</div>}<p className="hint">{locale==='zh-TW'?'未關聯目標的時間不等於沒有價值。':'Time without a linked goal is not necessarily less valuable.'}</p>{explanation('goals')}</section></div>
    <section className="card feeling-insights"><SectionHeader eyebrow="FEELING" title={locale==='zh-TW'?'活動感受與每日心情':'Activity feelings and daily mood'}/><p className="hint">{locale==='zh-TW'?'1 非常不愉快，4 平淡，7 非常愉快。活動當下感受按時長加權；每日心情是一日一筆，兩者不混算，也不代表因果。':'1 very unpleasant, 4 neutral, 7 very pleasant. Activity feelings are weighted by duration; daily mood has one score per day. These are separate and do not establish cause.'}</p>{feelings.length?<div className="feeling-list">{feelings.map(item=><div key={item.category}><span>{t(categoryMeta(item.category).key)}</span><b>{item.average.toFixed(1)} / 7</b><small>{duration(item.minutes,locale)} · {item.entries} {locale==='zh-TW'?'筆':'entries'}</small></div>)}</div>:<p className="hint">{locale==='zh-TW'?'尚無已評感受的活動。':'No rated activity feelings yet.'}</p>}<p className="hint">{locale==='zh-TW'?`每日心情：${dailyMoods.length} 天已評${dailyMoods.length?`，平均 ${(dailyMoods.reduce((sum,j)=>sum+(j.mood??0),0)/dailyMoods.length).toFixed(1)} / 7`:''}。`:`Daily mood: ${dailyMoods.length} rated days${dailyMoods.length?`, average ${(dailyMoods.reduce((sum,j)=>sum+(j.mood??0),0)/dailyMoods.length).toFixed(1)} / 7`:''}.`}</p><h3 className="feeling-subtitle">{locale==='zh-TW'?'有／無活動的日心情對照':'Daily mood with and without activities'}</h3>{moodLinks.length?<div className="feeling-list">{moodLinks.map(item=><div key={item.category}><span>{t(categoryMeta(item.category).key)}</span><b>{item.withAverage?.toFixed(1)} / {item.withoutAverage?.toFixed(1)}</b><small>{locale==='zh-TW'?`有 ${item.withDays} 天／無 ${item.withoutDays} 天`:`${item.withDays} with / ${item.withoutDays} without`}</small></div>)}</div>:<p className="hint">{locale==='zh-TW'?'每個對照至少需要 3 天有該活動、3 天無該活動；只使用當日紀錄覆蓋達 60% 且填了心情的日子。':'Each comparison needs at least 3 days with and 3 without the activity, each with mood and 60% time coverage.'}</p>}<p className="hint">{locale==='zh-TW'?'這是描述性關聯；工作日、睡眠與其他情境可能同時影響心情。60% 是暫定產品門檻。':'This is a descriptive association; workdays, sleep, and other context may also matter. The 60% threshold is a provisional product choice.'}</p></section>
    <p className="method-note">{locale==='zh-TW'?'所有比例與分數分布均按實際分鐘數計算；空白時段與未評分數分開顯示。':'All proportions and ratings are weighted by actual minutes; unrecorded and unrated time are shown separately.'}</p>
  </>;
}
