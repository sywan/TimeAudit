import {useEffect,useRef,useState} from 'react';
import {Keyboard,Mic,Square,X} from 'lucide-react';
import {journalSummary,journalVersionsForDay} from './journal.ts';
import {preferKeyboardDictation,speechText,type SpeechEvent} from './dictation.ts';
import type {AuditState,DailyJournal,Entry} from './types.ts';
import type {Locale} from './i18n.ts';

interface VoiceRecognition {
  lang:string;continuous:boolean;interimResults:boolean;
  onstart:(()=>void)|null;
  onaudiostart:(()=>void)|null;
  onsoundstart:(()=>void)|null;
  onsoundend:(()=>void)|null;
  onresult:((event:SpeechEvent)=>void)|null;
  onerror:((event:{error:string})=>void)|null;
  onend:(()=>void)|null;
  start:()=>void;stop:()=>void;abort:()=>void;
}
type VoiceConstructor=new()=>VoiceRecognition;
type VoicePhase='idle'|'starting'|'listening'|'hearing'|'processing';
interface VoiceSession {recognition:VoiceRecognition;startupTimer:number;limitTimer:number;stopTimer:number;hasResult:boolean;requestedStop:boolean}
const voiceConstructor=():VoiceConstructor|undefined=>{
  const voiceWindow=window as Window & {SpeechRecognition?:VoiceConstructor;webkitSpeechRecognition?:VoiceConstructor};
  return voiceWindow.SpeechRecognition??voiceWindow.webkitSpeechRecognition;
};

