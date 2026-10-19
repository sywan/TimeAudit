import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, durationMinutes, getGaps, initialState, overlapMinutes, withV09CategoryDefaults } from '../src/types.ts';
import { ipipItems, scoreIpip } from '../src/questionnaire.ts';
import { activityLabel, categories } from '../src/i18n.ts';
import { mergeQuestionnaires, syncWithDrive } from '../src/drive.ts';
import { latestBundlePath, publishedAssetPaths, publishedBundlePath } from '../src/update.ts';
import { insightWindow } from '../src/insightRange.ts';
import {journalSummary,journalVersionsForDay,mergeJournalVersions} from '../src/journal.ts';
import {preferKeyboardDictation,speechText} from '../src/dictation.ts';
import {dataQuality,weeklyRhythm,weeklyRhythmComposition,feelingByCategory,moodAssociations,workOutsideHours} from '../src/auditAnalytics.ts';
import {mergeExperiments} from '../src/experiments.ts';
import {mergeInsightFeedback} from '../src/insightFeedback.ts';
import {activeCompassItems,mergeCompassItems} from '../src/compass.ts';

test('values and goals merge by item ID; an empty newer profile cannot erase them',()=>{
  const phone={id:'phone-value',text:'信仰',updatedAt:'2026-10-19T01:00:00Z'};
  const desktop={id:'desktop-value',text:'健康',updatedAt:'2026-10-19T02:00:00Z'};
  assert.deepEqual(mergeCompassItems([], [phone], [desktop]),[phone,desktop]);
  const removed={...phone,deletedAt:'2026-10-19T03:00:00Z',updatedAt:'2026-10-19T03:00:00Z'};
  assert.deepEqual(activeCompassItems(mergeCompassItems([phone],[removed],[phone])),[]);
});

test('Drive sync restores independent values and goals despite a newer empty profile',async()=>{
  const local=initialState();
  local.updatedAt='2026-10-19T02:00:00Z';
  local.values=[{id:'local-value',text:'家庭',updatedAt:'2026-10-19T01:00:00Z'}];
  const remoteValue={id:'remote-value',text:'信仰',updatedAt:'2026-10-19T00:00:00Z'};
  const remoteGoal={id:'remote-goal',text:'每天閱讀',updatedAt:'2026-10-19T00:00:00Z'};
  const files=[{id:'profile-id',name:'profile.json'},{id:'value-id',name:'compass-value-remote-value.json'},{id:'goal-id',name:'compass-goal-remote-goal.json'}];
  const created=[];
  let savedProfile=null;
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(String(input));
    if(url.pathname==='/drive/v3/files'&&url.searchParams.get('q')?.includes("name = 'Time Audit'"))return Response.json({files:[{id:'folder-id',name:'Time Audit'}]});
    if(url.pathname==='/drive/v3/files'&&url.searchParams.has('q')){
      const name=url.searchParams.get('q')?.match(/name = '([^']+)'/)?.[1];
      return Response.json({files:name?files.filter(file=>file.name===name):files});
    }
    if(url.pathname==='/drive/v3/files/profile-id')return Response.json({updatedAt:'2026-10-19T03:00:00Z',values:[],goals:[]});
    if(url.pathname==='/drive/v3/files/value-id')return Response.json({item:remoteValue});
    if(url.pathname==='/drive/v3/files/goal-id')return Response.json({item:remoteGoal});
    if(url.pathname==='/upload/drive/v3/files'&&init.method==='POST'){
      created.push(String(init.body));return Response.json({id:'created-id'});
    }
    if(url.pathname==='/upload/drive/v3/files/profile-id'&&init.method==='PATCH'){
      savedProfile=JSON.parse(init.body);return Response.json({});
    }
    if(url.pathname.startsWith('/upload/drive/v3/files/')&&init.method==='PATCH')return Response.json({});
    throw new Error(`Unexpected request: ${url}`);
  };
  try{
    const result=await syncWithDrive(local,'test-token');
    assert.deepEqual(result.state.values.map(item=>item.id),['local-value','remote-value']);
    assert.deepEqual(result.state.goals.map(item=>item.id),['remote-goal']);
    assert.deepEqual(savedProfile.values.map(item=>item.id),['local-value','remote-value']);
    assert.ok(created.some(body=>body.includes('compass-value-local-value.json')));
  }finally{globalThis.fetch=previousFetch;}
});

