import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { SupabaseEncryptedInvoiceRepository } from '../src/infrastructure/repositories/SupabaseEncryptedInvoiceRepository.js'
const workspaceId='33333333-3333-4333-8333-333333333333'
const invoiceId='55555555-5555-4555-8555-555555555555'
const userId='11111111-1111-4111-8111-111111111111'
const input={
 id:invoiceId, workspaceId,uploadedBy:userId,billingMonth:'2026-11',
 metadata:{issuer:'Banco Teste',totalCents:12345,dueDate:'2026-11-20',cardLast4:'1234'},
 pdfBytes:Buffer.from('%PDF-1.7\nCONTEUDO CONFIDENCIAL DE TESTE\n%%EOF'),
}
function config() {
 vi.stubEnv('SUPABASE_URL','https://aaaaaaaaaaaaaaaaaaaa.supabase.co')
 vi.stubEnv('SUPABASE_STORAGE_SERVER_KEY','test-only-mock-server-key')
 vi.stubEnv('FAROL_INVOICE_KEY_V1',randomBytes(32).toString('base64'))
}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks()})
describe('Armazenamento privado criptografado de faturas',()=>{
 it('sem chave criptográfica não acessa rede nem banco',async()=>{
  config()
  vi.stubEnv('FAROL_INVOICE_KEY_V1','')
  const fetchMock=vi.fn()
  const sql=vi.fn()
  vi.stubGlobal('fetch',fetchMock)
  const repo=new SupabaseEncryptedInvoiceRepository({$queryRaw:sql} as unknown as PrismaClient)
  await expect(repo.create(input)).rejects.toThrow()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(sql).not.toHaveBeenCalled()
 })
 it('envia apenas envelope cifrado em bucket privado, e cadastra em quarentena',async()=>{
  config()
  const fetchMock=vi.fn().mockResolvedValue({ok:true})
  const sql=vi.fn().mockResolvedValue([{
    id:invoiceId,billing_month:'2026-11',state:'QUARANTINED',
    scan_status:'PENDING',created_at:new Date('2026-11-07T00:00:00Z'),
  }])
  vi.stubGlobal('fetch',fetchMock)
  const repo=new SupabaseEncryptedInvoiceRepository({$queryRaw:sql} as unknown as PrismaClient)
  const result=await repo.create(input)
  expect(result).toMatchObject({state:'QUARANTINED',scanStatus:'PENDING'})
  expect(fetchMock).toHaveBeenCalledOnce()
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit]
  expect(url).toContain('farol-invoices-private/'+workspaceId+'/'+invoiceId+'.pdf.enc')
  expect(options.method).toBe('POST')
  expect((options.headers as Record<string,string>)['Content-Type']).toBe('application/octet-stream')
  const body=Buffer.from(options.body as Uint8Array).toString()
  expect(body).not.toContain('CONTEUDO CONFIDENCIAL')
  expect(body).not.toContain('Banco Teste')
  expect(sql).toHaveBeenCalledOnce()
 })
 it('em erro do banco tenta apagar objeto cifrado e retorna erro genérico',async()=>{
  config()
  const fetchMock=vi.fn().mockResolvedValue({ok:true})
  const sql=vi.fn().mockRejectedValue(new Error('secret: should never be reflected'))
  vi.stubGlobal('fetch',fetchMock)
  const repo=new SupabaseEncryptedInvoiceRepository({$queryRaw:sql} as unknown as PrismaClient)
  await expect(repo.create(input)).rejects.toThrow('Não foi possível registrar a fatura.')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[1][1].method).toBe('DELETE')
 })
 it('consulta pessoal inclui workspace e userId, sem abrir arquivo',async()=>{
  const sql=vi.fn().mockResolvedValue([])
  const repo=new SupabaseEncryptedInvoiceRepository({$queryRaw:sql} as unknown as PrismaClient)
  const result=await repo.listPersonal(workspaceId,userId)
  expect(result).toEqual([])
  const [, ...params] = sql.mock.calls[0] as unknown[]
  expect(params).toContain(workspaceId)
  expect(params).toContain(userId)
 })
})
