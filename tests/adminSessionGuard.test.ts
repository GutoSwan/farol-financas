import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../admin-web/src/App.vue', import.meta.url), 'utf8')

describe('Farol Admin: revogação e navegação protegida', () => {
  it('fecha a interface imediatamente quando a sessão termina em outra aba', () => {
    expect(app).toContain("event === 'SIGNED_OUT' && !signingOut")
    expect(app).toContain("forgetAdministrativeSession('Sessão encerrada.")
    expect(app).toContain("gate.value = 'login'")
    expect(app).toContain('currentCheck++')
    expect(app).toContain('authSubscription?.unsubscribe()')
  })

  it('oculta ferramentas e revalida acesso quando a aba volta ao primeiro plano', () => {
    expect(app).toContain("window.addEventListener('focus', revalidateOnResume)")
    expect(app).toContain("document.addEventListener('visibilitychange', onVisibilityChange)")
    expect(app).toContain("gate.value !== 'authorized'")
    expect(app).toContain('void restore()')
    expect(app).toContain("gate.value = 'checking'")
    expect(app).toContain('lastResumeCheck')
  })

  it('respostas atrasadas de consultas antigas não podem liberar o painel', () => {
    expect(app).toContain('const attempt = ++currentCheck')
    expect(app).toContain('if (!mounted || attempt !== currentCheck) return')
    expect(app).toContain("gate.value = 'authorized'")
    expect(app).toContain('await serverAuthorizes()')
    expect(app).toContain("aal.currentLevel !== 'aal2'")
  })

  it('bloqueia navegação administrativa quando não há autorização', () => {
    expect(app).toContain("if (gate.value !== 'authorized' && url !== '/admin/login') return")
    expect(app).toContain("if (gate.value !== 'authorized') {")
    expect(app).toContain("navigate('/admin/login', true)")
    expect(app).toContain('history.replaceState(')
    expect(app).not.toContain("history.pushState({}, '', '/administracao')")
  })

  it('mantém o projeto Dev e uma confirmação efetiva pelo backend', () => {
    expect(app).toContain("const configured = url === devUrl && publicKey.startsWith('sb_publishable_')")
    expect(app).toContain("'/api/v1/admin/access'")
    expect(app).toContain("result?.data?.superAdmin !== true")
    expect(app).not.toContain('service_role')
  })
})
