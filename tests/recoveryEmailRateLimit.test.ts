import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { RecoveryEmailRateLimitError, recoveryEmailRequestError } from '../src/domain/auth/recoveryEmailRateLimit'

const page = readFileSync(new URL('../src/presentation/pages/AuthPage.vue',import.meta.url),'utf8')
const auth = readFileSync(new URL('../src/presentation/composables/useAuth.ts',import.meta.url),'utf8')

describe('Limite de envio de e-mail: recuperação de senha',()=>{
  it('interpreta HTTP 429 e códigos de Auth sem vazar detalhes e sem inventar prazo',()=>{
    for (const error of [
      {status:429,message:'unexpected'},
      {code:'over_email_send_rate_limit',message:'Email rate limit exceeded'},
      {code:'over_request_rate_limit',message:'Too many requests'},
      {message:'email rate limit exceeded'},
    ]) {
      const classified=recoveryEmailRequestError(error)
      expect(classified).toBeInstanceOf(RecoveryEmailRateLimitError)
      expect(classified.message).toMatch(/Supabase atingiu o limite temporário/)
      expect(classified.message).not.toMatch(/minutos|horas|amanhã/)
    }
  })
  it('não confunde outras falhas com o bloqueio de email',()=>{
    const error=recoveryEmailRequestError({status:400,code:'validation_failed',message:'Outro erro'})
    expect(error).not.toBeInstanceOf(RecoveryEmailRateLimitError)
    expect(error.message).toBe('Outro erro')
  })
  it('não repete pedidos enquanto o servidor já informou limite nesta tela',()=>{
    expect(auth).toContain('if (error) throw recoveryEmailRequestError(error)')
    expect(page).toContain('cause instanceof RecoveryEmailRateLimitError')
    expect(page).toContain('recoveryEmailRateLimited.value = true')
    expect(page).toContain("props.mode === 'forgot' && recoveryEmailRateLimited.value")
    expect(page).toContain("mode === 'forgot' && recoveryEmailRateLimited")
    expect(page).toContain('O Farol não pode remover esse limite.')
  })
})
