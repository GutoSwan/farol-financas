import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onlyOwnRows, totpCode, validateQaEnvironment } from './qa-real-auth-guards.mjs'

const aSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const bSecret = 'JBSWY3DPEHPK3PXP'
const setup = {
  FAROL_QA_E2E_ENABLED: 'true',
  FAROL_QA_SUPABASE_URL: 'https://tvirkrjkgdtybtcundon.supabase.co',
  FAROL_QA_PUBLISHABLE_KEY: 'sb_publishable_FAKEQAKEY123456789012345',
  FAROL_QA_A_EMAIL: 'teste+farolqa-a@example.org',
  FAROL_QA_B_EMAIL: 'teste+farolqa-b@example.org',
  FAROL_QA_A_PASSWORD: 'fake-pwd-A-should-never-be-used',
  FAROL_QA_B_PASSWORD: 'fake-pwd-B-should-never-be-used',
  FAROL_QA_A_TOTP_SECRET: aSecret,
  FAROL_QA_B_TOTP_SECRET: bSecret,
}

test('TOTP usa algoritmo RFC 6238 com valores públicos de teste', () => {
  assert.equal(totpCode(aSecret, 59_000), '287082')
  assert.equal(totpCode(aSecret, 1_111_111_109_000), '081804')
})

test('o teste não é autorizado por padrão e nunca aceita o projeto de produção', () => {
  assert.throws(() => validateQaEnvironment({ ...setup, FAROL_QA_E2E_ENABLED: undefined }))
  assert.throws(() => validateQaEnvironment({ ...setup,
    FAROL_QA_SUPABASE_URL: 'https://xwzbcabyjhmgggbkaxvt.supabase.co' }))
  assert.throws(() => validateQaEnvironment({ ...setup,
    FAROL_QA_SUPABASE_URL: 'https://tvirkrjkgdtybtcundon.supabase.co.evil.test' }))
  assert.throws(() => validateQaEnvironment({ ...setup, FAROL_QA_PUBLISHABLE_KEY: 'service_role' }))
})

test('recusa contas com e-mail igual, sem marcador QA, senhas ou TOTP repetidos', () => {
  assert.throws(() => validateQaEnvironment({ ...setup,
    FAROL_QA_B_EMAIL: setup.FAROL_QA_A_EMAIL }))
  assert.throws(() => validateQaEnvironment({ ...setup,
    FAROL_QA_A_EMAIL: 'conta.pessoal@example.org' }))
  assert.throws(() => validateQaEnvironment({ ...setup,
    FAROL_QA_B_TOTP_SECRET: setup.FAROL_QA_A_TOTP_SECRET }))
  assert.throws(() => validateQaEnvironment({ ...setup,
    FAROL_QA_B_PASSWORD: setup.FAROL_QA_A_PASSWORD }))
})

test('somente leitura é o padrão; escrita fictícia exige segunda confirmação', () => {
  assert.equal(validateQaEnvironment(setup).withFixtures, false)
  assert.throws(() => validateQaEnvironment({
    ...setup, FAROL_QA_E2E_WRITE_FIXTURES: 'true',
  }), /não foi confirmada/)
  assert.equal(validateQaEnvironment({
    ...setup, FAROL_QA_E2E_WRITE_FIXTURES: 'true',
    FAROL_QA_CONFIRM_FIXTURE_WRITES: 'true',
  }).withFixtures, true)
})

test('linhas de outra conta ou resposta malformada invalidam a auditoria', () => {
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  assert.equal(onlyOwnRows([{ user_id: a }], a), true)
  assert.equal(onlyOwnRows([{ user_id: b }], a), false)
  assert.equal(onlyOwnRows([{ user_id: a }, { user_id: b }], a), false)
  assert.equal(onlyOwnRows(null, a), false)
})
