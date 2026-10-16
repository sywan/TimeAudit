import {useEffect,useRef,useState} from 'react';
import {Mic,Square} from 'lucide-react';
import {journalSummary,journalVersionsForDay} from './journal.ts';
import type {AuditState,DailyJournal,Entry} from './types.ts';
import type {Locale} from './i18n.ts';

interface VoiceResult {isFinal:boolean;[index:number]:{transcript:string}}
interface VoiceEvent {resultIndex:number;results:ArrayLike<VoiceResult>}
interface VoiceRecognition {
  lang:string;continuous:boolean;interimResults:boolean;
  onresult:((event:VoiceEvent)=>void)|null;
  onerror:((event:{error:string})=>void)|null;
  onend:(()=>void)|null;
  start:()=>void;stop:()=>void;
}
type VoiceConstructor=new()=>VoiceRecognition;
const voiceConstructor=():VoiceConstructor|undefined=>{
  const voiceWindow=window as Window & {SpeechRecognition?:VoiceConstructor;webkitSpeechRecognition?:VoiceConstructor};
  return voiceWindow.SpeechRecognition??voiceWindow.webkitSpeechRecognition;
};

export default function DailyJournalCard({audit,entries,day,start,end,locale,save}:{audit:AuditState;entries:Entry[];day:string;start:number;end:number;locale:Locale;save:(item:DailyJournal)=>void}){
  const versions=journalVersionsForDay(audit.journals??[],day);
  const latest=versions[0];
  const [draft,setDraft]=useState(latest?.note??'');
  const [listening,setListening]=useState(false);
  const [interim,setInterim]=useState('');
  const [message,setMessage]=useState('');
  const sessionId=useRef(crypto.randomUUID());
  const draftRef=useRef(draft);
  const editing=useRef(false);
  const recognitionRef=useRef<VoiceRecognition|null>(null);
  const textareaRef=useRef<HTMLTextAreaElement>(null);
  const summary=journalSummary(audit,entries,locale,start,end);

  useEffect(()=>{
    if(!editing.current){const incoming=latest?.note??'';draftRef.current=incoming;setDraft(incoming);}
  },[latest?.id,latest?.updatedAt]);
  useEffect(()=>()=>{recognitionRef.current?.stop();},[]);

  const update=(next:string)=>{
    editing.current=true;
    draftRef.current=next;
    setDraft(next);
    save({id:sessionId.current,day,note:next,updatedAt:new Date().toISOString()});
  };
  const startVoice=()=>{
    if(recognitionRef.current){recognitionRef.current.stop();return;}
    const Constructor=voiceConstructor();
    if(!Constructor){
      setMessage(locale==='zh-TW'?'此瀏覽器未提供網頁語音辨識；可點入日記欄，使用手機鍵盤的麥克風口述。':'This browser does not expose web speech recognition. You can use your keyboard’s dictation button in the journal field.');
      textareaRef.current?.focus();return;
    }
    const recognition=new Constructor();
    recognition.lang=locale==='zh-TW'?'zh-TW':'en-US';
    recognition.continuous=true;
    recognition.interimResults=true;
    recognition.onresult=event=>{
      let final='',partial='';
      for(let i=event.resultIndex;i<event.results.length;i++){
        const result=event.results[i];
        if(result.isFinal)final+=result[0]?.transcript??'';
        else partial+=result[0]?.transcript??'';
      }
      setInterim(partial);
      if(final.trim()){
        const separator=draftRef.current&&!/\s$/.test(draftRef.current)?(locale==='zh-TW'?'':' '):'';
        update(`${draftRef.current}${separator}${final.trim()}`);
      }
    };
    recognition.onerror=event=>setMessage(locale==='zh-TW'?`語音輸入未完成（${event.error}）。仍可打字或使用鍵盤麥克風。`:`Voice input stopped (${event.error}). You can still type or use keyboard dictation.`);
    recognition.onend=()=>{recognitionRef.current=null;setListening(false);setInterim('');};
    try{recognition.start();recognitionRef.current=recognition;setListening(true);setMessage('');}
    catch{setMessage(locale==='zh-TW'?'目前無法啟動麥克風；可改用鍵盤語音輸入。':'The microphone could not start. Try keyboard dictation instead.');}
  };
  return <section className="card journal-card" onTouchStart={event=>event.stopPropagation()} onTouchEnd={event=>event.stopPropagation()}>
    <div className="section-head"><div><span className="overline">DAILY JOURNAL</span><h2>{locale==='zh-TW'?'這一天的日記':'Daily journal'}</h2></div><span className="journal-save-note">{locale==='zh-TW'?'自動儲存 · 連結 Drive 後可同步':'Autosaved · syncs when Drive is connected'}</span></div>
    <div className="journal-paper">
      <div className="journal-auto"><small>{locale==='zh-TW'?'由活動紀錄整理 · 會自動更新':'From your activity entries · updates automatically'}</small><p>{summary}</p></div>
      <label className="journal-label" htmlFor={`journal-${day}`}>{locale==='zh-TW'?'我的心情與筆記':'My thoughts and notes'}</label>
      <textarea ref={textareaRef} id={`journal-${day}`} value={draft} onChange={event=>update(event.target.value)} placeholder={locale==='zh-TW'?'今天發生了什麼？有什麼心情或想記下的事？':'What happened today? What would you like to remember?'} rows={6}/>
    </div>
    <div className="journal-actions"><button className={`secondary-button compact ${listening?'journal-listening':''}`} type="button" aria-pressed={listening} onClick={startVoice}>{listening?<Square size={16}/>:<Mic size={16}/>} {listening?(locale==='zh-TW'?'停止口述':'Stop dictation'):(locale==='zh-TW'?'口述日記':'Dictate')}</button><small>{locale==='zh-TW'?'語音辨識由瀏覽器／系統提供，可能使用其語音服務；首次使用會詢問麥克風權限。':'Speech recognition is provided by your browser or system and may use its speech service; microphone permission may be requested.'}</small></div>
    {interim&&<p className="journal-interim" role="status">{interim}</p>}
    {message&&<p className="journal-message" role="status">{message}</p>}
    {versions.length>1&&<details className="journal-history"><summary>{locale==='zh-TW'?`先前版本（${versions.length-1}）`:`Earlier versions (${versions.length-1})`}</summary><div>{versions.slice(1).map(version=><div key={version.id}><span>{new Date(version.updatedAt).toLocaleString(locale)} · {version.note.slice(0,70)||'—'}</span><button className="text-button" onClick={()=>update(version.note)}>{locale==='zh-TW'?'還原':'Restore'}</button></div>)}</div></details>}
  </section>;
}