test('work outside a personal time window counts actual union minutes and distinct days',()=>{
  const state=initialState();
  const day=new Date(2026,9,15);
  const at=(offset)=>new Date(day.getFullYear(),day.getMonth(),day.getDate(),0,offset).toISOString();
  const entries=[{activityId:'work.deep',startAt:at(8*60),endAt:at(10*60)},{activityId:'work.meeting',startAt:at(8*60+30),endAt:at(9*60+30)}];
  const result=workOutsideHours(entries,state,Date.parse(at(0)),Date.parse(at(24*60)),'09:00','17:00');
  assert.deepEqual(result,{minutes:60,days:1});
  assert.deepEqual(workOutsideHours(entries,state,Date.parse(at(0)),Date.parse(at(24*60)),'22:00','06:00'),{minutes:120,days:1});
});

test('insight feedback keeps the most recently updated choice across devices',()=>{
  const a={id:'week:urgent',decision:'helpful',updatedAt:'2026-10-15T10:00:00Z'};
  const b={...a,decision:'not_applicable',updatedAt:'2026-10-16T10:00:00Z'};
  assert.deepEqual(mergeInsightFeedback([b],[a]),[b]);
});

test('quality and rhythm use actual minutes and preserve missing feelings',()=>{
  const state=initialState();
  const start=Date.parse('2026-10-15T20:00:00.000Z'),end=Date.parse('2026-10-16T02:00:00.000Z');
  const base={ratings:{importance:6,urgency:null,valueAlignment:5},captureMode:'backfill',recallConfidence:'low',activityId:'work.deep'};
  const entries=[
    {...base,id:'a',startAt:new Date(start).toISOString(),endAt:new Date(start+3*3600000).toISOString(),feeling:2},
    {...base,id:'b',startAt:new Date(start+2*3600000).toISOString(),endAt:new Date(start+4*3600000).toISOString()},
  ];
  const quality=dataQuality(entries,start,end);
  assert.equal(quality.recorded,240);
  assert.equal(quality.missing,120);
  assert.equal(quality.overlap,60);
  assert.equal(quality.feeling,180);
  assert.equal(quality.backfill,240);
  assert.equal(quality.rated.urgency,0);
  const rhythm=weeklyRhythm(entries,state,start,end,'work');
  assert.equal(rhythm.flat().reduce((a,b)=>a+b,0),240);
  const byCategory=feelingByCategory(entries,state,start,end);
  assert.equal(byCategory[0].average,2);
  assert.equal(byCategory[0].minutes,180);
});

test('mixed-category rhythm cells use category minutes without double counting overlaps',()=>{
  const state=initialState();
  const day=new Date(2026,9,15);
  const at=(minute)=>new Date(day.getFullYear(),day.getMonth(),day.getDate(),9,minute).toISOString();
  const entries=[
    {activityId:'work.deep',startAt:at(0),endAt:at(30)},
    {activityId:'learning.reading',startAt:at(20),endAt:at(40)},
    {activityId:'rest.break',startAt:at(30),endAt:at(60)},
  ];
  const start=Date.parse(at(0)),end=Date.parse(at(60));
  const weekday=(day.getDay()+6)%7;
  assert.deepEqual(weeklyRhythmComposition(entries,state,start,end)[weekday][9],[
    {category:'learning',minutes:10},{category:'rest',minutes:20},{category:'work',minutes:30},
  ]);
  assert.equal(weeklyRhythm(entries,state,start,end,'all')[weekday][9],60);
  state.categoryOverrides={'learning.reading':'faith'};
  assert.equal(weeklyRhythmComposition(entries,state,start,end)[weekday][9].find(item=>item.category==='faith')?.minutes,10);
});

test('a completed experiment survives an older profile copy',()=>{
  const old={id:'exp',text:'若忙則停一下',createdAt:'2026-10-15T00:00:00Z'};
  const updated={...old,status:'continue',resultNote:'有幫助',updatedAt:'2026-10-23T00:00:00Z'};
  assert.deepEqual(mergeExperiments([updated],[old]),[updated]);
});

