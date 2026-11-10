/**
 * ONE-SHOT isolated QA. Never schedule.
 * Public API only: mail.tm ephemeral mailboxes + Supabase Dev publishable key.
 * No admin token, no database credentials, no direct auth.users mutation.
 * Supabase Auth users may remain after the test: deletion needs a separate
 * authorized admin operation. Never claim they have been deleted.
 */
import { randomBytes, randomUUID, createHmac } from 'node:crypto'

const DEV = 'https://tvirkrjkgdtybtcundon.supabase.co'
const MAIL_HOSTS = ['https://api.mail.tm','https://api.mail.gw']
let MAIL = MAIL_HOSTS[0]
const key = process.env.FAROL_QA_PUBLIC_KEY || ''
const expected = process.env.FAROL_QA_TARGET_PROJECT
if (process.env.CI !== 'true' || process.env.FAROL_QA_EPHEMERAL_RUN !== 'yes-once' ||
    expected !== 'tvirkrjkgdtybtcundon' ||
    !/^sb_publishable_[A-Za-z0-9_-]{15,}$/.test(key)) {
  console.error('BLOCKED: QA requires explicit Dev-only CI opt-in and publishable key.')
  process.exit(2)
}

const state = [0, 1].map(index => ({
  alias: index === 0 ? 'QA A' : 'QA B',
  mailbox: null, mailboxId: null, mailToken: null, email: null, password: null,
  userId: null, token: null, otpFactorId: null, fixtureId: null,
  milestones: [],
}))
let currentStage = 'setup'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function req(url, {method = 'GET', body = undefined, headers = {}, bearer = undefined} = {}) {
  const target = new URL(url)
  if (!([new URL(DEV).host, ...MAIL_HOSTS.map(x => new URL(x).host)].includes(target.host)) ||
      target.protocol !== 'https:') throw new Error('unexpected_host')
  const response = await fetch(url, {
    method,
    redirect: 'manual',
    headers: { Accept: 'application/json', ...headers,
      ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
      ...(body !== undefined ? {'Content-Type':'application/json'} : {}) },
    ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
    signal: AbortSignal.timeout(15000),
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }
  return {ok: response.ok, status: response.status, data, text, headers: response.headers}
}
function needed(response, stage, expectedStatuses = [200,201,204]) {
  if (!response.ok || !expectedStatuses.includes(response.status)) {
    // Error statuses are safe metadata. Never print response body or credentials.
    throw new Error(stage + '_http_' + response.status)
  }
  return response.data
}
function publicHeaders(token) {
  return { apikey:key, ...(token? { Authorization:'Bearer '+token }:{}) }
}
async function supabase(path, opts={}) {
  return req(DEV+path, {...opts, headers:{...publicHeaders(opts.token),...(opts.headers??{})}})
}
async function mailbox(opts) {
  return req(MAIL+opts.path,{...opts,bearer:opts.mailToken})
}
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits=0, buffer=0
  const bytes=[]
  for(const char of secret.toUpperCase().replace(/=+$/g,'')){
    const i=alphabet.indexOf(char)
    if(i<0) throw new Error('invalid_totp_secret')
    buffer=(buffer<<5)|i;bits+=5
    if(bits>=8){bytes.push((buffer>>>(bits-8))&255);bits-=8;buffer &= (1<<bits)-1}
  }
  const counter=Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
  const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest()
  const offset=digest[digest.length-1]&15
  return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0')
}
function jwtPayload(token) {
  if (typeof token !== 'string' || token.split('.').length!==3) throw new Error('invalid_jwt')
  return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'))
}
function milestone(record,stage){record.milestones.push(stage);console.info(record.alias+': '+stage+' OK')}

