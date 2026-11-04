import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { previewPgOptions } from './pgVerifiedOptions.js'

export function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString || !/^postgres(?:ql)?:\/\//.test(connectionString)) {
    throw new Error('DATABASE_URL ausente ou inválida.')
  }

  // Preview usa a mesma configuração TLS que passou no teste direto com pg.
  // Entregamos um Pool explícito ao adaptador em vez de depender da criação
  // interna do Pool, para isolar discrepâncias de conexão no Prisma.
  // Produção mantém exatamente o comportamento já existente.
  const adapter = process.env.VERCEL_ENV === 'preview'
    ? new PrismaPg(new Pool({ ...previewPgOptions(connectionString), max: 2 }))
    : new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}
