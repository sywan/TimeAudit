import {useEffect, useState} from 'react';
import type {Locale} from './i18n';

const appKey=(import.meta.env.VITE_YOUVERSION_APP_KEY as string|undefined)?.trim()??'';
const version={
  'zh-TW':{id:1392,label:'當代譯本',short:'CCBT'},
  en:{id:2692,label:'New American Standard Bible 2020',short:'NASB2020'},
} as const;

export function dayOfYear(date:string):number{
  const [year,month,day]=date.split('-').map(Number);
  return Math.floor((Date.UTC(year,month-1,day)-Date.UTC(year,0,1))/86400000)+1;
}

interface VotdResponse {day:number;passage_id:string;}
interface PassageResponse {id:string;content:string;reference:string;}
interface BibleResponse {copyright?:string;}
interface Verse {key:string;passageId:string;text:string;reference:string;copyright:string;}

export default function DailyVerse({date,locale}:{date:string;locale:Locale}){
  const [verse,setVerse]=useState<Verse|null>(null);
  const [status,setStatus]=useState<'loading'|'ready'|'unavailable'|'needsKey'|'otherYear'>(appKey?'loading':'needsKey');
  const day=dayOfYear(date);
  const currentYear=date.slice(0,4)===String(new Date().getFullYear());
  const bible=version[locale];
  const key=`${day}:${bible.id}`;
  const dailyUrl=`https://www.bible.com/verse-of-the-day?day=${day}`;
  const passageUrl=verse?.key===key?`https://www.bible.com/bible/${bible.id}/${encodeURIComponent(verse.passageId)}.${encodeURIComponent(bible.short)}`:dailyUrl;

  useEffect(()=>{
    if(!currentYear){setVerse(null);setStatus('otherYear');return;}
    if(!appKey){setVerse(null);setStatus('needsKey');return;}
    const controller=new AbortController();
    setVerse(null);setStatus('loading');
    const headers={'X-YVP-App-Key':appKey};
    const getJson=async<T,>(url:string):Promise<T>=>{
      const response=await fetch(url,{headers,signal:controller.signal});
      if(!response.ok)throw new Error(`YouVersion API ${response.status}`);
      return response.json() as Promise<T>;
    };
    void (async()=>{
      const daily=await getJson<VotdResponse>(`https://api.youversion.com/v1/verse-of-the-days/${day}`);
      if(!/^[A-Z0-9.\-]+$/.test(daily.passage_id))throw new Error('Invalid passage reference');
      const [passage,bibleInfo]=await Promise.all([
        getJson<PassageResponse>(`https://api.youversion.com/v1/bibles/${bible.id}/passages/${daily.passage_id}?format=text`),
        getJson<BibleResponse>(`https://api.youversion.com/v1/bibles/${bible.id}`),
      ]);
      if(!passage.content?.trim()||!bibleInfo.copyright?.trim())throw new Error('Missing passage or copyright attribution');
      if(!controller.signal.aborted){setVerse({key,passageId:daily.passage_id,text:passage.content.trim(),reference:passage.reference,copyright:bibleInfo.copyright.trim()});setStatus('ready');}
    })().catch(error=>{if(!controller.signal.aborted){console.warn('YouVersion daily verse',error);setStatus('unavailable');}});
    return()=>controller.abort();
  },[day,bible.id,key,currentYear]);

  const zh=locale==='zh-TW';
  const visible=currentYear&&verse?.key===key?verse:null;
  return <aside className="daily-verse" aria-label={zh?'當日經文':'Verse for this day'}>
    <div className="daily-verse-heading"><span className="daily-verse-mark" aria-hidden="true">✦</span><span>{zh?'當日經文':'Verse for this day'}</span></div>
    {visible?<><p className="daily-verse-text" aria-live="polite">{visible.text}</p><div className="daily-verse-foot"><strong>{visible.reference}</strong><a href={passageUrl} target="_blank" rel="noreferrer">{bible.label} ↗</a></div><small className="daily-verse-copyright">{visible.copyright}</small></>:<><p className="daily-verse-text daily-verse-placeholder" aria-live="polite">{status==='otherYear'?(zh?'YouVersion 目前沒有可查詢該年份的每日經文。':'YouVersion does not provide a year-specific daily verse for this date.'):status==='loading'?(zh?'正在載入經文…':'Loading verse…'):status==='needsKey'?(zh?'到 YouVersion 閱讀，並選擇當代譯本。':'Read on YouVersion and select NASB 2020.'):(zh?'目前無法載入經文，請到 YouVersion 閱讀。':'The verse could not be loaded. Read it on YouVersion.')}</p><div className="daily-verse-foot"><span>{zh?'偏好：':'Preferred: '}{bible.label}</span>{currentYear&&<a href={dailyUrl} target="_blank" rel="noreferrer">{zh?'開啟 YouVersion ↗':'Open YouVersion ↗'}</a>}</div></>}
  </aside>;
}
