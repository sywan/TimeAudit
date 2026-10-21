import type { AuditState, CompassItem, DailyJournal, Entry, QuestionnaireResult } from './types.ts';
import { categoryOf, initialState, withV09CategoryDefaults } from './types.ts';
import { mergeCompassItems } from './compass.ts';
import {mergeJournalVersions} from './journal.ts';
import {mergeExperiments} from './experiments.ts';
import {mergeInsightFeedback} from './insightFeedback.ts';

const DRIVE='https://www.googleapis.com/drive/v3';
const UPLOAD='https://www.googleapis.com/upload/drive/v3';

async function api<T>(url:string,token:string,init:RequestInit={}):Promise<T> {
  const response=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers}});
  if(!response.ok){const detail=await response.text();throw new Error(`Google API ${response.status}: ${detail.slice(0,180)}`);}
  if(response.status===204)return undefined as T;
  return response.json() as Promise<T>;
}

interface DriveFile {id:string;name:string;parents?:string[];createdTime?:string;mimeType?:string;}

const escapeQ=(value:string)=>value.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

async function findFile(name:string,token:string,parent?:string):Promise<DriveFile|null>{
  const q=`name = '${escapeQ(name)}' and trashed = false${parent?` and '${escapeQ(parent)}' in parents`:''}`;
  const params=new URLSearchParams({q,fields:'files(id,name,parents),nextPageToken',pageSize:'100'});
  const result=await api<{files:DriveFile[]}>(`${DRIVE}/files?${params}`,token);
  return result.files[0]??null;
}

