import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { previewPgOptions } from './pgVerifiedOptions.js'

export function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString || !/^postgres(?:ql)?:\/\//.test(connectionString)) {
    throw new Error('DATABASE_URL ausente ou inválida.')
  }
  // Prisma 6.19.3 sem mecanismo Rust: o driver node-postgres é empacotado em JS,
  // evitando a ausência de libquery_engine-*.so.node na Vercel.
  // Em Preview, usa o certificado CA confiável do Supabase tanto no teste
  // isolado quanto no driver do Prisma (sem desativar a verificação TLS).
  const adapter = process.env.VERCEL_ENV === 'preview'
    ? new PrismaPg(previewPgOptions(connectionString))
    : new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}
