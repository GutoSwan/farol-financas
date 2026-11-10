import { describe, expect, it } from 'vitest'
import { parseRecoveryConfirmationLink } from '../src/domain/auth/passwordRecovery'

const DEV = 'https://tvirkrjkgdtybtcundon.supabase.co'
const HASH = 'a'.repeat(64)
const link = DEV + '/auth/v1/verify?token=' + HASH +
  '&type=recovery&redirect_to=https%3A%2F%2Ffarol-financas.example%2Fredefinir-senha'

describe('Recuperação de senha via e-mail Supabase Dev', () => {
  it('aceita somente token de recuperação do Auth exato do Dev', () => {
    expect(parseRecoveryConfirmationLink(link, DEV)).toBe(HASH)
    expect(parseRecoveryConfirmationLink(link, DEV + '/')).toBe(HASH)
  })
  it('bloqueia token de produção, host adulterado e HTTP', () => {
    const hosts = [
      'https://xwzbcabyjhmgggbkaxvt.supabase.co',
      DEV + '.attacker.test',
      'http://tvirkrjkgdtybtcundon.supabase.co',
    ]
    for(const host of hosts) {
      expect(parseRecoveryConfirmationLink(link.replace(DEV,host),DEV)).toBeNull()
    }
  })
  it('não aceita outro tipo de confirmação nem links de login', () => {
    expect(parseRecoveryConfirmationLink(link.replace('type=recovery','type=signup'),DEV)).toBeNull()
    expect(parseRecoveryConfirmationLink(link.replace('type=recovery','type=magiclink'),DEV)).toBeNull()
    expect(parseRecoveryConfirmationLink(DEV+'/auth/v1/user?token='+HASH+'&type=recovery',DEV)).toBeNull()
  })
  it('rejeita tokens curtos, duplicados ou parâmetros inesperados', () => {
    expect(parseRecoveryConfirmationLink(link.replace(HASH,'short'),DEV)).toBeNull()
    expect(parseRecoveryConfirmationLink(link+'&token='+HASH,DEV)).toBeNull()
    expect(parseRecoveryConfirmationLink('',DEV)).toBeNull()
    expect(parseRecoveryConfirmationLink('x'.repeat(4100),DEV)).toBeNull()
  })
  it('não aceita endereço sem projeto de autenticação válido', () => {
    expect(parseRecoveryConfirmationLink(link,'http://tvirkrjkgdtybtcundon.supabase.co')).toBeNull()
    expect(parseRecoveryConfirmationLink(link,'not-a-url')).toBeNull()
    expect(parseRecoveryConfirmationLink(link,'https://xwzbcabyjhmgggbkaxvt.supabase.co')).toBeNull()
  })
})
