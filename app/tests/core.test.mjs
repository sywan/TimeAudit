import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, durationMinutes, getGaps, overlapMinutes } from '../src/types.ts';
import { ipipItems, scoreIpip } from '../src/questionnaire.ts';
import { activityLabel, categories } from '../src/i18n.ts';

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