async function ensureFolder(name:string,token:string,parent?:string):Promise<string>{
  const found=await findFile(name,token,parent);
  if(found)return found.id;
  const created=await api<DriveFile>(`${DRIVE}/files?fields=id,name`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',...(parent?{parents:[parent]}:{})})});
  return created.id;
}
const createFolder=(token:string)=>ensureFolder('Time Audit',token);

async function createJsonFile(name:string,parent:string,data:unknown,token:string):Promise<string>{
  const boundary=`timeaudit_${crypto.randomUUID()}`;
  const metadata=JSON.stringify({name,mimeType:'application/json',parents:[parent]});
  const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
  const file=await api<DriveFile>(`${UPLOAD}/files?uploadType=multipart&fields=id,name`,token,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
  return file.id;
}

async function putJson(name:string,parent:string,data:unknown,token:string):Promise<void>{
  const file=await findFile(name,token,parent);
  if(!file){await createJsonFile(name,parent,data,token);return;}
  await fetch(`${UPLOAD}/files/${file.id}?uploadType=media`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(data)}).then(async response=>{
    if(!response.ok)throw new Error(`Google Drive update ${response.status}: ${(await response.text()).slice(0,180)}`);
  });
}

async function getJson<T>(file:DriveFile,token:string):Promise<T>{
  return api<T>(`${DRIVE}/files/${file.id}?alt=media`,token);
}

async function listFiles(parent:string,token:string):Promise<DriveFile[]>{
  const files:DriveFile[]=[];
  let pageToken='';
  do{
    const q=`'${escapeQ(parent)}' in parents and trashed = false`;
    const params=new URLSearchParams({q,fields:'files(id,name,createdTime,mimeType),nextPageToken',pageSize:'1000'});
    if(pageToken)params.set('pageToken',pageToken);
    const result=await api<{files:DriveFile[];nextPageToken?:string}>(`${DRIVE}/files?${params}`,token);
    files.push(...result.files);pageToken=result.nextPageToken??'';
  }while(pageToken);
  return files;
}

export interface SyncConflict {local:Entry;remote:Entry;}
export interface SyncProgress {stage:'authorization'|'discover'|'download'|'upload'|'sheet';completed:number;total:number;}
export type SyncProgressReporter=(progress:SyncProgress)=>void;

export interface DriveBackup {id:string;name:string;createdAt:string;}
export interface BackupPayload {format:'time-audit-backup';version:1;createdAt:string;state:AuditState;}

export function validateBackupPayload(value:unknown):BackupPayload {
  if(!value||typeof value!=='object')throw new Error('This is not a Time Audit backup.');
  const payload=value as Partial<BackupPayload>;
  const state=payload.state;
  if(payload.format!=='time-audit-backup'||payload.version!==1||!state||state.schemaVersion!=='0.2'||!Array.isArray(state.entries)||!Array.isArray(state.values)||!Array.isArray(state.goals)||!Array.isArray(state.questionnaires)||!Array.isArray(state.experiments)||!state.preferences||typeof state.preferences.locale!=='string'||!state.entries.every(item=>item&&typeof item.id==='string'&&Number.isFinite(Date.parse(item.startAt))&&Number.isFinite(Date.parse(item.endAt))))throw new Error('The backup is incomplete or damaged.');
  return payload as BackupPayload;
}

const backupName=(prefix:string)=>`${prefix}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
const dataFile=(name:string)=>name==='profile.json'||/^(entries-\d{4}-\d{2}|compass-(value|goal)-.+|questionnaire-.+|journal-.+|experiment-.+|insight-feedback-.+)\.json$/.test(name);

export async function createDriveBackup(state:AuditState,token:string,prefix='backup'):Promise<DriveBackup> {
  const root=await createFolder(token);
  const folder=await ensureFolder('Backups',token,root);
  const createdAt=new Date().toISOString();
  const name=backupName(prefix);
  const id=await createJsonFile(name,folder,{format:'time-audit-backup',version:1,createdAt,state} satisfies BackupPayload,token);
  return {id,name,createdAt};
}

export async function listDriveBackups(token:string):Promise<DriveBackup[]> {
  const root=await createFolder(token);
  const folder=await ensureFolder('Backups',token,root);
  return (await listFiles(folder,token)).filter(file=>/^(backup|before-restore)-.+\.json$/.test(file.name)).map(file=>({id:file.id,name:file.name,createdAt:file.createdTime??''})).sort((a,b)=>b.name.localeCompare(a.name));
}

export async function readDriveBackup(id:string,token:string):Promise<BackupPayload> {
  return validateBackupPayload(await getJson<unknown>({id,name:''},token));
}

async function moveFile(fileId:string,from:string,to:string,token:string):Promise<void>{
  const params=new URLSearchParams({addParents:to,removeParents:from,fields:'id,parents'});
  await api(`${DRIVE}/files/${encodeURIComponent(fileId)}?${params}`,token,{method:'PATCH'});
}

export async function restoreDriveBackup(current:AuditState,snapshot:AuditState,token:string,onProgress?:SyncProgressReporter):Promise<{state:AuditState;folderId:string}> {
  // Before replacing the live files, keep both an immutable local-state copy
  // and the existing split Drive files in a dated archive folder.
  await createDriveBackup(current,token,'before-restore');
  const root=await createFolder(token);
  const backupFolder=await ensureFolder('Backups',token,root);
  const archive=await ensureFolder(`Archive before restore ${new Date().toISOString().replace(/[:.]/g,'-')}`,token,backupFolder);
  const oldFiles=(await listFiles(root,token)).filter(file=>dataFile(file.name));
  const moved:DriveFile[]=[];
  try{
    for(const file of oldFiles){await moveFile(file.id,root,archive,token);moved.push(file);}
    const restored=withV09CategoryDefaults({...snapshot,restoreEpoch:new Date().toISOString(),updatedAt:new Date().toISOString()});
    const result=await syncWithDrive(restored,token,onProgress);
    if(result.conflicts.length)throw new Error('The restored copy conflicts with current Drive files.');
    return {state:result.state,folderId:result.folderId};
  }catch(error){
    // Put any partial replacement aside, then return the original live files.
    for(const file of (await listFiles(root,token)).filter(item=>dataFile(item.name))){try{await moveFile(file.id,root,archive,token);}catch{/* The original archive remains available. */}}
    for(const file of moved){try{await moveFile(file.id,archive,root,token);}catch{/* The original archive remains available. */}}
    throw error;
  }
}

export function mergeQuestionnaires(local:QuestionnaireResult[],remote:QuestionnaireResult[]):QuestionnaireResult[]{
  const merged=new Map<string,QuestionnaireResult>();
  for(const result of [...local,...remote]){
    const previous=merged.get(result.id);
    if(!previous||(result.completedAt??'')>=(previous.completedAt??''))merged.set(result.id,result);
  }
  return [...merged.values()].sort((a,b)=>(b.completedAt??'').localeCompare(a.completedAt??'')||a.id.localeCompare(b.id));
}

export function mergeEntries(local:Entry[],remote:Entry[]):{entries:Entry[];conflicts:SyncConflict[]}{
  const map=new Map<string,Entry>();
  const conflicts:SyncConflict[]=[];
  for(const entry of remote)map.set(entry.id,entry);
  for(const entry of local){
    const other=map.get(entry.id);
    if(!other){map.set(entry.id,entry);continue;}
    if(JSON.stringify(other)===JSON.stringify(entry))continue;
    if(entry.revision>other.revision){map.set(entry.id,entry);continue;}
    if(other.revision>entry.revision)continue;
    conflicts.push({local:entry,remote:other});
  }
  return {entries:[...map.values()],conflicts};
}

export async function syncWithDrive(local:AuditState,token:string,onProgress?:SyncProgressReporter):Promise<{state:AuditState;conflicts:SyncConflict[];folderId:string}>{
  onProgress?.({stage:'discover',completed:0,total:0});
  const folderId=await createFolder(token);
  const files=await listFiles(folderId,token);
  const profileFile=files.find(f=>f.name==='profile.json');
  const valueFiles=files.filter(f=>/^compass-value-.+\.json$/.test(f.name));
  const goalFiles=files.filter(f=>/^compass-goal-.+\.json$/.test(f.name));
  const questionnaireFiles=files.filter(f=>/^questionnaire-.+\.json$/.test(f.name));
  const journalFiles=files.filter(f=>/^journal-.+\.json$/.test(f.name));
  const experimentFiles=files.filter(f=>/^experiment-.+\.json$/.test(f.name));
  const feedbackFiles=files.filter(f=>/^insight-feedback-.+\.json$/.test(f.name));
  const monthFiles=files.filter(f=>/^entries-\d{4}-\d{2}\.json$/.test(f.name));
  const readTotal=Number(Boolean(profileFile))+valueFiles.length+goalFiles.length+questionnaireFiles.length+journalFiles.length+experimentFiles.length+feedbackFiles.length+monthFiles.length;
  let readDone=0;
  onProgress?.({stage:'download',completed:0,total:readTotal});
  const readJson=async<T>(file:DriveFile):Promise<T>=>{
    const data=await getJson<T>(file,token);
    onProgress?.({stage:'download',completed:++readDone,total:readTotal});
    return data;
  };
  const remoteProfile=profileFile?await readJson<Partial<AuditState>>(profileFile):null;
  const localEpoch=local.restoreEpoch??'',remoteEpoch=remoteProfile?.restoreEpoch??'';
  const useRemote=remoteEpoch>=localEpoch;
  const localBase=remoteEpoch>localEpoch?initialState():local;
  const profileBase=useRemote?remoteProfile:null;
  const readCompass=async(file:DriveFile):Promise<CompassItem|null>=>{
    const data=await readJson<{item:CompassItem}|CompassItem>(file);
    const item='item' in data?data.item:data;
    return item&&typeof item.id==='string'&&typeof item.text==='string'?item:null;
  };
  const remoteValues=(await Promise.all(valueFiles.map(readCompass))).filter((item):item is CompassItem=>item!==null);
  const remoteGoals=(await Promise.all(goalFiles.map(readCompass))).filter((item):item is CompassItem=>item!==null);
  const remoteQuestionnaires=(await Promise.all(questionnaireFiles.map(async f=>{
    const data=await readJson<{result:QuestionnaireResult}|QuestionnaireResult>(f);
    return 'result' in data?data.result:data;
  }))).filter(result=>result&&typeof result.id==='string');
  const remoteJournals=(await Promise.all(journalFiles.map(async f=>{
    const data=await readJson<{journal:DailyJournal}|DailyJournal>(f);
    return 'journal' in data?data.journal:data;
  }))).filter(item=>item&&typeof item.id==='string');
  const remoteExperiments=(await Promise.all(experimentFiles.map(async f=>{
    const data=await readJson<{experiment:AuditState['experiments'][number]}|AuditState['experiments'][number]>(f);
    return 'experiment' in data?data.experiment:data;
  }))).filter(item=>item&&typeof item.id==='string');
  const remoteFeedback=(await Promise.all(feedbackFiles.map(async f=>{
    const data=await readJson<{feedback:NonNullable<AuditState['insightFeedback']>[number]}|NonNullable<AuditState['insightFeedback']>[number]>(f);
    return 'feedback' in data?data.feedback:data;
  }))).filter(item=>item&&typeof item.id==='string');
  const remoteEntries=(await Promise.all(monthFiles.map(f=>readJson<{entries:Entry[]}>(f)))).flatMap(x=>x.entries??[]);
  const {entries,conflicts}=mergeEntries(localBase.entries,useRemote?remoteEntries:[]);
  const remoteProfileIsNewer=Boolean(profileBase && (remoteEpoch>localEpoch||(profileBase.updatedAt??'')>localBase.updatedAt));
  const state:AuditState=withV09CategoryDefaults({
    ...initialState(),
    ...localBase,
    ...(remoteProfileIsNewer && profileBase ? {
      preferences:{...localBase.preferences,...profileBase.preferences},
      experiments:mergeExperiments(localBase.experiments??[],profileBase.experiments??[]),
      customActivities:profileBase.customActivities??localBase.customActivities,
      updatedAt:profileBase.updatedAt??localBase.updatedAt,
    }:{}),
    restoreEpoch:remoteEpoch>localEpoch?remoteEpoch:localEpoch,
    // A profile's updatedAt also changes for unrelated preferences. Never use
    // it to choose an entire value/goal list over another device's list.
    values:mergeCompassItems(profileBase?.values??[],localBase.values??[],useRemote?remoteValues:[]),
    goals:mergeCompassItems(profileBase?.goals??[],localBase.goals??[],useRemote?remoteGoals:[]),
    categoryOverrides:remoteProfileIsNewer
      ? {...(localBase.categoryOverrides??{}),...(profileBase?.categoryOverrides??{})}
      : {...(profileBase?.categoryOverrides??{}),...(localBase.categoryOverrides??{})},
    customActivities:[...new Map([...(profileBase?.customActivities??[]),...(localBase.customActivities??[])].map(item=>[item.id,item])).values()],
    questionnaires:mergeQuestionnaires(mergeQuestionnaires(localBase.questionnaires??[],profileBase?.questionnaires??[]),useRemote?remoteQuestionnaires:[]),
    journals:mergeJournalVersions(localBase.journals??[],profileBase?.journals??[],useRemote?remoteJournals:[]),
    experiments:mergeExperiments(localBase.experiments??[],profileBase?.experiments??[],useRemote?remoteExperiments:[]),
    insightFeedback:mergeInsightFeedback(localBase.insightFeedback??[],profileBase?.insightFeedback??[],useRemote?remoteFeedback:[]),
    entries,
  });
  // Each completed result has its own Drive file. A newer profile/settings write
  // cannot erase another device's questionnaire, including legacy profile data.
  const remoteJournalById=new Map(remoteJournals.map(item=>[item.id,item]));
  const pendingJournals=(state.journals??[]).filter(journal=>{
    const previous=remoteJournalById.get(journal.id);
    return !(previous?.updatedAt===journal.updatedAt&&previous.note===journal.note&&previous.mood===journal.mood);
  });
  const remoteExperimentById=new Map(remoteExperiments.map(item=>[item.id,item]));
  const pendingExperiments=(state.experiments??[]).filter(experiment=>{
    const previous=remoteExperimentById.get(experiment.id);
    return !(previous&&JSON.stringify(previous)===JSON.stringify(experiment));
  });
  const remoteFeedbackById=new Map(remoteFeedback.map(item=>[item.id,item]));
  const pendingFeedback=(state.insightFeedback??[]).filter(feedback=>JSON.stringify(remoteFeedbackById.get(feedback.id))!==JSON.stringify(feedback));
  const remoteValueById=new Map(remoteValues.map(item=>[item.id,item]));
  const pendingValues=state.values.filter(item=>JSON.stringify(remoteValueById.get(item.id))!==JSON.stringify(item));
  const remoteGoalById=new Map(remoteGoals.map(item=>[item.id,item]));
  const pendingGoals=state.goals.filter(item=>JSON.stringify(remoteGoalById.get(item.id))!==JSON.stringify(item));
  const grouped=new Map<string,Entry[]>();
  if(!conflicts.length)for(const entry of entries){const month=entry.startAt.slice(0,7);grouped.set(month,[...(grouped.get(month)??[]),entry]);}
  const writeTotal=pendingValues.length+pendingGoals.length+state.questionnaires.length+pendingJournals.length+pendingExperiments.length+pendingFeedback.length+(conflicts.length?0:grouped.size+1);
  let writeDone=0;
  onProgress?.({stage:'upload',completed:0,total:writeTotal});
  const writeJson=async(name:string,data:unknown)=>{
    await putJson(name,folderId,data,token);
    onProgress?.({stage:'upload',completed:++writeDone,total:writeTotal});
  };
  for(const item of pendingValues)await writeJson(`compass-value-${encodeURIComponent(item.id)}.json`,{schemaVersion:'0.2',item});
  for(const item of pendingGoals)await writeJson(`compass-goal-${encodeURIComponent(item.id)}.json`,{schemaVersion:'0.2',item});
  for(const result of state.questionnaires)await writeJson(`questionnaire-${encodeURIComponent(result.id)}.json`,{schemaVersion:'0.2',result});
  for(const journal of pendingJournals)await writeJson(`journal-${encodeURIComponent(journal.id)}.json`,{schemaVersion:'0.2',journal});
  for(const experiment of pendingExperiments)await writeJson(`experiment-${encodeURIComponent(experiment.id)}.json`,{schemaVersion:'0.2',experiment});
  for(const feedback of pendingFeedback)await writeJson(`insight-feedback-${encodeURIComponent(feedback.id)}.json`,{schemaVersion:'0.2',feedback});
  if(conflicts.length)return {state,conflicts,folderId};
  for(const [month,items] of grouped)await writeJson(`entries-${month}.json`,{schemaVersion:'0.2',entries:items});
  await writeJson('profile.json',{schemaVersion:'0.2',values:state.values,goals:state.goals,preferences:state.preferences,questionnaires:state.questionnaires,journals:state.journals??[],experiments:state.experiments,insightFeedback:state.insightFeedback??[],customActivities:state.customActivities??[],categoryOverrides:state.categoryOverrides??{},restoreEpoch:state.restoreEpoch??'',updatedAt:state.updatedAt});
  return {state,conflicts,folderId};
}

const sheetCell=(value:string)=>/^[=+\-@]/.test(value)?`'${value}`:value;

export async function updateSheetMirror(state:AuditState,token:string,folderId:string,onProgress?:SyncProgressReporter):Promise<string>{
  onProgress?.({stage:'sheet',completed:0,total:0});
  let sheetId=state.preferences.sheetId;
  if(!sheetId){
    const sheet=await api<{spreadsheetId:string}>('https://sheets.googleapis.com/v4/spreadsheets',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({properties:{title:'Time Audit · 活動紀錄',locale:state.preferences.locale,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone},sheets:[{properties:{title:'Entries'}}]})});
    sheetId=sheet.spreadsheetId;
    const file=await api<{parents?:string[]}>(`${DRIVE}/files/${sheetId}?fields=parents`,token);
    const removeParents=(file.parents??[]).join(',');
    const params=new URLSearchParams({addParents:folderId,fields:'id,parents'});
    if(removeParents)params.set('removeParents',removeParents);
    await api(`${DRIVE}/files/${sheetId}?${params}`,token,{method:'PATCH'});
  }
  const rows=[['ID','Start','End','Minutes','Activity','Category','Importance','Urgency','Value alignment','Feeling','Capture','Text']];
  for(const e of state.entries.filter(e=>!e.deletedAt)){
    rows.push([e.id,e.startAt,e.endAt,String(Math.max(0,Math.round((Date.parse(e.endAt)-Date.parse(e.startAt))/60000))),e.activityId,categoryOf(e.activityId,state.categoryOverrides),e.ratings.importance?.toString()??'',e.ratings.urgency?.toString()??'',e.ratings.valueAlignment?.toString()??'',e.feeling?.toString()??'',e.captureMode,sheetCell(e.customText)]);
  }
  const total=1+Math.ceil(rows.length/500);
  let completed=0;
  onProgress?.({stage:'sheet',completed,total});
  await api(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Entries!A:L:clear`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  onProgress?.({stage:'sheet',completed:++completed,total});
  for(let start=0;start<rows.length;start+=500){
    await api(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Entries!A${start+1}:L${Math.min(start+500,rows.length)}?valueInputOption=RAW`,token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:rows.slice(start,start+500)})});
    onProgress?.({stage:'sheet',completed:++completed,total});
  }
  return sheetId;
}
