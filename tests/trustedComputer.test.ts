import { describe, expect, it } from 'vitest'
import { TRUST_MS, validTrust, sessionIdFromToken } from '../src/infrastructure/auth/trustedComputer'
import login from '../src/presentation/pages/AuthPage.vue?raw'
import challenge from '../src/presentation/pages/MfaChallengePage.vue?raw'
import setup from '../src/presentation/pages/MfaSetupPage.vue?raw'
import router from '../src/router/index.ts?raw'
import client from '../src/infrastructure/auth/supabase.ts?raw'
import auth from '../src/presentation/composables/useAuth.ts?raw'
const id='11111111-1111-4111-8111-111111111111'
const sid='22222222-2222-4222-8222-222222222222'
describe('Confiar neste computador por até 30 dias', () => {
  it('verifica identidade e expiração do registro',()=>{
    const now=1000000000
    expect(validTrust({userId:id,sessionId:sid,expiresAt:now+TRUST_MS},now)).toBe(true)
    expect(validTrust({userId:id,sessionId:sid,expiresAt:now},now)).toBe(false)
    expect(validTrust({userId:id,sessionId:sid,expiresAt:now+TRUST_MS+1},now)).toBe(false)
    expect(validTrust({userId:'unknown',sessionId:sid,expiresAt:now+100},now)).toBe(false)
  })
  it('lê apenas ID de sessão do JWT, sem dar permissão pelo navegador',()=>{
    const jwt=['x',btoa(JSON.stringify({session_id:sid,aal:'aal1'})),'x'].join('.')
    expect(sessionIdFromToken(jwt)).toBe(sid)
    expect(sessionIdFromToken('bad-token')).toBe(null)
  })
  it('só persiste após autenticação por TOTP, e cancela ao sair',()=>{
    expect(login).toContain('Confiar neste computador por até 30 dias')
    expect(login).toContain('preparePasswordLogin()')
    expect(login).toContain('requestTrust(user.value?.id')
    expect(challenge).toContain('await verifyTotpCode(')
    expect(challenge).toContain('activateTrustAfterMfa(supabase.auth)')
    expect(setup).toContain('activateTrustAfterMfa(supabase.auth)')
    expect(auth).toContain('clearTrust()')
    expect(client).toContain('storage: browserSessionStorage(url)')
    expect(router).toContain('trustedSessionExpired()')
  })
})