test('mood comparison needs rated and sufficiently covered days in both groups',()=>{
  const state=initialState(),entries=[],journals=[];
  for(let day=1;day<=6;day++){
    const start=new Date(2026,9,day),end=new Date(2026,9,day+1);
    entries.push({id:`day-${day}`,activityId:day<=3?'work.deep':'rest.break',startAt:start.toISOString(),endAt:end.toISOString()});
    journals.push({id:`mood-${day}`,day:`2026-10-${String(day).padStart(2,'0')}`,note:'',mood:day<=3?6:4,updatedAt:start.toISOString()});
  }
  const result=moodAssociations(entries,journals,state,['work'])[0];
  assert.equal(result.comparable,true);
  assert.deepEqual([result.withDays,result.withoutDays,result.withAverage,result.withoutAverage],[3,3,6,4]);
  entries.pop();
  assert.equal(moodAssociations(entries,journals,state,['work'])[0].comparable,false);
});

test('iPhone Home Screen dictation avoids exposed but unreliable web speech recognition', () => {
  assert.equal(preferKeyboardDictation('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',true),true);
  assert.equal(preferKeyboardDictation('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',false),false);
  assert.equal(preferKeyboardDictation('Mozilla/5.0 (Macintosh; Intel Mac OS X)',true,0),false);
  assert.equal(preferKeyboardDictation('Mozilla/5.0 (Macintosh; Intel Mac OS X)',true,5),true);
});

test('speech text uses only newly reported final and interim results', () => {
  const event={resultIndex:1,results:[{0:{transcript:'already saved'},isFinal:true},{0:{transcript:'今天的日記'},isFinal:true},{0:{transcript:'還在說話'},isFinal:false}]};
  assert.deepEqual(speechText(event),{final:'今天的日記',interim:'還在說話'});
});

const entry = (startAt, endAt) => ({ id: crypto.randomUUID(), startAt, endAt, deletedAt: null });

test('cross-midnight sleep is counted by its actual duration and clipped to the selected day', () => {
  const sleep = entry('2026-10-13T23:00:00.000Z', '2026-10-14T07:00:00.000Z');
  assert.equal(durationMinutes(sleep), 480);
  assert.equal(overlapMinutes(sleep, Date.parse('2026-10-14T00:00:00.000Z'), Date.parse('2026-10-15T00:00:00.000Z')), 420);
});

test('gaps use the union of intervals and keep both empty ends', () => {
  const entries = [entry('2026-10-14T01:00:00.000Z','2026-10-14T03:00:00.000Z'),entry('2026-10-14T02:00:00.000Z','2026-10-14T04:00:00.000Z')];
  const gaps=getGaps(entries,Date.parse('2026-10-14T00:00:00.000Z'),Date.parse('2026-10-14T05:00:00.000Z'));
  assert.deepEqual(gaps.map(([a,b])=>(b-a)/60000),[60,60]);
});

test('IPIP requires every item and reverse-keys negative items', () => {
  assert.equal(scoreIpip({}),null);
  const answers=Object.fromEntries(ipipItems.map((_,i)=>[String(i),1]));
  const scores=scoreIpip(answers);
  assert.ok(scores);
  for(let factor=0;factor<5;factor++){
    const expected=ipipItems.filter(item=>item.factor===factor).reduce((sum,item)=>sum+(item.reverse?5:1),0);
    assert.equal(scores[factor],expected);
  }
});

test('local text suggestion is transparent and leaves unmatched text unclassified', async () => {
  const { suggestActivity } = await import('../src/classify.ts');
  assert.equal(suggestActivity('下午開會討論提案')?.id,'work.meeting');
  assert.equal(suggestActivity('some unrecognized personal activity'),null);
});

test('stable activity IDs can move between logical categories without changing the activity', () => {
  assert.equal(categoryOf('sleep.night'),'rest');
  assert.equal(categoryOf('sleep.night',{'sleep.night':'health'}),'health');
  assert.equal(categoryOf('custom.fixed-id'),'other');
  assert.equal(categoryOf('custom.fixed-id',{'custom.fixed-id':'faith'}),'faith');
  assert.ok(categories.find(c=>c.id==='rest').activities.some(a=>a.id==='sleep.night'));
  assert.ok(categories.find(c=>c.id==='faith').activities.some(a=>a.id==='faith.prayer'));
  assert.equal(activityLabel('zh-TW','life.meal'),'吃飯／用餐');
  assert.equal(activityLabel('zh-TW','custom.fixed-id',[{id:'custom.fixed-id',name:'園藝',createdAt:''}]),'園藝');
});

