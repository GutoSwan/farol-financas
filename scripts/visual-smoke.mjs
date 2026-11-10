import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { Buffer } from 'node:buffer'

/**
 * QA VISUAL SIMULADO, NÃO um teste de autenticação real.
 * Todas as sessões são inventadas e todas as chamadas externas são interceptadas.
 * Não usa Supabase Dev real, Vercel, credenciais nem dados de usuários.
 */
const origin = 'http://127.0.0.1:4173'
const authOrigin = 'https://tvirkrjkgdtybtcundon.supabase.co'
const id = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const output = 'artifacts/visual-qa'
const when = Math.floor(Date.now() / 1000)
const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url')
const jwt = [encode({alg:'RS256',typ:'JWT'}),encode({
  iss:authOrigin+'/auth/v1',sub:id,aud:'authenticated',role:'authenticated',
  exp:when+7200,iat:when,aal:'aal2',session_id:sessionId
}),encode('SYNTHETIC-NOT-A-SIGNATURE')].join('.')

function fixtureUser(role){
  return {
    id, aud:'authenticated',role:'authenticated',email:'visual-qa@example.invalid',
    email_confirmed_at:'2026-11-10T12:00:00Z',created_at:'2026-11-10T12:00:00Z',
    app_metadata:{provider:'email',providers:['email'],...(role?{farol_role:role}:{})},
    user_metadata:{display_name:'Pessoa de teste',avatar_icon:'user'},
    identities:[], factors:[],
  }
}
function session(role){
  return {
    access_token:jwt,refresh_token:'synthetic-visual-qa-refresh',expires_in:7200,
    expires_at:when+7200,token_type:'bearer',user:fixtureUser(role),
  }
}
function fail(condition,message){
  if(!condition)throw new Error('Verificação visual: '+message)
}
function jsonRoute(route,payload,status=200){
  return route.fulfill({status,contentType:'application/json',
    headers:{'cache-control':'no-store','access-control-allow-origin':'*'},
    body:JSON.stringify(payload)})
}

async function setup(browser,{role=null,viewport={width:1440,height:900}}={}){
  const context=await browser.newContext({viewport,deviceScaleFactor:1})
  if(role){
    const info=session(role)
    await context.addInitScript(({storageKey,sessionJson,userId})=>{
      localStorage.setItem(storageKey,sessionJson)
      localStorage.setItem('farol-financas:legacy-local-owner:v1',userId)
    },{storageKey:'sb-tvirkrjkgdtybtcundon-auth-token',
      sessionJson:JSON.stringify(info),userId:id})
  }
  await context.route('**/*',async route=>{
    const u=new URL(route.request().url())
    if(u.origin===origin)return route.continue()
    if(u.origin===authOrigin){
      if(u.pathname==='/auth/v1/user')return jsonRoute(route,fixtureUser(role))
      if(u.pathname==='/auth/v1/factors')return jsonRoute(route,{
        all:[{id:'33333333-3333-4333-8333-333333333333',status:'verified',
          factor_type:'totp',friendly_name:'Teste visual'}],
        totp:[{id:'33333333-3333-4333-8333-333333333333',status:'verified',
          factor_type:'totp',friendly_name:'Teste visual'}],phone:[]
      })
      if(u.pathname.startsWith('/rest/v1/calendar_events'))return jsonRoute(route,[])
      return jsonRoute(route,{message:'blocked visual QA: no live auth'},401)
    }
    if(u.hostname==='qa-api.invalid') {
      if(u.pathname==='/api/v1/admin/access' && role==='super_admin')
        return jsonRoute(route,{data:{superAdmin:true}})
      return jsonRoute(route,{error:'Visual QA API unavailable'},403)
    }
    // Do not leak synthetic credentials to unrelated hosts.
    return route.abort()
  })
  const page=await context.newPage()
  return {page,context}
}
async function visit(page,path,expectText){
  await page.goto(origin+path,{waitUntil:'domcontentloaded'})
  await page.getByText(expectText,{exact:false}).first().waitFor({timeout:20000})
  await page.waitForTimeout(500)
}
async function screenshot(page,name){
  await page.screenshot({path:output+'/'+name+'.png',fullPage:true})
}
async function checkOverflow(page,label) {
  const result=await page.evaluate(()=>({
    scroll:document.documentElement.scrollWidth,
    width:document.documentElement.clientWidth
  }))
  fail(result.scroll <= result.width+8,
    label+' gera rolagem horizontal '+result.scroll+'px para '+result.width+'px')
}

