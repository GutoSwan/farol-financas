import type { PrismaClient } from '@prisma/client'
import type { InvoiceRepository, NewInvoice, InvoiceListEntry } from '../../domain/repositories/InvoiceRepository.js'
import { encryptInvoiceBytes, prepareEncryptedInvoicePdf } from '../security/invoiceEncryption.js'

type DbInvoice = { id: string; billing_month: string; state: string; scan_status: string; created_at: Date }
function present(row: DbInvoice): InvoiceListEntry {
  return {
    id: row.id, billingMonth: row.billing_month,
    state: row.state as InvoiceListEntry['state'],
    scanStatus: row.scan_status as InvoiceListEntry['scanStatus'],
    createdAt: row.created_at.toISOString(),
  }
}
function storageConfig(): { url: string; key: string; encryptionKey: string } {
  const rawUrl = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_STORAGE_SERVER_KEY ?? ''
  const encryptionKey = process.env.FAROL_INVOICE_KEY_V1 ?? ''
  const parsed = new URL(rawUrl)
  if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) ||
      parsed.pathname !== '/' || !key || !encryptionKey) {
    throw new Error('Armazenamento seguro de faturas não configurado.')
  }
  // A chave é privada, nunca incluída nas respostas ou logs.
  return { url: parsed.origin, key, encryptionKey }
}
function storagePath(workspaceId: string, invoiceId: string): string {
  return workspaceId + '/' + invoiceId + '.pdf.enc'
}
async function uploadEncryptedObject(bytes: Buffer, workspaceId: string, invoiceId: string): Promise<void> {
  const {url,key} = storageConfig()
  const response = await fetch(url + '/storage/v1/object/farol-invoices-private/' + storagePath(workspaceId, invoiceId), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key, apikey: key,
      'Content-Type': 'application/octet-stream', 'x-upsert': 'false',
      'Cache-Control': 'no-store',
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error('Falha no armazenamento privado.')
}
async function deleteEncryptedObject(workspaceId: string, invoiceId: string): Promise<void> {
  const {url,key} = storageConfig()
  await fetch(url + '/storage/v1/object/farol-invoices-private/' + storagePath(workspaceId,invoiceId), {
    method:'DELETE', headers: { Authorization:'Bearer '+key, apikey:key },
    signal:AbortSignal.timeout(15_000),
  })
}
export class SupabaseEncryptedInvoiceRepository implements InvoiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewInvoice): Promise<InvoiceListEntry> {
    // Sem segredo ou serviço configurado: falha fechada, sem gravar dados.
    const { encryptionKey } = storageConfig()
    const encryptedMetadata = encryptInvoiceBytes(
      Buffer.from(JSON.stringify(input.metadata), 'utf8'),
      encryptionKey, input.workspaceId, input.id, 'metadata',
    )
    const encryptedPdf = prepareEncryptedInvoicePdf(
      input.pdfBytes, encryptionKey, input.workspaceId, input.id,
    )
    await uploadEncryptedObject(encryptedPdf.bytes, input.workspaceId, input.id)
    try {
      const rows = await this.prisma.$queryRaw<DbInvoice[]>`
        insert into public.invoice_documents
          (id,workspace_id,uploaded_by,billing_month,encrypted_metadata,
           metadata_key_version,object_key,encrypted_file_sha256,encrypted_file_size,
           state,scan_status,visibility)
        values
          (${input.id}::uuid,${input.workspaceId}::uuid,${input.uploadedBy}::uuid,
           ${input.billingMonth},${JSON.stringify(encryptedMetadata)},'v1',
           ${randomUUID()}::uuid,${encryptedPdf.sha256},${encryptedPdf.bytes.length},
           'QUARANTINED','PENDING','PERSONAL')
        returning id,billing_month,state,scan_status,created_at
      `
      if (rows.length !== 1) throw new Error('Falha ao registrar fatura.')
      return present(rows[0])
    } catch {
      // Compensação best effort: se falhar, tarefa de reconciliação deve limpar
      // objetos órfãos e alertar sem registrar nomes/valores/credenciais.
      await deleteEncryptedObject(input.workspaceId,input.id).catch(() => undefined)
      throw new Error('Não foi possível registrar a fatura.')
    }
  }

  async listPersonal(workspaceId: string, uploadedBy: string): Promise<InvoiceListEntry[]> {
    const rows = await this.prisma.$queryRaw<DbInvoice[]>`
      select id,billing_month,state,scan_status,created_at
      from public.invoice_documents
      where workspace_id = ${workspaceId}::uuid
        and uploaded_by = ${uploadedBy}::uuid
        and visibility = 'PERSONAL'
      order by billing_month desc, created_at desc
      limit 50
    `
    return rows.map(present)
  }
}
