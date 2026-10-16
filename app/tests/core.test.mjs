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

test('update check reads the published content-hashed bundle, not the product version', () => {
  assert.equal(publishedBundlePath('<script type="module" crossorigin src="/TimeAudit/assets/index-Ab12cd.js"></script>'),'/TimeAudit/assets/index-Ab12cd.js');
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
    const synced=await syncWithDrive(local,'test-token');
    assert.deepEqual(synced.state.questionnaires,[result]);
    assert.deepEqual(uploaded.questionnaires,[result]);
    assert.equal(questionnaireUploaded,true);
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
