export interface SpeechResult {isFinal:boolean;[index:number]:{transcript:string}}
export interface SpeechEvent {resultIndex:number;results:ArrayLike<SpeechResult>}

// WebKit exposes speech recognition inside iOS Home Screen web apps even where
// that implementation cannot return a transcript. Native keyboard dictation
// remains available in the editable journal field.
export function preferKeyboardDictation(userAgent:string,standalone:boolean,maxTouchPoints=0):boolean{
  return standalone&&(/iPhone|iPad|iPod/i.test(userAgent)||(/Macintosh/i.test(userAgent)&&maxTouchPoints>1));
}

export function speechText(event:SpeechEvent):{final:string;interim:string}{
  let final='',interim='';
  for(let index=event.resultIndex;index<event.results.length;index++){
    const result=event.results[index];
    if(!result)continue;
    const transcript=result[0]?.transcript??'';
    if(result.isFinal)final+=transcript;
    else interim+=transcript;
  }
  return {final:final.trim(),interim:interim.trim()};
}
