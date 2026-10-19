import {useEffect,useRef,useState} from 'react';
import {Check,Copy,Download,ExternalLink,X} from 'lucide-react';
import type {Locale} from './i18n';
import './ShareDialog.css';

const SITE_URL='https://sywan.github.io/TimeAudit/';

export default function ShareDialog({locale,onClose,qrSrc}:{locale:Locale;onClose:()=>void;qrSrc:string}){
  const [copied,setCopied]=useState(false);
  const closeButton=useRef<HTMLButtonElement>(null);
  const urlInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    closeButton.current?.focus();
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
    window.addEventListener('keydown',escape);
    return()=>window.removeEventListener('keydown',escape);
  },[onClose]);
  const copy=async()=>{
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(SITE_URL);
      else{urlInput.current?.select();if(!document.execCommand('copy'))throw new Error('Copy unavailable');}
      setCopied(true);
      window.setTimeout(()=>setCopied(false),2500);
    }catch{urlInput.current?.select();setCopied(false);}
  };
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="entry-modal share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="modal-head"><div><span className="overline">TIME AUDIT</span><h2 id="share-title">{locale==='zh-TW'?'分享 Time Audit':'Share Time Audit'}</h2></div><button ref={closeButton} className="icon-button" onClick={onClose} aria-label={locale==='zh-TW'?'關閉分享視窗':'Close share dialog'}><X size={20}/></button></div>
      <div className="modal-body share-body"><p>{locale==='zh-TW'?'請對方掃描 QR Code，或傳送下方網址。對方會以自己的 Google 帳號登入；你的個人紀錄不會包含在分享連結裡。':'Ask someone to scan the QR code, or send the link below. They sign in with their own Google account; your personal entries are not part of the link.'}</p><img className="share-qr" src={qrSrc} alt={locale==='zh-TW'?'開啟 Time Audit 網站的 QR Code':'QR code for the Time Audit website'}/><label className="share-url-label" htmlFor="share-site-url">{locale==='zh-TW'?'網站網址':'Website URL'}</label><input id="share-site-url" ref={urlInput} className="share-url" value={SITE_URL} readOnly onFocus={event=>event.currentTarget.select()}/><div className="share-actions"><button className="primary-button" onClick={()=>void copy()}>{copied?<Check size={17}/>:<Copy size={17}/>}{copied?(locale==='zh-TW'?'已複製':'Copied'):(locale==='zh-TW'?'複製網址':'Copy link')}</button><a className="secondary-button" href={qrSrc} download="QR-CODE_TimeAudit.png"><Download size={17}/>{locale==='zh-TW'?'下載 QR Code':'Download QR code'}</a><a className="secondary-button" href={SITE_URL} target="_blank" rel="noreferrer"><ExternalLink size={17}/>{locale==='zh-TW'?'開啟網站':'Open site'}</a></div></div>
    </section>
  </div>;
}