test('v0.9 reclassifies matching personal activities while preserving IDs and manual choices', () => {
  const state=initialState();
  state.customActivities=[
    {id:'custom.fellowship',name:'團契／讀書會',createdAt:''},
    {id:'custom.code',name:'撰寫程式',createdAt:''},
    {id:'custom.phone',name:'打電話',createdAt:''},
    {id:'custom.other',name:'園藝',createdAt:''},
  ];
  state.categoryOverrides={'custom.code':'work'};
  const migrated=withV09CategoryDefaults(state);
  assert.deepEqual(migrated.customActivities,state.customActivities);
  assert.equal(categoryOf('custom.fellowship',migrated.categoryOverrides),'faith');
  assert.equal(categoryOf('custom.code',migrated.categoryOverrides),'work');
  assert.equal(categoryOf('custom.phone',migrated.categoryOverrides),'social');
  assert.equal(categoryOf('custom.other',migrated.categoryOverrides),'other');
  assert.strictEqual(withV09CategoryDefaults(migrated),migrated);
  assert.ok(categories.find(c=>c.id==='faith').activities.some(a=>a.id==='faith.fellowship'));
  assert.ok(categories.find(c=>c.id==='learning').activities.some(a=>a.id==='learning.programming'));
  assert.ok(categories.find(c=>c.id==='social').activities.some(a=>a.id==='social.phone'));
});

test('deep relaxation is a health activity and an existing personal ID moves there', () => {
  const state=initialState();
  state.customActivities=[{id:'custom.relax',name:'深入放鬆',createdAt:''},{id:'custom.dishes',name:'洗碗塊',createdAt:''}];
  state.categoryOverrides={'custom.relax':'other','custom.dishes':'other'};
  state.entries=[{id:'entry-relax',activityId:'custom.relax',startAt:'2026-10-16T01:00:00.000Z',endAt:'2026-10-16T02:00:00.000Z'},{id:'entry-dishes',activityId:'custom.dishes',startAt:'2026-10-16T02:00:00.000Z',endAt:'2026-10-16T03:00:00.000Z'}];
  const migrated=withV09CategoryDefaults(state);
  assert.equal(categoryOf('custom.relax',migrated.categoryOverrides),'health');
  assert.equal(categoryOf('custom.dishes',migrated.categoryOverrides),'home');
  assert.equal(migrated.customActivities[0].id,'custom.relax');
  assert.equal(migrated.customActivities[1].id,'custom.dishes');
  assert.deepEqual(migrated.entries,state.entries);
  assert.equal(migrated.entries.map(e=>categoryOf(e.activityId,migrated.categoryOverrides)).includes('other'),false);
  assert.equal(categoryOf('health.deepRelaxation'),'health');
  assert.equal(activityLabel('zh-TW','health.deepRelaxation'),'深度放鬆');
  assert.ok(categories.find(c=>c.id==='health').activities.some(a=>a.id==='health.deepRelaxation'));
  assert.ok(categories.find(c=>c.id==='home').activities.some(a=>a.id==='home.dishes'));
});

test('v1.15 puts existing personal teaching records in Work without changing their IDs', () => {
  const state=initialState();
  state.customActivities=[{id:'custom.teacher-owned',name:'授課',createdAt:'2026-10-19T00:00:00.000Z'}];
  state.categoryOverrides={'custom.teacher-owned':'other'};
  state.entries=[{id:'entry-teaching',activityId:'custom.teacher-owned',startAt:'2026-10-19T01:00:00.000Z',endAt:'2026-10-19T02:30:00.000Z'}];
  const migrated=withV09CategoryDefaults(state);
  assert.equal(categoryOf('custom.teacher-owned',migrated.categoryOverrides),'work');
  assert.deepEqual(migrated.entries,state.entries);
  assert.equal(durationMinutes(migrated.entries[0]),90);
  assert.equal(activityLabel('zh-TW','work.teaching'),'授課／課程準備');
  assert.equal(activityLabel('en','work.teaching'),'Teaching / course preparation');
  assert.ok(categories.find(c=>c.id==='work').activities.some(a=>a.id==='work.teaching'));
  assert.strictEqual(withV09CategoryDefaults(migrated),migrated);
  const manual=initialState();
  manual.customActivities=state.customActivities;
  manual.categoryOverrides={'custom.teacher-owned':'learning'};
  assert.equal(categoryOf('custom.teacher-owned',withV09CategoryDefaults(manual).categoryOverrides),'learning');
});

