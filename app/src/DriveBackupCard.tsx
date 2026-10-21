import {useEffect, useState} from 'react';
import {Cloud, Download, RefreshCw} from 'lucide-react';
import {listDriveBackups, readDriveBackup, type BackupPayload, type DriveBackup} from './drive';
import type {Locale} from './i18n';
import type {AuditState} from './types';

export default function DriveBackupCard({locale,token,preview,connectDrive,onCreate,onRestore}:{locale:Locale;token:string|null;preview:boolean;connectDrive:()=>void;onCreate:()=>Promise<void>;onRestore:(state:AuditState)=>Promise<void>}){
  const [backups,setBackups]=useState<DriveBackup[]>([]);
  const [selected,setSelected]=useState<{file:DriveBackup;payload:BackupPayload}|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const say=(zh:string,en:string)=>locale==='zh-TW'?zh:en;
  const load=async(currentToken=token)=>{
    if(!currentToken)return;
    setBusy(true);setMessage('');
    try{setBackups(await listDriveBackups(currentToken));}
    catch(error){setMessage(error instanceof Error?error.message:String(error));}
    finally{setBusy(false);}
  };
  useEffect(()=>{if(token)void load(token);else{setBackups([]);setSelected(null);}},[token]);
  const create=async()=>{
    if(!token)return;
    setBusy(true);setMessage('');
    try{await onCreate();setBackups(await listDriveBackups(token));setMessage(say('新的備份已保存在你的 Google Drive。','A new copy is saved in your Google Drive.'));}
    catch(error){setMessage(error instanceof Error?error.message:String(error));}
    finally{setBusy(false);}
  };
  const inspect=async(file:DriveBackup)=>{
    if(!token)return;
    setBusy(true);setMessage('');
    try{setSelected({file,payload:await readDriveBackup(file.id,token)});}
    catch(error){setMessage(error instanceof Error?error.message:String(error));}
    finally{setBusy(false);}
  };
  const restore=async()=>{
    if(!selected)return;
    if(!window.confirm(say('確定以這份備份取代目前資料？系統會先封存目前的 Drive 檔案。','Replace current data with this backup? Current Drive files will be archived first.')))return;
    setBusy(true);setMessage('');
    try{await onRestore(selected.payload.state);setSelected(null);setBackups(token?await listDriveBackups(token):[]);setMessage(say('已還原備份；還原前的資料也已封存。','Backup restored; the previous data was archived.'));}
    catch(error){setMessage(error instanceof Error?error.message:String(error));}
    finally{setBusy(false);}
  };
  return <section className="card settings-card drive-backup-card"><div className="section-head"><div><span className="overline">DRIVE BACKUP</span><h2>{say('備份與還原','Backup & restore')}</h2></div></div><p className="hint">{say('備份會把目前全部紀錄、日記、量表、價值、目標和設定存成獨立 JSON 副本。還原時會先封存目前的 Drive 資料，然後以所選副本取代。','A backup saves all current entries, journals, questionnaires, values, goals, and settings as a separate JSON copy. Restore archives the current Drive data before replacing it with the chosen copy.')}</p>
    {preview?<p className="hint">{say('預覽模式沒有 Google Drive；可使用下方的 JSON 匯出。','Preview mode has no Google Drive; use the JSON export below.')}</p>:!token?<button className="secondary-button" onClick={connectDrive}><Cloud size={16}/>{say('先授權 Google Drive','Authorize Google Drive first')}</button>:<><div className="button-stack"><button className="primary-button" disabled={busy} onClick={()=>void create()}><Cloud size={16}/>{say('建立 Drive 備份','Create Drive backup')}</button><button className="secondary-button" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/>{say('重新整理備份清單','Refresh backup list')}</button></div><div className="drive-backup-list">{backups.length===0?<p className="hint">{say('尚無備份副本。','No backup copies yet.')}</p>:backups.map(file=><button className={selected?.file.id===file.id?'selected':''} key={file.id} disabled={busy} onClick={()=>void inspect(file)}><Download size={16}/><span>{file.name}<small>{file.createdAt?new Date(file.createdAt).toLocaleString(locale):''}</small></span></button>)}</div>{selected&&<div className="drive-backup-preview"><strong>{say('還原前預覽','Review before restore')}</strong><p>{say(`備份時間：${new Date(selected.payload.createdAt).toLocaleString(locale)}。紀錄 ${selected.payload.state.entries.length} 筆、日記 ${(selected.payload.state.journals??[]).length} 筆、量表 ${selected.payload.state.questionnaires.length} 筆。`,`Created ${new Date(selected.payload.createdAt).toLocaleString(locale)}. ${selected.payload.state.entries.length} entries, ${(selected.payload.state.journals??[]).length} journals, ${selected.payload.state.questionnaires.length} questionnaires.`)}</p><p className="hint">{say('還原會取代目前資料；系統會先保存一份還原前副本。其他裝置請更新至此版本後再同步。','Restoring replaces current data, after saving a pre-restore copy. Update other devices to this version before syncing them.')}</p><button className="secondary-button" disabled={busy} onClick={()=>void restore()}>{say('還原這份備份','Restore this copy')}</button></div>}</>}
    {message&&<p className="calendar-import-message" role="status">{message}</p>}
  </section>;
}