await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
let passed=0
async function scenario(label,role,viewport,fn){
  const {page,context}=await setup(browser,{role,viewport})
  try { await fn(page);passed++;console.info('QA VISUAL OK:',label) }
  finally {await context.close()}
}
try{
  await scenario('Login público, desktop',null,{width:1440,height:900},async page=>{
    await visit(page,'/entrar','Entrar no Farol')
    await screenshot(page,'01-login-desktop')
    await checkOverflow(page,'Login desktop')
  })
  await scenario('Cadastro público, celular',null,{width:390,height:844},async page=>{
    await visit(page,'/cadastro','Criar uma conta')
    await screenshot(page,'02-cadastro-mobile')
    await checkOverflow(page,'Cadastro mobile')
  })
  await scenario('Perfil simples e navegação', 'administrador',{width:1440,height:900},async page=>{
    await visit(page,'/conta','Meu perfil')
    await page.getByText('Segurança e autenticadores').waitFor()
    await page.getByText('Meus dados na nuvem').waitFor()
    await screenshot(page,'03-perfil-desktop')
    await page.getByRole('link',{name:'Segurança e autenticadores'}).click()
    await page.getByText('Segurança e acesso').first().waitFor()
    await screenshot(page,'04-seguranca-desktop')
    await page.getByRole('button',{name:/Voltar/}).first().click()
    await page.getByText('Meu perfil').first().waitFor()
  })
  await scenario('Fechar seletor de Presentes', 'administrador',{width:390,height:844},async page=>{
    await visit(page,'/presentes','De quem é a lista?')
    await screenshot(page,'05-presentes-modal-mobile')
    await page.getByRole('button',{name:'Fechar escolha de pessoa'}).click()
    await page.getByText('Visão geral').first().waitFor()
    await checkOverflow(page,'Presentes mobile')
  })
  await scenario('Calendário legível no celular', 'administrador',{width:390,height:844},async page=>{
    await visit(page,'/calendario','Calendário')
    await page.locator('.calendar-cell button').first().waitFor()
    await screenshot(page,'06-calendario-mobile')
    const style=await page.locator('.calendar-number').first()
      .evaluate(e=>({size:parseFloat(getComputedStyle(e).fontSize),
        color:getComputedStyle(e).color}))
    fail(style.size>=12,'dias do Calendário ficaram pequenos demais')
    await checkOverflow(page,'Calendário mobile')
  })
  await scenario('Administração negada à conta comum', 'administrador',{width:1440,height:900},async page=>{
    await page.goto(origin+'/administracao',{waitUntil:'domcontentloaded'})
    await page.getByText('Visão geral').first().waitFor({timeout:20000})
    fail(!new URL(page.url()).pathname.startsWith('/administracao'),'admin comum abriu painel restrito')
  })
  await scenario('Painel Super Admin, com servidor SIMULADO', 'super_admin',{width:1440,height:900},async page=>{
    await visit(page,'/administracao','Administração do Farol')
    await page.getByText('Backup protegido').waitFor()
    await page.getByText('Dados na nuvem').first().waitFor()
    await screenshot(page,'07-admin-desktop-simulado')
  })
  console.info('RESULTADO: '+passed+' cenários visuais simulados aprovados. Capturas em '+output)
}finally{
  await browser.close()
}
