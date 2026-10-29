import { describe, expect, it } from 'vitest'
import { readConfig } from '../src/shared/config.js'

describe('Configuração segura', () => {
  it('exige URL do Supabase e URL do Postgres', () => {
    expect(() => readConfig({})).toThrow('Configuração inválida')
  })
  it('recusa Supabase sem HTTPS', () => {
    expect(() => readConfig({
      DATABASE_URL: 'postgresql://example:secret@localhost:5432/farol',
      SUPABASE_URL: 'http://example.supabase.co',
    })).toThrow()
  })
  it('aceita configuração local para desenvolvimento', () => {
    expect(readConfig({
      DATABASE_URL: 'postgresql://farol:fake@localhost:5433/farol',
      SUPABASE_URL: 'https://example.supabase.co',
    }).PORT).toBe(3333)
  })
})
