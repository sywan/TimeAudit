export type RatingKey = 'importance' | 'urgency' | 'valueAlignment';
export type Rating = number | null;

export interface Entry {
  id: string;
  startAt: string;
  endAt: string;
  activityId: string;
  customText: string;
  classification?: { method: 'user' | 'rule_confirmed'; confidence: number; matched?: string };
  ratings: Record<RatingKey, Rating>;
  ratingStatus: Record<RatingKey, 'answered' | 'not_applicable'>;
  valueIds: string[];
  goalIds: string[];
  captureMode: 'prompted' | 'manual' | 'backfill';
  recallConfidence: 'high' | 'medium' | 'low' | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt: string | null;
}

export interface CompassItem { id: string; text: string; }
export interface CustomActivity { id: string; name: string; createdAt: string; }

export interface Preferences {
  intervalMinutes: number;
  quietStart: string;
  quietEnd: string;
  reminders: boolean;
  notifications: boolean;
  locale: 'zh-TW' | 'en';
  sheetId: string | null;
}

export interface QuestionnaireResult {
  id: string;
  instrument: string;
  version: string;
  locale: string;
  responses: Record<string, number>;
  completedAt: string | null;
}

export interface AuditState {
  schemaVersion: '0.2';
  entries: Entry[];
  values: CompassItem[];
  goals: CompassItem[];
  preferences: Preferences;
  questionnaires: QuestionnaireResult[];
  experiments: Array<{ id: string; text: string; createdAt: string }>;
  customActivities?: CustomActivity[];
  categoryOverrides?: Record<string, string>;
  updatedAt: string;
}

export interface Profile { sub: string; name: string; email: string; picture?: string; demo?: boolean; }

export const initialState = (): AuditState => ({
  schemaVersion: '0.2',
  entries: [],
  values: [],
  goals: [],
  preferences: { intervalMinutes: 30, quietStart: '22:00', quietEnd: '07:00', reminders: true, notifications: false, locale: 'zh-TW', sheetId: null },
  questionnaires: [],
  experiments: [],
  customActivities: [],
  categoryOverrides: {},
  updatedAt: new Date().toISOString(),
});

export const durationMinutes = (entry: Pick<Entry, 'startAt' | 'endAt'>) =>
  Math.max(0, (new Date(entry.endAt).getTime() - new Date(entry.startAt).getTime()) / 60_000);

export const activeEntries = (entries: Entry[]) => entries.filter((entry) => !entry.deletedAt);

export const toLocalInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fromLocalInput = (value: string) => new Date(value).toISOString();

export function dayBounds(day: Date): [number, number] {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  return [start, end];
}

export function overlapMinutes(entry: Pick<Entry, 'startAt' | 'endAt'>, start: number, end: number): number {
  return Math.max(0, Math.min(new Date(entry.endAt).getTime(), end) - Math.max(new Date(entry.startAt).getTime(), start)) / 60_000;
}

// Category is a changeable view of a stable activity ID, never part of the log's identity.
export function categoryOf(activityId: string, overrides: Record<string,string> = {}): string {
  return overrides[activityId] ?? (activityId === 'sleep.night' ? 'rest' : activityId.startsWith('custom.') ? 'other' : activityId.split('.')[0] || 'other');
}

export function getGaps(entries: Entry[], start: number, end: number): Array<[number, number]> {
  const intervals = activeEntries(entries)
    .map(e => [Math.max(start, new Date(e.startAt).getTime()), Math.min(end, new Date(e.endAt).getTime())] as [number, number])
    .filter(([a,b]) => b > a)
    .sort((a,b) => a[0] - b[0]);
  const gaps: Array<[number,number]> = [];
  let cursor = start;
  for (const [a,b] of intervals) { if (a > cursor) gaps.push([cursor,a]); cursor = Math.max(cursor,b); }
  if (cursor < end) gaps.push([cursor,end]);
  return gaps;
}

export function makeDemoState(): AuditState {
  const state = initialState();
  state.values = [
    {id:'v-health',text:'健康與穩定'}, {id:'v-family',text:'親密關係'}, {id:'v-growth',text:'成長與創造'},
  ];
  state.goals = [{id:'g-write',text:'完成提案初稿'}, {id:'g-move',text:'每週運動三次'}];
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const add = (start: number, end: number, activityId: string, text: string, ratings: [Rating,Rating,Rating]) => {
    const s = new Date(d.getTime()+start*60_000).toISOString();
    const e = new Date(d.getTime()+end*60_000).toISOString();
    state.entries.push({id:crypto.randomUUID(),startAt:s,endAt:e,activityId,customText:text,ratings:{importance:ratings[0],urgency:ratings[1],valueAlignment:ratings[2]},ratingStatus:{importance:ratings[0]===null?'not_applicable':'answered',urgency:ratings[1]===null?'not_applicable':'answered',valueAlignment:ratings[2]===null?'not_applicable':'answered'},valueIds:[],goalIds:[],captureMode:'manual',recallConfidence:null,createdAt:now.toISOString(),updatedAt:now.toISOString(),revision:1,deletedAt:null});
  };
  add(-60, 420, 'sleep.night', '', [7,1,7]);
  add(420, 480, 'life.meal', '', [5,3,6]);
  add(480, 540, 'travel.commute', '', [4,5,4]);
  add(540, 660, 'work.deep', '整理研究與提案', [7,4,7]);
  add(660, 720, 'work.meeting', '', [5,6,5]);
  add(720, 780, 'life.meal', '', [6,3,6]);
  const yesterday = new Date(d.getTime()-86400000);
  const ys = new Date(yesterday.getFullYear(),yesterday.getMonth(),yesterday.getDate());
  const savedD=d; d.setTime(ys.getTime());
  add(0,420,'sleep.night','',[7,1,7]);
  add(540,660,'work.writing','',[7,4,6]);
  add(660,720,'work.messages','',[3,6,3]);
  add(780,900,'work.deep','',[7,3,7]);
  d.setTime(savedD.getTime());
  return state;
}
