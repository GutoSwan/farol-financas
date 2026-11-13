/** Sessão confiável por até 30 dias. Nunca substitui senha ou TOTP. */
export const TRUST_MS=30*24*60*60*1000
const TRUST='farol:trusted-browser:v1'
const PENDING='farol:trust-pending:v1'
const MIGRATED='farol:session-migrated:v1'
let sessionKey=''
type Trust={userId:string;sessionId:string;expiresAt:number}
const local=()=>{try{return typeof window!=='undefined'?window.localStorage:null}catch{return null}}
const tab=()=>{try{return typeof window!=='undefined'?window.sessionStorage:null}catch{return null}}
function parse(raw:string|null):Record<string,unknown>|null{
  try{const d:unknown=JSON.parse(raw??'null');return d&&typeof d==='object'&&!Array.isArray(d)?d as Record<string,unknown>:null}catch{return null}
}
/** Apenas identifica a sessão; a autorização real continua no Supabase. */
export function sessionIdFromToken(jwt:string):string|null{
  try{
    const part=jwt.split('.')[1]
    if(!part||typeof atob!=='function')return null
    const d=parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')))
    return typeof d?.session_id==='string' && /^[0-9a-f-]{36}$/i.test(d.session_id)?d.session_id:null
  }catch{return null}
}
export function validTrust(v:unknown,now=Date.now()):v is Trust{
  if(!v||typeof v!=='object')return false
  const x=v as Record<string,unknown>
  return typeof x.userId==='string' && /^[0-9a-f-]{36}$/i.test(x.userId) &&
    typeof x.sessionId==='string' && /^[0-9a-f-]{36}$/i.test(x.sessionId) &&
    typeof x.expiresAt==='number' && Number.isFinite(x.expiresAt) &&
    x.expiresAt>now && x.expiresAt<=now+TRUST_MS
}
const record=()=>parse(local()?.getItem(TRUST)??null)
export function trustedSessionExpired():boolean{
  const r=record()
  return !!r && (typeof r.expiresAt!=='number'||r.expiresAt<=Date.now())
}
function sameSession(serialized:string,r:Trust):boolean{
  const session=parse(serialized)
  const user=parse(JSON.stringify(session?.user??null))
  return user?.id===r.userId && typeof session?.access_token==='string' &&
    sessionIdFromToken(session.access_token)===r.sessionId
}
/** Default: sessão da aba. Opt-in validado: sessão persistente no navegador.
 * Sessões da versão anterior são migradas uma vez, sem apagá-las.
 */
export function browserSessionStorage(url:string){
  sessionKey='sb-'+new URL(url).hostname.split('.')[0]+'-auth-token'
  return {
    getItem(key:string):string|null{
      const s=tab(),l=local()
      if(key!==sessionKey)return s?.getItem(key)??null
      const t=record(),saved=l?.getItem(key)??null
      if(validTrust(t)&&saved&&sameSession(saved,t))return saved
      if(t){
        l?.removeItem(key)
        if(!trustedSessionExpired())l?.removeItem(TRUST)
      }
      const current=s?.getItem(key)
      if(current)return current
      if(!t && saved && l?.getItem(MIGRATED)!=='1' && s){
        s.setItem(key,saved);l?.removeItem(key);l?.setItem(MIGRATED,'1')
        return saved
      }
      return null
    },
    setItem(key:string,value:string):void{
      const s=tab(),l=local(),t=record()
      if(key===sessionKey&&validTrust(t)&&sameSession(value,t)){
        l?.setItem(key,value);s?.removeItem(key)
      }else{
        s?.setItem(key,value)
        if(key===sessionKey)l?.removeItem(key)
      }
    },
    removeItem(key:string):void{tab()?.removeItem(key);local()?.removeItem(key)},
  }
}
export function preparePasswordLogin():void{
  local()?.removeItem(TRUST)
  local()?.removeItem(sessionKey)
  tab()?.removeItem(PENDING)
}
export function requestTrust(userId:string,wantsTrust:boolean):void{
  tab()?.removeItem(PENDING)
  if(wantsTrust && /^[0-9a-f-]{36}$/i.test(userId)){
    tab()?.setItem(PENDING,JSON.stringify({userId,at:Date.now()}))
  }
}
export function clearTrust():void{
  const token=local()?.getItem(sessionKey)
  if(token)tab()?.setItem(sessionKey,token)
  local()?.removeItem(sessionKey)
  local()?.removeItem(TRUST)
  tab()?.removeItem(PENDING)
}
type AuthClient={
  getUser:()=>Promise<{data:{user:{id:string}|null};error:unknown}>
  getSession:()=>Promise<{data:{session:{user:{id:string};access_token:string}|null};error:unknown}>
  mfa:{getAuthenticatorAssuranceLevel:()=>Promise<{data:{currentLevel:string}|null;error:unknown}>}
}
/** Depois de confirmar o autenticador, vincula a preferência à sessão AAL2. */
export async function activateTrustAfterMfa(auth:AuthClient):Promise<boolean>{
  const p=parse(tab()?.getItem(PENDING)??null)
  tab()?.removeItem(PENDING)
  if(typeof p?.userId!=='string'||typeof p.at!=='number'||
     Date.now()-p.at<0||Date.now()-p.at>15*60*1000)return false
  const [{data:who,error:whoError},{data:aal,error:aalError},
    {data:active,error:sessionError}]=await Promise.all([
      auth.getUser(),auth.mfa.getAuthenticatorAssuranceLevel(),auth.getSession()])
  const session=active.session
  if(whoError||aalError||sessionError||!who.user||!session||
     who.user.id!==p.userId||session.user.id!==p.userId||aal?.currentLevel!=='aal2')return false
  const id=sessionIdFromToken(session.access_token)
  if(!id)return false
  const trust:Trust={userId:p.userId,sessionId:id,expiresAt:Date.now()+TRUST_MS}
  const saved=tab()?.getItem(sessionKey)
  if(!saved||!sameSession(saved,trust)||!local())return false
  local()?.setItem(TRUST,JSON.stringify(trust))
  local()?.setItem(sessionKey,saved)
  tab()?.removeItem(sessionKey)
  return true
}