test('unused old teaching activity disappears only after its records move', () => {
  const state=initialState();
  state.customActivities=[{id:'custom.old-teaching',name:'授課',createdAt:'2026-10-19T00:00:00Z'}];
  state.categoryOverrides={'custom.old-teaching':'work'};
  state.entries=[{id:'moved',activityId:'work.teaching',startAt:'2026-10-19T08:00:00Z',endAt:'2026-10-19T09:00:00Z',deletedAt:null}];
  const cleaned=withV09CategoryDefaults(state);
  assert.deepEqual(cleaned.customActivities,[]);
  assert.deepEqual(cleaned.categoryOverrides,{});
  const stillReferenced={...state,entries:[...state.entries,{id:'not-yet-moved',activityId:'custom.old-teaching',startAt:'2026-10-19T10:00:00Z',endAt:'2026-10-19T11:00:00Z',deletedAt:null}]};
  assert.equal(withV09CategoryDefaults(stillReferenced).customActivities?.length,1);
  assert.equal(withV09CategoryDefaults({...state,entries:[]}).customActivities?.length,1);
});

test('update check reads the published content-hashed bundle, not the product version', () => {
  assert.equal(publishedBundlePath('<script type="module" crossorigin src="/TimeAudit/assets/index-Ab12cd.js"></script>'),'/TimeAudit/assets/index-Ab12cd.js');
  assert.equal(publishedBundlePath('<script type="module" crossorigin src="/TimeAudit/assets/app-Ch4iS1iH.js"></script>'),'/TimeAudit/assets/app-Ch4iS1iH.js');
  assert.equal(publishedBundlePath('<script src="/TimeAudit/assets/app-Ch4iS1iH.js" type="module"></script>'),'/TimeAudit/assets/app-Ch4iS1iH.js');
  assert.equal(publishedBundlePath('<script type="module" src="/src/main.tsx"></script>'),null);
  assert.deepEqual(publishedAssetPaths('<link rel="stylesheet" href="/TimeAudit/assets/index-Style.css"><script type="module" src="/TimeAudit/assets/index-Code.js"></script>'),['/TimeAudit/assets/index-Style.css','/TimeAudit/assets/index-Code.js']);
});

test('update check refuses to reload when a new app asset cannot be downloaded', async () => {
  const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
  const html='<link rel="stylesheet" href="/TimeAudit/assets/index-Style.css"><script type="module" src="/TimeAudit/assets/index-Code.js"></script>';
  globalThis.window={location:{origin:'https://example.test'}};
  globalThis.fetch=async url=>new Response(String(url).endsWith('.css')?'':html,{status:String(url).endsWith('.css')?404:200});
  try{await assert.rejects(latestBundlePath('/TimeAudit/'),/Published asset unavailable \(404\)/);}
  finally{globalThis.window=previousWindow;globalThis.fetch=previousFetch;}
});

