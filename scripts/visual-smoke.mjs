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
const jwtFor = level => [encode({alg:'RS256',typ:'JWT'}),encode({
  iss:authOrigin+'/auth/v1',sub:id,aud:'authenticated',role:'authenticated',
  exp:when+7200,iat:when,aal:level,session_id:sessionId
}),encode('SYNTHETIC-NOT-A-SIGNATURE')].join('.')

function fixtureUser(role){
  return {
    id, aud:'authenticated',role:'authenticated',email:'visual-qa@example.invalid',
    email_confirmed_at:'2026-11-10T12:00:00Z',created_at:'2026-11-10T12:00:00Z',
    app_metadata:{provider:'email',providers:['email'],...(role?{farol_role:role}:{})},
    user_metadata:{display_name:'Pessoa de teste',avatar_icon:'user'},
    identities:[], factors:[{id:'33333333-3333-4333-8333-333333333333',
      status:'verified',factor_type:'totp',friendly_name:'Teste visual',created_at:'2026-11-10T12:00:00Z'}],
  }
}
function session(role,level='aal2'){
  return {
    access_token:jwtFor(level),refresh_token:'synthetic-visual-qa-refresh',expires_in:7200,
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

async function setup(browser,{role=null,viewport={width:1440,height:900},recovery=false,theme='light'}={}){
  const context=await browser.newContext({viewport,deviceScaleFactor:1})
  await context.addInitScript(themeChoice=>{
    localStorage.setItem('farol-financas:theme:v1',themeChoice)
  },theme)
  const qa={recoveries:0,mfaChallenges:0,mfaVerifications:0,passwordChanges:0}
  let recoverySession=false
  let verifiedMfa=false
  if(role&&!recovery){
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
      const method=route.request().method()
      if(recovery && u.pathname==='/auth/v1/verify' && method==='POST'){
        const body=route.request().postDataJSON()
        if(body.type!=='recovery' || body.token_hash!=='a'.repeat(64)){
          return jsonRoute(route,{error:'invalid recovery token'},403)
        }
        recoverySession=true;qa.recoveries++
        return jsonRoute(route,session(role,'aal1'))
      }
      if(recovery && /^\/auth\/v1\/factors\/[^/]+\/challenge$/.test(u.pathname)){
        qa.mfaChallenges++
        return jsonRoute(route,{id:'44444444-4444-4444-8444-444444444444',
          factor_id:'33333333-3333-4333-8333-333333333333',
          created_at:'2026-11-10T12:00:00Z'})
      }
      if(recovery && /^\/auth\/v1\/factors\/[^/]+\/verify$/.test(u.pathname)){
        const body=route.request().postDataJSON()
        if(body.code!=='123456')return jsonRoute(route,{message:'invalid TOTP'},422)
        verifiedMfa=true;qa.mfaVerifications++
        return jsonRoute(route,session(role,'aal2'))
      }
      if(u.pathname==='/auth/v1/user'){
        if(recovery && method==='PUT'){
          if(!verifiedMfa)return jsonRoute(route,{message:'AAL2 required'},403)
          qa.passwordChanges++
          return jsonRoute(route,fixtureUser(role))
        }
        if(recovery && !recoverySession)return jsonRoute(route,{message:'Unauthenticated'},401)
        return jsonRoute(route,fixtureUser(role))
      }
      if(recovery && u.pathname==='/auth/v1/logout')return jsonRoute(route,{})
      if(u.pathname==='/auth/v1/factors' || u.pathname==='/auth/v1/user/factors')return jsonRoute(route,{
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
  return {page,context,qa}
}
async function visit(page,path,expectText){
  await page.goto(origin+path,{waitUntil:'domcontentloaded'})
  try {
    await page.getByRole('heading',{name:expectText,exact:false}).first().waitFor({timeout:13000})
  } catch (cause) {
    // Diagnostic metadata only, never print user tokens or personal data.
    const headings=await page.locator('h1').allTextContents()
    console.error('UI diagnostic expected:',expectText,'path:',new URL(page.url()).pathname,
      'visible headings:',headings.slice(0,3))
    throw cause
  }
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
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
  ...(process.env.FAROL_CHROMIUM_BIN ? {executablePath:process.env.FAROL_CHROMIUM_BIN}:{})})
let passed=0
async function scenario(label,role,viewport,fn,options={}){
  const {page,context,qa}=await setup(browser,{role,viewport,...options})
  try { await fn(page,qa);passed++;console.info('QA VISUAL OK:',label) }
  finally {await context.close()}
}
try{
  await scenario('Login público, desktop',null,{width:1440,height:900},async page=>{
    await visit(page,'/entrar','Entrar no Farol')
    await screenshot(page,'01-login-desktop')
    fail((await page.title())==='Farol Finanças • Entrar','login perdeu título próprio da aba')
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
    await page.waitForURL(origin+'/',{timeout:10000})
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
    await page.getByText('AMBIENTE DEV • ACESSO RESTRITO').waitFor()
    fail((await page.title()).includes('SUPER ADMIN'), 'o título da aba não distingue Super Admin')
    const bg=await page.locator('.superadmin-shell').evaluate(e=>getComputedStyle(e).backgroundColor)
    fail(bg==='rgb(10, 19, 32)','a área Super Admin não inverteu o tema CLARO do Farol: '+bg)
    fail(await page.getByRole('link',{name:'Sair do Super Admin'}).count()===1,
      'não há saída explícita para o Farol normal')
  })
  await scenario('Backup protegido retorna ao painel sem usar botão do navegador',
    'super_admin',{width:1440,height:900},async page=>{
    await visit(page,'/administracao','Administração do Farol')
    await page.getByRole('link',{name:'Abrir backup seguro'}).click()
    await page.getByRole('heading',{name:'Backup financeiro protegido'}).waitFor({timeout:13000})
    await screenshot(page,'11-backup-com-voltar-desktop')
    await page.getByRole('button',{name:/Voltar/}).first().click()
    await page.waitForURL(origin+'/administracao',{timeout:13000})
    await page.getByRole('heading',{name:'Administração do Farol'}).waitFor()
    await checkOverflow(page,'Backup e navegação desktop')
  })

  await scenario('Super Admin mobile com paleta oposta ao Farol ESCURO',
    'super_admin',{width:390,height:844},async page=>{
    await visit(page,'/administracao','Administração do Farol')
    const bg=await page.locator('.superadmin-shell').evaluate(e=>getComputedStyle(e).backgroundColor)
    fail(bg==='rgb(241, 249, 246)','console não ficou claro com Farol escuro: '+bg)
    const panel=await page.locator('.admin-tools .panel').first()
      .evaluate(e=>getComputedStyle(e).backgroundColor)
    fail(panel==='rgb(255, 255, 255)','cards precisam ser claros no Super Admin oposto: '+panel)
    await screenshot(page,'12-admin-mobile-paleta-invertida')
    await checkOverflow(page,'Admin mobile invertido')
    await page.locator('.superadmin-nav').getByRole('link',{name:'Segurança'}).click()
    await page.getByRole('heading',{name:'Segurança e acesso'}).waitFor()
    fail((await page.title()).includes('SUPER ADMIN | Segurança da conta'),
      'título Segurança não identifica modo Admin')
    await screenshot(page,'13-seguranca-admin-mobile-invertida')
    await checkOverflow(page,'Segurança admin mobile invertida')
    await page.locator('.superadmin-nav').getByRole('link',{name:'Dados na nuvem'}).click()
    await page.getByRole('heading',{name:'Dados na nuvem'}).waitFor()
    await screenshot(page,'14-dados-admin-mobile-invertidos')
    await checkOverflow(page,'Nuvem admin mobile invertida')
    await page.locator('.superadmin-nav').getByRole('link',{name:'Painel'}).click()
    await page.getByRole('heading',{name:'Administração do Farol'}).waitFor()
  },{theme:'dark'})

  await scenario('Usuário comum bloqueado nas rotas filhas de Super Admin',
    'administrador',{width:390,height:844},async page=>{
    await page.goto(origin+'/administracao/seguranca',{waitUntil:'domcontentloaded'})
    await page.waitForURL(origin+'/',{timeout:20000})
    fail(await page.locator('.superadmin-shell').count()===0,
      'tela Super Admin montada para usuário comum')
  })

  await scenario('Recuperação MFA AAL2 realista no celular, SEM dados reais', 'super_admin',
    {width:390,height:844}, async (page,qa)=>{
    await visit(page,'/redefinir-senha','Definir nova senha')
    const fakeLink=authOrigin+'/auth/v1/verify?token='+('a'.repeat(64))+
      '&type=recovery&redirect_to=https%3A%2F%2Fexample.invalid'
    await page.locator('textarea').fill(fakeLink)
    await page.getByRole('button',{name:'Confirmar link de recuperação'}).click()
    await page.getByText('Confirme sua identidade com o Authenticator').waitFor({timeout:13000})
    await screenshot(page,'08-recuperacao-exige-2fa-mobile')
    fail(await page.getByRole('button',{name:'Salvar nova senha'}).count()===0,
      'formulário de senha apareceu antes do Authenticator')
    fail(qa.passwordChanges===0,'senha atualizada sem verificar MFA')
    await page.getByPlaceholder('000000').fill('123456')
    await page.getByRole('button',{name:'Confirmar autenticador'}).click()
    await page.getByText('Identidade confirmada. Agora escolha sua nova senha').waitFor({timeout:13000})
    await screenshot(page,'09-recuperacao-aal2-mobile')
    const passwords=page.locator('input[autocomplete="new-password"]')
    await passwords.nth(0).fill('Synthetic-Test-Only-1234!')
    await passwords.nth(1).fill('Synthetic-Test-Only-1234!')
    await page.getByRole('button',{name:'Salvar nova senha'}).click()
    await page.getByText('Senha alterada com sucesso').waitFor({timeout:13000})
    await screenshot(page,'10-recuperacao-sucesso-mobile')
    await checkOverflow(page,'Recuperação AAL2 mobile')
    fail(qa.recoveries===1,'link sintético não verificado exatamente uma vez')
    fail(qa.mfaChallenges===1 && qa.mfaVerifications===1,
      'MFA não foi confirmado pelo servidor simulado')
    fail(qa.passwordChanges===1,'não atualizou a senha após AAL2')
  }, {recovery:true})

  console.info('RESULTADO: '+passed+' cenários visuais simulados aprovados. Capturas em '+output)
}finally{
  await browser.close()
}
