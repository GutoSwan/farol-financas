import { beforeEach, describe, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ enroll: vi.fn() }))
vi.mock('../src/infrastructure/auth/supabase', () => ({
  supabase: { auth: { mfa: { enroll: fake.enroll } } },
}))
import { beginTotpEnrollment } from '../src/infrastructure/auth/totpMfa'
describe('Nome do autenticador TOTP', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fake.enroll.mockResolvedValue({ data: { id: 'factor-id', totp: { qr_code: 'svg', secret: 'TEST' } }, error: null })
  })
  it('normaliza espaços e quebras de linha antes de enviar o nome ao Supabase', async () => {
    await beginTotpEnrollment('  iPhone \n  principal   reserva  ')
    expect(fake.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'iPhone principal reserva' })
  })
  it('utiliza o nome padrão para campo em branco', async () => {
    await beginTotpEnrollment('  ')
    expect(fake.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'Farol Finanças' })
  })
})