export default function DailyJournalCard({audit,entries,day,start,end,locale,save}:{audit:AuditState;entries:Entry[];day:string;start:number;end:number;locale:Locale;save:(item:DailyJournal)=>void}){
  const versions=journalVersionsForDay(audit.journals??[],day);
  const latest=versions[0];
  const [draft,setDraft]=useState(latest?.note??'');
  const [mood,setMood]=useState<number|null>(latest?.mood??null);
  const [voicePhase,setVoicePhase]=useState<VoicePhase>('idle');
  const [interim,setInterim]=useState('');
  const [message,setMessage]=useState('');
  const [keyboardGuide,setKeyboardGuide]=useState(false);
  const sessionId=useRef(crypto.randomUUID());
  const draftRef=useRef(draft);
  const editing=useRef(false);
  const voiceSession=useRef<VoiceSession|null>(null);
  const textareaRef=useRef<HTMLTextAreaElement>(null);
  const summary=journalSummary(audit,entries,locale,start,end);
  const standalone=window.matchMedia('(display-mode: standalone)').matches||Boolean((navigator as Navigator & {standalone?:boolean}).standalone);
  const keyboardOnly=preferKeyboardDictation(navigator.userAgent,standalone,navigator.maxTouchPoints)||!voiceConstructor();

  useEffect(()=>{
    if(!editing.current){const incoming=latest?.note??'';draftRef.current=incoming;setDraft(incoming);setMood(latest?.mood??null);}
  },[latest?.id,latest?.updatedAt]);
  useEffect(()=>()=>{
    const session=voiceSession.current;
    voiceSession.current=null;
    if(session){
      window.clearTimeout(session.startupTimer);window.clearTimeout(session.limitTimer);window.clearTimeout(session.stopTimer);
      session.recognition.onstart=null;session.recognition.onaudiostart=null;session.recognition.onsoundstart=null;
      session.recognition.onsoundend=null;session.recognition.onresult=null;session.recognition.onerror=null;session.recognition.onend=null;
      try{session.recognition.abort();}catch{/* Browser session already ended. */}
    }
  },[]);

  const update=(next:string)=>{
    editing.current=true;
    draftRef.current=next;
    setDraft(next);
    save({id:sessionId.current,day,note:next,mood,updatedAt:new Date().toISOString()});
  };
  const finishVoice=(session:VoiceSession,notice='')=>{
    if(voiceSession.current!==session)return;
    voiceSession.current=null;
    window.clearTimeout(session.startupTimer);window.clearTimeout(session.limitTimer);window.clearTimeout(session.stopTimer);
    session.recognition.onstart=null;session.recognition.onaudiostart=null;session.recognition.onsoundstart=null;
    session.recognition.onsoundend=null;session.recognition.onresult=null;session.recognition.onerror=null;session.recognition.onend=null;
    setVoicePhase('idle');setInterim('');
    if(notice)setMessage(notice);
  };
  const startVoice=()=>{
    const active=voiceSession.current;
    if(active){
      if(voicePhase==='processing')return;
      active.requestedStop=true;
      setVoicePhase('processing');
      try{voicePhase==='starting'?active.recognition.abort():active.recognition.stop();}
      catch{finishVoice(active);return;}
      active.stopTimer=window.setTimeout(()=>finishVoice(active),3000);
      return;
    }
    if(preferKeyboardDictation(navigator.userAgent,standalone,navigator.maxTouchPoints)){
      setKeyboardGuide(true);
      return;
    }
    const Constructor=voiceConstructor();
    if(!Constructor){
      setKeyboardGuide(true);
      return;
    }
    let recognition:VoiceRecognition;
    try{recognition=new Constructor();}
    catch{setMessage(locale==='zh-TW'?'瀏覽器無法啟動語音辨識；請使用鍵盤麥克風。':'The browser could not open speech recognition. Use keyboard dictation.');return;}
    recognition.lang=locale==='zh-TW'?'zh-TW':'en-US';
    // One utterance per tap is more reliable in WebKit; continuous sessions can
    // remain alive without results or end events after microphone authorization.
    recognition.continuous=false;
    recognition.interimResults=true;
    const session:VoiceSession={recognition,startupTimer:0,limitTimer:0,stopTimer:0,hasResult:false,requestedStop:false};
    voiceSession.current=session;
    setVoicePhase('starting');setInterim('');setMessage(locale==='zh-TW'?'正在啟動麥克風…':'Starting microphone…');
    const ready=()=>{if(voiceSession.current!==session)return;window.clearTimeout(session.startupTimer);setVoicePhase('listening');setMessage('');};
    recognition.onstart=()=>{if(voiceSession.current===session)setMessage(locale==='zh-TW'?'正在等待麥克風…':'Waiting for microphone…');};
    recognition.onaudiostart=ready;
    recognition.onsoundstart=()=>{ready();setVoicePhase('hearing');};
    recognition.onsoundend=()=>{if(voiceSession.current===session)setVoicePhase('listening');};
    recognition.onresult=event=>{
      if(voiceSession.current!==session)return;
      const {final,interim:partial}=speechText(event);
      if(final||partial){session.hasResult=true;ready();setVoicePhase('hearing');}
      setInterim(partial);
      if(final){
        const separator=draftRef.current&&!/\s$/.test(draftRef.current)?(locale==='zh-TW'?'':' '):'';
        update(`${draftRef.current}${separator}${final}`);
      }
    };
    recognition.onerror=event=>finishVoice(session,locale==='zh-TW'?`語音輸入未完成（${event.error}）；請再試一次或使用鍵盤麥克風。`:`Voice input stopped (${event.error}). Try again or use keyboard dictation.`);
    recognition.onend=()=>finishVoice(session,session.hasResult||session.requestedStop?'':locale==='zh-TW'?'沒有辨識到語音；請再試一次或使用鍵盤麥克風。':'No speech was recognized. Try again or use keyboard dictation.');
    session.startupTimer=window.setTimeout(()=>{
      if(voiceSession.current!==session)return;
      try{recognition.abort();}catch{/* Timeout already ends this attempt. */}
      finishVoice(session,locale==='zh-TW'?'麥克風未開始接收聲音；請再試一次或使用鍵盤麥克風。':'The microphone did not start receiving audio. Try again or use keyboard dictation.');
    },10000);
    session.limitTimer=window.setTimeout(()=>{
      if(voiceSession.current!==session)return;
      try{recognition.abort();}catch{/* Timeout already ends this attempt. */}
      finishVoice(session,locale==='zh-TW'?'這次口述已結束；已辨識的文字已儲存，可再按一次繼續。':'This dictation session ended. Recognized text is saved; tap again to continue.');
    },90000);
    try{recognition.start();}
    catch{finishVoice(session,locale==='zh-TW'?'目前無法啟動麥克風；可改用鍵盤語音輸入。':'The microphone could not start. Try keyboard dictation instead.');}
  };
  return <section className="card journal-card" onTouchStart={event=>event.stopPropagation()} onTouchEnd={event=>event.stopPropagation()}>
    <div className="section-head"><div><span className="overline">DAILY JOURNAL</span><h2>{locale==='zh-TW'?'這一天的日記':'Daily journal'}</h2></div><span className="journal-save-note">{locale==='zh-TW'?'自動儲存 · 連結 Drive 後可同步':'Autosaved · syncs when Drive is connected'}</span></div>
    <div className="journal-paper">
      <div className="journal-auto"><small>{locale==='zh-TW'?'由活動紀錄整理 · 會自動更新':'From your activity entries · updates automatically'}</small><p>{summary}</p></div>
      <div className="journal-mood"><strong>{locale==='zh-TW'?'這一天整體的心情':'Overall mood today'}</strong><small>{locale==='zh-TW'?'1 非常不好 · 4 平淡 · 7 非常好；與每段活動感受分開':'1 very low · 4 neutral · 7 very good; separate from activity feelings'}</small><div className="rating-choices" role="group" aria-label={locale==='zh-TW'?'每日心情':'Daily mood'}>{[1,2,3,4,5,6,7].map(n=><button key={n} type="button" className={mood===n?'selected':''} aria-pressed={mood===n} onClick={()=>{setMood(n);editing.current=true;save({id:sessionId.current,day,note:draftRef.current,mood:n,updatedAt:new Date().toISOString()});}}>{n}</button>)}<button type="button" className={`na-button ${mood===null?'selected':''}`} onClick={()=>{setMood(null);editing.current=true;save({id:sessionId.current,day,note:draftRef.current,mood:null,updatedAt:new Date().toISOString()});}}>{locale==='zh-TW'?'略過':'Skip'}</button></div></div>
      <label className="journal-label" htmlFor={`journal-${day}`}>{locale==='zh-TW'?'我的心情與筆記':'My thoughts and notes'}</label>
      <textarea ref={textareaRef} id={`journal-${day}`} value={draft} onChange={event=>update(event.target.value)} placeholder={locale==='zh-TW'?'今天發生了什麼？有什麼心情或想記下的事？':'What happened today? What would you like to remember?'} rows={6}/>
    </div>
    <div className="journal-actions"><button className={`secondary-button compact ${voicePhase!=='idle'?'journal-listening':''}`} type="button" aria-pressed={voicePhase!=='idle'} onClick={startVoice}>{voicePhase==='idle'?(keyboardOnly?<Keyboard size={16}/>:<Mic size={16}/>):<Square size={16}/>} {voicePhase==='idle'?(keyboardOnly?(locale==='zh-TW'?'使用鍵盤口述':'Use keyboard dictation'):(locale==='zh-TW'?'口述日記':'Dictate')):voicePhase==='processing'?(locale==='zh-TW'?'正在結束…':'Finishing…'):(locale==='zh-TW'?'停止口述':'Stop dictation')}</button>{(voicePhase==='listening'||voicePhase==='hearing')&&<span className={`journal-wave ${voicePhase==='hearing'?'journal-wave-hearing':''}`} role="status"><span className="journal-wave-bars" aria-hidden="true"><i/><i/><i/><i/><i/></span>{locale==='zh-TW'?'正在聆聽':'Listening'}</span>}{voicePhase==='starting'&&<span className="journal-voice-starting" role="status">{locale==='zh-TW'?'正在啟動收音…':'Starting audio…'}</span>}<small>{keyboardOnly?(locale==='zh-TW'?'此模式使用系統鍵盤上的麥克風，按此查看操作步驟。':'This mode uses the microphone on your system keyboard. Tap for instructions.'):(locale==='zh-TW'?'語音辨識由瀏覽器／系統提供，可能使用其語音服務；首次使用會詢問麥克風權限。':'Speech recognition is provided by your browser or system and may use its speech service; microphone permission may be requested.')}</small></div>
    {interim&&<p className="journal-interim" role="status">{interim}</p>}
    {message&&<p className="journal-message" role="status">{message} {!keyboardOnly&&voicePhase==='idle'&&<button type="button" className="text-button" onClick={()=>setKeyboardGuide(true)}>{locale==='zh-TW'?'改用鍵盤口述':'Use keyboard dictation'}</button>}</p>}
    {keyboardGuide&&<div className="dictation-guide-backdrop" onClick={()=>setKeyboardGuide(false)}><div className="dictation-guide" role="dialog" aria-modal="true" aria-labelledby="dictation-guide-title" onClick={event=>event.stopPropagation()}><button className="icon-button dictation-guide-close" type="button" aria-label={locale==='zh-TW'?'關閉':'Close'} onClick={()=>setKeyboardGuide(false)}><X size={18}/></button><Keyboard size={24}/><h3 id="dictation-guide-title">{locale==='zh-TW'?'使用鍵盤麥克風口述':'Dictate with your keyboard'}</h3><p>{locale==='zh-TW'?'此瀏覽器模式無法由網頁直接啟動語音辨識。先點日記文字欄，再點手機鍵盤上的麥克風；說出的話會直接寫進日記。':'This browser mode cannot start speech recognition from the webpage. Tap the journal field, then tap the microphone on your phone keyboard. Your words will appear in the journal.'}</p><button className="primary-button" type="button" onClick={()=>{setKeyboardGuide(false);textareaRef.current?.focus();}}>{locale==='zh-TW'?'前往日記欄':'Go to journal field'}</button></div></div>}
    {versions.length>1&&<details className="journal-history"><summary>{locale==='zh-TW'?`先前版本（${versions.length-1}）`:`Earlier versions (${versions.length-1})`}</summary><div>{versions.slice(1).map(version=><div key={version.id}><span>{new Date(version.updatedAt).toLocaleString(locale)} · {version.note.slice(0,70)||'—'}</span><button className="text-button" onClick={()=>update(version.note)}>{locale==='zh-TW'?'還原':'Restore'}</button></div>)}</div></details>}
  </section>;
}
