import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, durationMinutes, getGaps, initialState, overlapMinutes, withV09CategoryDefaults } from '../src/types.ts';
import { ipipItems, scoreIpip } from '../src/questionnaire.ts';
import { activityLabel, categories } from '../src/i18n.ts';
import { latestBundlePath, publishedAssetPaths, publishedBundlePath } from '../src/update.ts';

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
  state.customActivities=[{id:'custom.relax',name:'深入放鬆',createdAt:''}];
  const migrated=withV09CategoryDefaults(state);
  assert.equal(categoryOf('custom.relax',migrated.categoryOverrides),'health');
  assert.equal(categoryOf('health.deepRelaxation'),'health');
  assert.equal(activityLabel('zh-TW','health.deepRelaxation'),'深入放鬆');
  assert.ok(categories.find(c=>c.id==='health').activities.some(a=>a.id==='health.deepRelaxation'));
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
