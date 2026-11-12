import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const auth = readFileSync(new URL('../src/presentation/composables/useAuth.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/presentation/pages/AuthPage.vue', import.meta.url), 'utf8')
const routing = readFileSync(new URL('../src/router/authNavigation.ts',import.meta.url),'utf8')
const config = readFileSync(new URL('../vercel.json',import.meta.url),'utf8')
const app = readFileSync(new URL('../src/App.vue',import.meta.url),'utf8')

describe('Fluxo guiado de recuperação de senha',()=>{
 it('pede link com redirectTo para a rota pública do Farol',()=>{
   expect(auth).toContain("redirectTo: emailRedirect('/redefinir-senha')")
   expect(routing).toContain("'/redefinir-senha'")
   expect(JSON.parse(config).rewrites).toEqual(expect.arrayContaining([
     {source:'/redefinir-senha',destination:'/index.html'}
   ]))
 })
 it('a recuperação abre /redefinir-senha mesmo se Supabase redirecionar ao site padrão',()=>{
   expect(app).toContain('watch(recoveringPassword')
   expect(app).toContain("router.replace('/redefinir-senha')")
 })
 it('valida hash diretamente pelo Supabase Auth, nunca por backend financeiro',()=>{
   expect(auth).toContain("token_hash: hash,")
   expect(auth).toContain("type: 'recovery'")
   expect(auth).toContain('parseRecoveryConfirmationLink(')
   expect(page).toContain('Confirmar link de recuperação')
 })
 it('não permite mudar a senha antes de confirmar a recuperação',()=>{
   expect(auth).toContain('if (!recoveringPassword.value)')
   expect(page).toContain("mode !== 'reset' || (recoveringPassword && recoveryMfaChecked && !recoveryMfaRequired && recoveryMfaVerified && !passwordResetDone)")
 })
 it('apaga o link colado e encerra a sessão de recuperação após a troca',()=>{
   expect(page).toContain("recoveryLinkInput.value = ''")
   expect(auth).toContain("auth.auth.signOut({ scope: 'local' })")
   expect(page).toContain('Ir para o login')
 })
})