test('Drive sync keeps a phone questionnaire in its own file when desktop settings are newer', async () => {
  const local=initialState();
  local.updatedAt='2026-10-16T10:00:00.000Z';
  const result={id:'phone-ipip',instrument:'IPIP-50',version:'public-domain-50',locale:'zh-TW',responses:{'0':5},completedAt:'2026-10-15T09:00:00.000Z'};
  const remote={updatedAt:'2026-10-15T09:00:00.000Z',questionnaires:[result]};
  const previousFetch=globalThis.fetch;
  let uploaded=null,questionnaireUploaded=false;
  const progress=[];
  globalThis.fetch=async (input,init={})=>{
    const url=new URL(String(input));
    if(url.pathname==='/drive/v3/files'&&url.searchParams.get('q')?.includes("name = 'Time Audit'"))return Response.json({files:[{id:'folder-id',name:'Time Audit'}]});
    if(url.pathname==='/drive/v3/files'&&url.searchParams.get('q')?.includes("name = 'profile.json'"))return Response.json({files:[{id:'profile-id',name:'profile.json'}]});
    if(url.pathname==='/drive/v3/files'&&url.searchParams.get('q')?.includes("name = 'questionnaire-"))return Response.json({files:[]});
    if(url.pathname==='/drive/v3/files')return Response.json({files:[{id:'profile-id',name:'profile.json'}]});
    if(url.pathname==='/drive/v3/files/profile-id')return Response.json(remote);
    if(url.pathname==='/upload/drive/v3/files'&&init.method==='POST'){questionnaireUploaded=String(init.body).includes('phone-ipip');return Response.json({id:'questionnaire-id'});}
    if(url.pathname==='/upload/drive/v3/files/profile-id'&&init.method==='PATCH'){uploaded=JSON.parse(init.body);return Response.json({});}
    throw new Error(`Unexpected request: ${url}`);
  };
  try{
    const synced=await syncWithDrive(local,'test-token',update=>progress.push(update));
    assert.deepEqual(synced.state.questionnaires,[result]);
    assert.deepEqual(uploaded.questionnaires,[result]);
    assert.equal(questionnaireUploaded,true);
    assert.equal(progress[0].stage,'discover');
    assert.deepEqual(progress.filter(item=>item.stage==='download').at(-1),{stage:'download',completed:1,total:1});
    const finalUpload=progress.filter(item=>item.stage==='upload').at(-1);
    assert.equal(finalUpload.completed,finalUpload.total);
    assert.ok(finalUpload.total>=2);
  }finally{globalThis.fetch=previousFetch;}
  assert.deepEqual(mergeQuestionnaires([result],[{...result,id:'desktop-ipip',completedAt:'2026-10-16T11:00:00.000Z'}]).map(q=>q.id),['desktop-ipip','phone-ipip']);
});

test('Drive sync restores a questionnaire from its dedicated file even when the profile has none', async () => {
  const local=initialState();
  local.updatedAt='2026-10-16T12:00:00.000Z';
  const result={id:'phone-ipip',instrument:'IPIP-50',version:'public-domain-50',locale:'zh-TW',responses:{'0':5},completedAt:'2026-10-15T09:00:00.000Z'};
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async (input,init={})=>{
    const url=new URL(String(input));
    if(url.pathname==='/drive/v3/files'&&url.searchParams.get('q')?.includes("name = 'Time Audit'"))return Response.json({files:[{id:'folder-id',name:'Time Audit'}]});
    if(url.pathname==='/drive/v3/files'&&url.searchParams.get('q')?.includes("name = 'profile.json'"))return Response.json({files:[{id:'profile-id',name:'profile.json'}]});
    if(url.pathname==='/drive/v3/files'&&url.searchParams.get('q')?.includes("name = 'questionnaire-"))return Response.json({files:[{id:'questionnaire-id',name:'questionnaire-phone-ipip.json'}]});
    if(url.pathname==='/drive/v3/files')return Response.json({files:[{id:'profile-id',name:'profile.json'},{id:'questionnaire-id',name:'questionnaire-phone-ipip.json'}]});
    if(url.pathname==='/drive/v3/files/profile-id')return Response.json({updatedAt:'2026-10-16T13:00:00.000Z',questionnaires:[]});
    if(url.pathname==='/drive/v3/files/questionnaire-id')return Response.json({schemaVersion:'0.2',result});
    if(url.pathname==='/upload/drive/v3/files/questionnaire-id'&&init.method==='PATCH')return Response.json({});
    if(url.pathname==='/upload/drive/v3/files/profile-id'&&init.method==='PATCH')return Response.json({});
    throw new Error(`Unexpected request: ${url}`);
  };
  try{assert.deepEqual((await syncWithDrive(local,'test-token')).state.questionnaires,[result]);}
  finally{globalThis.fetch=previousFetch;}
});

