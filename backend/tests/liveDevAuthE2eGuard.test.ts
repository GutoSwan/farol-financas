import { describe, expect, it } from 'vitest'
import { LIVE_QA_API_ORIGIN, LIVE_QA_AUTH_ORIGIN, requireLiveDevAuthE2eConfig } from '../src/infrastructure/security/liveDevAuthE2eGuard.js'

const config = {
  FAROL_QA_LIVE_DEV_AUTH_E2E: 'READ_ONLY_DEV',
  FAROL_DEV_SUPABASE_REF: 'tvirkrjkgdtybtcundon',
  SUPABASE_URL: LIVE_QA_AUTH_ORIGIN,
  FAROL_QA_API_ORIGIN: LIVE_QA_API_ORIGIN,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_FAKE_QA_DEV_KEY_123456789012345',
  FAROL_QA_OWNER_EMAIL: 'guto+farol-qa-owner-1@example.com',
  FAROL_QA_OWNER_PASSWORD: 'ficticia-owner',
  FAROL_QA_VIEWER_EMAIL: 'guto+farol-qa-viewer-1@example.com',
  FAROL_QA_VIEWER_PASSWORD: 'ficticia-viewer',
  FAROL_QA_SHARED_WORKSPACE_ID: '11111111-1111-4111-8111-111111111111',
  FAROL_QA_PRIVATE_WORKSPACE_ID: '22222222-2222-4222-8222-222222222222',
}

describe('Preflight da integração real Auth Dev sem dados de produção', () => {
  it('aceita apenas dois usuários QA e destinos Dev exatos', () => {
    const result = requireLiveDevAuthE2eConfig(config)
    expect(result.sharedWorkspaceId).toBe(config.FAROL_QA_SHARED_WORKSPACE_ID)
    expect(result.privateWorkspaceId).toBe(config.FAROL_QA_PRIVATE_WORKSPACE_ID)
  })

  it('nega produção, URLs arbitrárias, flags de gravação e contas pessoais', () => {
    const variants = [
      { FAROL_QA_LIVE_DEV_AUTH_E2E: 'false' },
      { FAROL_DEV_SUPABASE_REF: 'xwzbcabyjhmgggbkaxvt' },
      { SUPABASE_URL: 'https://xwzbcabyjhmgggbkaxvt.supabase.co' },
      { FAROL_QA_API_ORIGIN: 'https://farol-api.vercel.app' },
      { VERCEL_ENV: 'production' },
      { FAROL_FINANCIAL_WRITES_ENABLED: 'true' },
      { FAROL_INVOICE_UPLOADS_ENABLED: 'true' },
      { FAROL_INVOICE_READS_ENABLED: 'true' },
      { FAROL_QA_OWNER_EMAIL: 'pessoa@gmail.com' },
      { FAROL_QA_VIEWER_EMAIL: config.FAROL_QA_OWNER_EMAIL },
      { FAROL_QA_OWNER_PASSWORD: '' },
      { FAROL_QA_SHARED_WORKSPACE_ID: config.FAROL_QA_PRIVATE_WORKSPACE_ID },
    ]
    for (const variant of variants) {
      expect(() => requireLiveDevAuthE2eConfig({ ...config, ...variant }),
        JSON.stringify(Object.keys(variant))).toThrow('E2E não iniciado')
    }
  })

  it('não escreve credenciais nas mensagens de erro', () => {
    expect(() => requireLiveDevAuthE2eConfig({ ...config, FAROL_QA_VIEWER_EMAIL: '' }))
      .toThrow(/duas contas técnicas/)
    try { requireLiveDevAuthE2eConfig({ ...config, FAROL_QA_OWNER_EMAIL: 'pessoal@gmail.com' }) }
    catch (e) {
      const text = String(e)
      expect(text).not.toContain(config.FAROL_QA_OWNER_PASSWORD)
      expect(text).not.toContain(config.FAROL_QA_VIEWER_PASSWORD)
    }
  })
})
