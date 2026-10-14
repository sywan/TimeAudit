import type { Profile } from './types';

interface CredentialResponse { credential?: string; }
interface TokenResponse { access_token?: string; error?: string; }
interface GoogleAccounts {
  id: {
    initialize(options:{client_id:string;callback:(response:CredentialResponse)=>void;auto_select?:boolean}):void;
    renderButton(element:HTMLElement,options:{type?:string;theme?:string;size?:string;shape?:string;text?:string;width?:number}):void;
    disableAutoSelect():void;
  };
  oauth2: {
    initTokenClient(options:{client_id:string;scope:string;login_hint?:string;callback:(response:TokenResponse)=>void;error_callback?:(error:{type:string})=>void}):{requestAccessToken(options?:{prompt?:string}):void};
    revoke(token:string,callback:()=>void):void;
  };
}
declare global { interface Window { google?: {accounts:GoogleAccounts}; } }

export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';

export function waitForGoogle(timeoutMs=10000):Promise<GoogleAccounts> {
  return new Promise((resolve,reject)=>{
    const start=Date.now();
    const poll=()=>{
      if(window.google?.accounts) {resolve(window.google.accounts);return;}
      if(Date.now()-start>timeoutMs){reject(new Error('Google Identity Services did not load'));return;}
      setTimeout(poll,100);
    };
    poll();
  });
}

function decodeJwtPayload(token:string):Record<string,unknown> {
  const part=token.split('.')[1];
  if(!part) throw new Error('Invalid Google credential');
  const base64=part.replace(/-/g,'+').replace(/_/g,'/');
  return JSON.parse(decodeURIComponent(Array.from(atob(base64),c=>`%${c.charCodeAt(0).toString(16).padStart(2,'0')}`).join(''))) as Record<string,unknown>;
}

export async function mountGoogleButton(element:HTMLElement,onProfile:(profile:Profile)=>void):Promise<void> {
  const accounts=window.google?.accounts ?? await waitForGoogle();
  accounts.id.initialize({client_id:googleClientId,callback:response=>{
    if(!response.credential)return;
    const claims=decodeJwtPayload(response.credential);
    if(claims.aud!==googleClientId || typeof claims.sub!=='string') return;
    onProfile({sub:claims.sub,name:String(claims.name??''),email:String(claims.email??''),picture:typeof claims.picture==='string'?claims.picture:undefined});
  }});
  element.replaceChildren();
  accounts.id.renderButton(element,{type:'standard',theme:'outline',size:'large',shape:'pill',text:'continue_with',width:300});
}

export async function requestDriveToken(expectedSub:string):Promise<string> {
  const accounts=window.google?.accounts ?? await waitForGoogle();
  return new Promise((resolve,reject)=>{
    const client=accounts.oauth2.initTokenClient({client_id:googleClientId,scope:'openid profile email https://www.googleapis.com/auth/drive.file',login_hint:expectedSub,error_callback:error=>{
      reject(new Error(error.type==='popup_closed'?'Google Drive authorization was closed.':error.type==='popup_failed_to_open'?'The browser blocked Google Drive authorization. Please allow pop-ups for this site.':`Google Drive authorization error: ${error.type}`));
    },callback:async r=>{
      if(!r.access_token){reject(new Error(r.error??'Google Drive authorization failed'));return;}
      try{
        const response=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${r.access_token}`}});
        if(!response.ok)throw new Error('Could not verify the Google Drive account');
        const user=await response.json() as {sub?:string};
        if(user.sub!==expectedSub){accounts.oauth2.revoke(r.access_token,()=>{});throw new Error('Please authorize the same Google account used to sign in.');}
        resolve(r.access_token);
      }catch(error){reject(error);}
    }});
    client.requestAccessToken({prompt:''});
  });
}

export function signOutGoogle() { window.google?.accounts.id.disableAutoSelect(); }