test('analysis ranges use local calendar days and clamp month ends', () => {
  const now=new Date(2026,9,16,10,40);
  assert.equal(insightWindow('today',now)[0],new Date(2026,9,16).getTime());
  assert.equal(insightWindow('3d',now)[0],new Date(2026,9,14).getTime());
  const [threeDayStart,threeDayEnd]=insightWindow('3d',now);
  assert.equal(overlapMinutes({startAt:new Date(threeDayStart-3600000).toISOString(),endAt:new Date(threeDayStart+3600000).toISOString()},threeDayStart,threeDayEnd),60);
  assert.equal(insightWindow('7d',now)[0],new Date(2026,9,10).getTime());
  assert.equal(insightWindow('30d',now)[0],new Date(2026,8,17).getTime());
  assert.equal(insightWindow('6m',now)[0],new Date(2026,3,16).getTime());
  assert.equal(insightWindow('1y',now)[0],new Date(2025,9,16).getTime());
  assert.equal(insightWindow('6m',new Date(2026,7,31))[0],new Date(2026,1,28).getTime());
});

test('daily journal summary refreshes with later entries while personal versions stay separate', () => {
  const audit=initialState();
  const start=Date.parse('2026-10-16T00:00:00.000Z'),end=Date.parse('2026-10-17T00:00:00.000Z');
  const first={id:'first',startAt:'2026-10-16T01:00:00.000Z',endAt:'2026-10-16T02:00:00.000Z',activityId:'work.deep',deletedAt:null};
  const later={id:'later',startAt:'2026-10-16T20:00:00.000Z',endAt:'2026-10-16T21:00:00.000Z',activityId:'faith.prayer',deletedAt:null};
  const before=journalSummary(audit,[first],'zh-TW',start,end);
  const after=journalSummary(audit,[first,later],'zh-TW',start,end);
  assert.match(before,/工作/);
  assert.doesNotMatch(before,/信仰/);
  assert.match(after,/信仰/);
  const morning={id:'journal-morning',day:'2026-10-16',note:'今天心情平靜',updatedAt:'2026-10-16T12:00:00.000Z'};
  const evening={id:'journal-evening',day:'2026-10-16',note:'晚上又寫了一段',updatedAt:'2026-10-16T22:00:00.000Z'};
  const versions=mergeJournalVersions([morning],[evening]);
  assert.deepEqual(journalVersionsForDay(versions,'2026-10-16').map(item=>item.note),['晚上又寫了一段','今天心情平靜']);
  assert.equal(after.includes(morning.note),false);
});

test('Drive sync restores an independent daily journal despite a newer empty profile', async () => {
  const local=initialState();local.updatedAt='2026-10-16T12:00:00.000Z';
  const journal={id:'journal-1',day:'2026-10-15',note:'昨天的心情',updatedAt:'2026-10-15T22:00:00.000Z'};
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async (input,init={})=>{
    const url=new URL(String(input));
    if(url.pathname==='/drive/v3/files'&&url.searchParams.get('q')?.includes("name = 'Time Audit'"))return Response.json({files:[{id:'folder-id',name:'Time Audit'}]});
    if(url.pathname==='/drive/v3/files'&&url.searchParams.get('q')?.includes("name = 'profile.json'"))return Response.json({files:[{id:'profile-id',name:'profile.json'}]});
    if(url.pathname==='/drive/v3/files'&&url.searchParams.get('q')?.includes("name = 'journal-"))return Response.json({files:[{id:'journal-file-id',name:'journal-journal-1.json'}]});
    if(url.pathname==='/drive/v3/files')return Response.json({files:[{id:'profile-id',name:'profile.json'},{id:'journal-file-id',name:'journal-journal-1.json'}]});
    if(url.pathname==='/drive/v3/files/profile-id')return Response.json({updatedAt:'2026-10-16T13:00:00.000Z',journals:[]});
    if(url.pathname==='/drive/v3/files/journal-file-id')return Response.json({schemaVersion:'0.2',journal});
    if(url.pathname==='/upload/drive/v3/files/journal-file-id'&&init.method==='PATCH')return Response.json({});
    if(url.pathname==='/upload/drive/v3/files/profile-id'&&init.method==='PATCH')return Response.json({});
    throw new Error(`Unexpected request: ${url}`);
  };
  try{assert.deepEqual((await syncWithDrive(local,'test-token')).state.journals,[journal]);}
  finally{globalThis.fetch=previousFetch;}
});
