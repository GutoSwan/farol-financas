import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import {
  PrismaLegacyImportMappingService, LegacyMappingConflictError, validateLegacyMappingSource,
  type LegacyMappingSource,
} from '../src/infrastructure/repositories/PrismaLegacyImportMappingService.js'

const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const workspace = '33333333-3333-4333-8333-333333333333'
const remoteRow = '44444444-4444-4444-8444-444444444444'
const localSpaceKey = 'a'.repeat(64)
const input: LegacyMappingSource = {
  ownerUserId: alice, workspaceId: workspace, entityType: 'workspace',
  sourceWorkspaceKey: localSpaceKey, sourceKey: localSpaceKey, contentFingerprint: 'b'.repeat(64),
}

function mockDb(role: 'OWNER' | 'EDITOR' | null = 'OWNER') {
  type MapRow = {
    ownerUserId: string; workspaceId: string; entityType: string;
    sourceWorkspaceKey: string; sourceKey: string; contentFingerprint: string;
    destinationRecordId: string
  }
  const rows: MapRow[] = []
  const existingTargets = new Set([workspace, remoteRow])
  let writes = 0
  let creations = 0
  const prisma = {
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
      const beforeRows = structuredClone(rows)
      const beforeTargets = new Set(existingTargets)
      const tx = {
        workspaceMember: { findUnique: async ({ where }: { where: { userId_workspaceId: { userId: string; workspaceId: string } } }) =>
          where.userId_workspaceId.userId === alice && where.userId_workspaceId.workspaceId === workspace && role
            ? { role } : null },
        workspace: { findFirst: async ({where}: {where:{id:string}}) =>
          existingTargets.has(where.id) ? {id:where.id} : null },
        transaction: { findFirst: async ({where}: {where:{id:string;workspaceId:string}}) =>
          where.workspaceId === workspace && existingTargets.has(where.id) ? {id:where.id} : null },
        legacyImportMapping: {
          findUnique: async ({where}: {where:{ownerUserId_sourceKey:{ownerUserId:string;sourceKey:string}}}) =>
            rows.find(r => r.ownerUserId === where.ownerUserId_sourceKey.ownerUserId &&
              r.sourceKey === where.ownerUserId_sourceKey.sourceKey) ?? null,
          create: async ({data}: {data:MapRow}) => {
            writes++
            if(rows.some(r => r.ownerUserId === data.ownerUserId && r.sourceKey === data.sourceKey) ||
               rows.some(r => r.entityType === data.entityType && r.destinationRecordId === data.destinationRecordId))
              throw new Error('P2002 UNIQUE')
            rows.push(data)
            return data
          },
        },
      }
      try {return await work(tx)}
      catch(error) {
        rows.splice(0, rows.length, ...beforeRows)
        existingTargets.clear()
        for(const id of beforeTargets)existingTargets.add(id)
        throw error
      }
    },
  } as unknown as PrismaClient
  const service = new PrismaLegacyImportMappingService(prisma)
  const create = async () => {creations++;return workspace}
  return {rows,service,create,existingTargets,get writes(){return writes},get creations(){return creations}}
}

describe('Mapeamento de identidades legadas com transação e unicidade',()=>{
  it('insere uma correspondência no banco e reutiliza a mesma linha em repetição',async()=>{
    const db=mockDb()
    expect(await db.service.importOnce(input,db.create)).toEqual({status:'created',destinationRecordId:workspace})
    expect(await db.service.importOnce(input,db.create)).toEqual({status:'reused',destinationRecordId:workspace})
    expect(db.rows).toHaveLength(1)
    expect(db.writes).toBe(1)
    expect(db.creations).toBe(1)
  })
  it('bloqueia alteração do conteúdo com a mesma chave de origem',async()=>{
    const db=mockDb()
    await db.service.importOnce(input,db.create)
    await expect(db.service.importOnce({...input,contentFingerprint:'c'.repeat(64)},db.create))
      .rejects.toBeInstanceOf(LegacyMappingConflictError)
    expect(db.rows).toHaveLength(1)
    expect(db.creations).toBe(1)
  })
  it('bloqueia conta sem OWNER e não chama criação do registro',async()=>{
    const db=mockDb('EDITOR')
    await expect(db.service.importOnce(input,db.create)).rejects.toThrow('proprietário')
    expect(db.creations).toBe(0)
    expect(db.rows).toHaveLength(0)
  })
  it('não aceita conta alheia tentando referenciar espaço da primeira',async()=>{
    const db=mockDb()
    await expect(db.service.importOnce({...input,ownerUserId:bob},db.create)).rejects.toThrow('proprietário')
    expect(db.rows).toHaveLength(0)
  })
  it('recusa filho antes de associar espaço local ao espaço online',async()=>{
    const db=mockDb()
    const transaction:LegacyMappingSource={...input,entityType:'transaction',sourceKey:'c'.repeat(64)}
    await expect(db.service.importOnce(transaction,async()=>remoteRow)).rejects.toThrow('espaço legado')
    expect(db.rows).toHaveLength(0)
  })
  it('após mapear espaço, pode criar transação no mesmo espaço',async()=>{
    const db=mockDb()
    await db.service.importOnce(input,db.create)
    const tx:LegacyMappingSource={...input,entityType:'transaction',sourceKey:'c'.repeat(64)}
    const result=await db.service.importOnce(tx,async()=>remoteRow)
    expect(result.status).toBe('created')
    expect(db.rows).toHaveLength(2)
    expect(await db.service.importOnce(tx,async()=>{throw Error('não deveria criar')})).toMatchObject({status:'reused'})
  })
  it('falha após criar alvo não pode deixar correspondência órfã e falha o lote inteiro',async()=>{
    const db=mockDb()
    const broken:LegacyMappingSource={...input,entityType:'workspace',contentFingerprint:'d'.repeat(64)}
    await expect(db.service.importOnce(broken,async()=>{throw Error('falha de criação')})).rejects.toThrow('falha de criação')
    expect(db.rows).toHaveLength(0)
  })
  it('destino sem registro correspondente no workspace é rejeitado',async()=>{
    const db=mockDb()
    await db.service.importOnce(input,db.create)
    const tx:LegacyMappingSource={...input,entityType:'transaction',sourceKey:'c'.repeat(64)}
    await expect(db.service.importOnce(tx,async()=>'55555555-5555-4555-8555-555555555555'))
      .rejects.toThrow('não existe')
    expect(db.rows).toHaveLength(1)
  })
  it('não inventa data de quitação dos pagamentos fixos',()=>{
    expect(()=>validateLegacyMappingSource({...input,entityType:'fixed-payment',sourceKey:'c'.repeat(64)}))
      .toThrow('data de quitação')
  })
  it('migration SQL possui unicidade, RLS e bloqueio da Data API',()=>{
    const sql=readFileSync(new URL('../prisma/migrations/20261112172500_legacy_import_mapping/migration.sql',import.meta.url),'utf8')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "LegacyImportMapping_ownerUserId_sourceKey_key"')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "LegacyImportMapping_entityType_destinationRecordId_key"')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL PRIVILEGES')
    expect(sql).not.toContain('CREATE POLICY')
  })
})
