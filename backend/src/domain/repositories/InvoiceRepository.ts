export interface NewInvoice {
 id: string
 workspaceId: string
 uploadedBy: string
 billingMonth: string
 metadata: {
  issuer: string
  totalCents: number
  dueDate: string
  cardLast4?: string
 }
 pdfBytes: Buffer
}
export interface InvoiceListEntry {
 id: string
 billingMonth: string
 state: 'QUARANTINED' | 'READY'
 scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'FAILED'
 createdAt: string
}
/** Implementação deve criptografar no servidor ANTES do upload privado. */
export interface InvoiceRepository {
 create(input: NewInvoice): Promise<InvoiceListEntry>
 listPersonal(workspaceId: string, uploadedBy: string): Promise<InvoiceListEntry[]>
}
