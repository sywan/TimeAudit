import type { AuditState, Entry } from './types';
import { categoryOf, initialState, withV09CategoryDefaults } from './types';

const DRIVE='https://www.googleapis.com/drive/v3';
const UPLOAD='https://www.googleapis.com/upload/drive/v3';

async function api<T>(url:string,token:string,init:RequestInit={}):Promise<T> {
  const response=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers}});
  if(!response.ok){const detail=await response.text();throw new Error(`Google API ${response.status}: ${detail.slice(0,180)}`);}
  if(response.status===204)return undefined as T;
  return response.json() as Promise<T>;
}

interface DriveFile {id:string;name:string;parents?:string[];}

const escapeQ=(value:string)=>value.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

async function findFile(name:string,token:string,parent?:string):Promise<DriveFile|null>{
  const q=`name = '${escapeQ(name)}' and trashed = false${parent?` and '${escapeQ(parent)}' in parents`:''}`;
  const params=new URLSearchParams({q,fields:'files(id,name,parents),nextPageToken',pageSize:'100'});
  const result=await api<{files:DriveFile[]}>(`${DRIVE}/files?${params}`,token);
  return result.files[0]??null;
}

async function createFolder(token:string):Promise<string>{
  const found=await findFile('Time Audit',token);
  if(found)return found.id;
  const created=await api<DriveFile>(`${DRIVE}/files?fields=id,name`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Time Audit',mimeType:'application/vnd.google-apps.folder'})});
  return created.id;
}

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
    const params=new URLSearchParams({q,fields:'files(id,name),nextPageToken',pageSize:'1000'});
    if(pageToken)params.set('pageToken',pageToken);
    const result=await api<{files:DriveFile[];nextPageToken?:string}>(`${DRIVE}/files?${params}`,token);
    files.push(...result.files);pageToken=result.nextPageToken??'';
  }while(pageToken);
  return files;
}

export interface SyncConflict {local:Entry;remote:Entry;}

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

export async function syncWithDrive(local:AuditState,token:string):Promise<{state:AuditState;conflicts:SyncConflict[];folderId:string}>{
  const folderId=await createFolder(token);
  const files=await listFiles(folderId,token);
  const profileFile=files.find(f=>f.name==='profile.json');
  const remoteProfile=profileFile?await getJson<Partial<AuditState>>(profileFile,token):null;
  const monthFiles=files.filter(f=>/^entries-\d{4}-\d{2}\.json$/.test(f.name));
  const remoteEntries=(await Promise.all(monthFiles.map(f=>getJson<{entries:Entry[]}>(f,token)))).flatMap(x=>x.entries??[]);
  const {entries,conflicts}=mergeEntries(local.entries,remoteEntries);
  const state:AuditState=withV09CategoryDefaults({
    ...initialState(),
    ...local,
    ...(remoteProfile && (remoteProfile.updatedAt??'')>local.updatedAt ? {
      values:remoteProfile.values??local.values,goals:remoteProfile.goals??local.goals,
      preferences:{...local.preferences,...remoteProfile.preferences},questionnaires:remoteProfile.questionnaires??local.questionnaires,
      experiments:remoteProfile.experiments??local.experiments,
      customActivities:remoteProfile.customActivities??local.customActivities,
      categoryOverrides:remoteProfile.categoryOverrides??local.categoryOverrides,
      updatedAt:remoteProfile.updatedAt??local.updatedAt,
    }:{}),
    customActivities:[...new Map([...(remoteProfile?.customActivities??[]),...(local.customActivities??[])].map(item=>[item.id,item])).values()],
    entries,
  });
  if(conflicts.length)return {state,conflicts,folderId};
  const grouped=new Map<string,Entry[]>();
  for(const entry of entries){const month=entry.startAt.slice(0,7);grouped.set(month,[...(grouped.get(month)??[]),entry]);}
  for(const [month,items] of grouped)await putJson(`entries-${month}.json`,folderId,{schemaVersion:'0.2',entries:items},token);
  await putJson('profile.json',folderId,{schemaVersion:'0.2',values:state.values,goals:state.goals,preferences:state.preferences,questionnaires:state.questionnaires,experiments:state.experiments,customActivities:state.customActivities??[],categoryOverrides:state.categoryOverrides??{},updatedAt:state.updatedAt},token);
  return {state,conflicts,folderId};
}

const sheetCell=(value:string)=>/^[=+\-@]/.test(value)?`'${value}`:value;

export async function updateSheetMirror(state:AuditState,token:string,folderId:string):Promise<string>{
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
  const rows=[['ID','Start','End','Minutes','Activity','Category','Importance','Urgency','Value alignment','Capture','Text']];
  for(const e of state.entries.filter(e=>!e.deletedAt)){
    rows.push([e.id,e.startAt,e.endAt,String(Math.max(0,Math.round((Date.parse(e.endAt)-Date.parse(e.startAt))/60000))),e.activityId,categoryOf(e.activityId,state.categoryOverrides),e.ratings.importance?.toString()??'',e.ratings.urgency?.toString()??'',e.ratings.valueAlignment?.toString()??'',e.captureMode,sheetCell(e.customText)]);
  }
  await api(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Entries!A:K:clear`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  for(let start=0;start<rows.length;start+=500){
    await api(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Entries!A${start+1}:K${Math.min(start+500,rows.length)}?valueInputOption=RAW`,token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:rows.slice(start,start+500)})});
  }
  return sheetId;
}