async function setupMailbox(record,domain) {
  currentStage = record.alias+'_mailbox'
  record.email = 'farolqa-'+randomBytes(9).toString('hex')+'@'+domain
  record.password = 'QA!'+randomBytes(26).toString('base64url')
  const mb=await mailbox({path:'/accounts',method:'POST',body:{address:record.email,password:record.password}})
  const account=needed(mb,'mailbox_create',[201])
  record.mailboxId=account?.id
  if(!record.mailboxId)throw new Error('mailbox_missing_id')
  const login=await mailbox({path:'/token',method:'POST',body:{address:record.email,password:record.password}})
  record.mailToken=needed(login,'mailbox_token',[200])?.token
  if(!record.mailToken)throw new Error('mailbox_missing_token')
  milestone(record,'caixa temporária criada')
}
async function register(record) {
  currentStage=record.alias+'_signup'
  const res=await supabase('/auth/v1/signup',{
    method:'POST',body:{email:record.email,password:record.password,
      data:{farol_qa_ephemeral:true}},
  })
  const user=needed(res,'signup',[200,201])
  record.userId=user?.user?.id ?? user?.id ?? null
  if (!record.userId || !/^[0-9a-f-]{36}$/i.test(record.userId)) throw new Error('signup_missing_user')
  milestone(record,'cadastro no Supabase Dev')
}
async function confirmFromEmail(record){
  currentStage=record.alias+'_email_confirmation'
  for(let attempt=0;attempt<24;attempt++){
    const list=await mailbox({path:'/messages',mailToken:record.mailToken})
    if(list.ok){
      const messages=list.data?.['hydra:member'] ?? list.data?.member ?? []
      for (const message of messages) {
        const detail=await mailbox({path:'/messages/'+encodeURIComponent(message.id),
          mailToken:record.mailToken})
        if(!detail.ok)continue
        const messageData=detail.data??{}
        const htmlParts=Array.isArray(messageData.html) ? messageData.html
          : (typeof messageData.html === 'string' ? [messageData.html] : [])
        const parts=[messageData.text, ...htmlParts,
          messageData.intro,message.intro].filter(Boolean)
        const joined=parts.join(' ').replaceAll('&amp;','&')
          .replaceAll('&#38;','&').replaceAll('&quot;','"')
        const urls=joined.match(/https:\/\/[^\s"'<>\\]+/g)??[]
        for(const link of urls){
          let u
          try{u=new URL(link.replaceAll('=3D','='))}catch{continue}
          if (u.origin!==DEV || u.pathname!=='/auth/v1/verify') continue
          const type=u.searchParams.get('type')
          if (!['signup','email','magiclink','confirmation'].includes(type)) continue
          // Confirm link via Supabase only; do not follow redirects to third parties.
          const confirm=await req(u.href)
          if (![301,302,303,307,308].includes(confirm.status) &&
              !(confirm.ok && confirm.data?.access_token)) {
            throw new Error('email_verify_http_'+confirm.status)
          }
          milestone(record,'e-mail confirmado')
          return
        }
        // Alternate GoTrue email template (six-digit code instead of a link).
        const otp=joined.match(/(?:c[oó]digo|code|token)\D{0,30}(\d{6})/i)?.[1]
        if(otp){
          const verified=await supabase('/auth/v1/verify',{method:'POST',
            body:{type:'signup',email:record.email,token:otp}})
          if(verified.ok){milestone(record,'e-mail confirmado');return}
        }
      }
    }
    await wait(2500)
  }
  throw new Error('confirmation_email_not_received')
}
async function authenticate(record) {
  currentStage=record.alias+'_login'
  const login=await supabase('/auth/v1/token?grant_type=password',{method:'POST',
    body:{email:record.email,password:record.password}})
  record.token=needed(login,'signin',[200])?.access_token
  if(!record.token)throw new Error('signin_missing_token')
  const payload=jwtPayload(record.token)
  if(payload.sub!==record.userId || payload.aal!=='aal1')throw new Error('signin_unexpected_identity_or_level')
  const user=await supabase('/auth/v1/user',{token:record.token})
  needed(user,'getuser',[200])
  if(user.data?.id!==record.userId || !user.data?.email_confirmed_at)throw new Error('user_not_confirmed')
  milestone(record,'senha validada e sessão inicial AAL1')
}
async function enrollTotp(record) {
  currentStage=record.alias+'_totp'
  const enrolled=await supabase('/auth/v1/factors',{method:'POST',token:record.token,
    body:{factor_type:'totp',friendly_name:'Farol teste descartável'}})
  const factor=needed(enrolled,'totp_enroll',[200,201])
  record.otpFactorId=factor?.id
  const secret=factor?.totp?.secret
  if(!record.otpFactorId || !secret)throw new Error('totp_factor_not_created')
  const challenged=await supabase('/auth/v1/factors/'+record.otpFactorId+'/challenge',{
    method:'POST',token:record.token,body:{}})
  const challenge=needed(challenged,'totp_challenge',[200,201])
  if(!challenge?.id)throw new Error('challenge_id_missing')
  const verified=await supabase('/auth/v1/factors/'+record.otpFactorId+'/verify',{
    method:'POST',token:record.token,body:{challenge_id:challenge.id,code:totp(secret)}})
  const verification=needed(verified,'totp_verify',[200,201])
  record.token=verification?.access_token
  if (!record.token || jwtPayload(record.token).aal!=='aal2' ||
      jwtPayload(record.token).sub!==record.userId) throw new Error('aal2_not_reached')
  milestone(record,'2FA confirmado e sessão AAL2')
}
async function calendar(record,query='',method='GET',body) {
  const response=await req(DEV+'/rest/v1/calendar_events'+query,{
    method,body,
    headers:{...publicHeaders(record.token),...(method!=='GET'?{Prefer:'return=representation'}:{})}})
  return response
}
async function ownCalendar(record) {
  currentStage=record.alias+'_calendar'
  const seen=await calendar(record,'?select=id,user_id&limit=100')
  const data=needed(seen,'calendar_read',[200])
  if(!Array.isArray(data)||data.some(x=>x.user_id!==record.userId))throw new Error('calendar_read_cross_user')
  milestone(record,'leitura do calendário sem dados de outra conta')
}
async function fixture(record) {
  currentStage=record.alias+'_fixture'
  record.fixtureId=randomUUID()
  const start=new Date(Date.now()+3600000*8).toISOString()
  const end=new Date(Date.now()+3600000*9).toISOString()
  const created=await calendar(record,'','POST',{
    id:record.fixtureId,user_id:record.userId,
    title:'FAROL-QA-TEST-'+record.fixtureId.slice(0,8),
    description:'Compromisso descartável do teste automatizado',starts_at:start,
    ends_at:end,all_day:false
  })
  const data=needed(created,'fixture_insert',[201])
  if(!Array.isArray(data)||data.length!==1||data[0].id!==record.fixtureId)throw new Error('fixture_not_created')
  milestone(record,'compromisso de teste criado')
}
async function isolation(a,b) {
  currentStage='cross_account_isolation'
  for(const [owner,other] of [[a,b],[b,a]]) {
    const filter='?select=id,user_id&id=eq.'+owner.fixtureId
    const same=needed(await calendar(owner,filter),'own_fixture_read',[200])
    const different=needed(await calendar(other,filter),'cross_fixture_read',[200])
    if(!Array.isArray(same)||same.length!==1 ||
       !Array.isArray(different)||different.length!==0)
      throw new Error('cross_account_read_not_blocked')
    const mutation=await calendar(other,'?id=eq.'+owner.fixtureId,
      'PATCH',{title:'FAROL-QA-TEST-ILLEGAL'})
    if(mutation.ok && Array.isArray(mutation.data) && mutation.data.length!==0)
      throw new Error('cross_account_write_not_blocked')
    if(!mutation.ok && ![401,403,404].includes(mutation.status))
      throw new Error('unexpected_cross_account_write_http_'+mutation.status)
    const after=needed(await calendar(owner,filter),'fixture_verify_owner',[200])
    if(after?.length!==1)throw new Error('owner_fixture_missing')
  }
  console.info('Isolamento: duas contas não conseguem ler/editar os registros da outra. PASSOU')
}
async function cleanup(){
  currentStage='cleanup'
  let failures=0
  for (const r of state) {
    if(r.fixtureId && r.token){
      try{
        const gone=await calendar(r,'?id=eq.'+r.fixtureId+'&user_id=eq.'+r.userId,'DELETE')
        if(!gone.ok)throw Error('delete_status')
        const verify=await calendar(r,'?select=id&id=eq.'+r.fixtureId)
        if(!verify.ok || !Array.isArray(verify.data) || verify.data.length)throw Error('delete_verify')
        console.info(r.alias+': evento temporário removido.')
      }catch{failures++;console.error(r.alias+': ALERTA falha ao confirmar limpeza do evento; revisar Dev.')}
    }
    if(r.mailToken && r.mailboxId) {
      try {
        const deleted=await mailbox({path:'/accounts/'+r.mailboxId,method:'DELETE',mailToken:r.mailToken})
        if(deleted.status!==204)throw Error('delete_mail')
        console.info(r.alias+': caixa de e-mail descartável removida.')
      }catch{failures++;console.error(r.alias+': caixa de e-mail descartável pode permanecer.')}
    }
  }
  console.info('IMPORTANTE: contas Supabase Auth NÃO foram apagadas; exclusão exige autorização administrativa Dev.')
  if(failures)throw new Error('cleanup_incomplete')
}
async function main() {
  let failure=null
  try {

    let active=null
    for (const provider of MAIL_HOSTS) {
      MAIL = provider
      try {
        const domainResult=await mailbox({path:'/domains'})
        const all=needed(domainResult,'mail_domains',[200])
        const domains=all?.['hydra:member']??all?.member??all?.data??all?.items??[]
        const entries=Array.isArray(domains)?domains:[]
        console.info('E-mail temporário: serviço '+new URL(provider).host+
          ' retornou '+entries.length+' domínios listados.')
        active=entries.find(x=>x.isActive!==false && x.isPrivate!==true && typeof x.domain==='string')
        if(active?.domain)break
      } catch {
        console.info('E-mail temporário: serviço '+new URL(provider).host+' sem domínio utilizável.')
      }
    }
    if(!active?.domain)throw new Error('no_public_disposable_domain_from_two_providers')
    for (const record of state) await setupMailbox(record,active.domain)
    for (const record of state) await register(record)
    for (const record of state) await confirmFromEmail(record)
    for (const record of state) {
      await authenticate(record)
      await enrollTotp(record)
      await ownCalendar(record)
    }
    for (const record of state) await fixture(record)
    await isolation(state[0],state[1])
    console.info('RESULTADO PRINCIPAL: TESTE E2E COMPLETO APROVADO.')
  } catch(err) {
    failure=err instanceof Error?err.message:'unknown_failure'
    console.error('RESULTADO PRINCIPAL: TESTE INCOMPLETO ('+currentStage+'). Código: '+failure)
  } finally {
    for (const record of state) {
      // IDs não são senhas e servem à exclusão posterior de contas QA no Dev.
      if(record.userId)console.info(record.alias+': conta Supabase Dev criada, ID '+record.userId)
    }
    try {await cleanup()}catch(err){
      failure=failure??'cleanup_incomplete'
      console.error('LIMPEZA: exige revisão manual no ambiente Dev.')
    }
    for(const record of state) {
      console.info(record.alias+': etapas aprovadas: '+(record.milestones.join(' | ')||'nenhuma'))
    }
  }
  if(failure)process.exitCode=1
}
await main()
