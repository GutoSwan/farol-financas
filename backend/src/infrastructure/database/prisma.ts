import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

export function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString || !/^postgres(?:ql)?:\/\//.test(connectionString)) {
    throw new Error('DATABASE_URL ausente ou inválida.')
  }
  // Prisma 6.19.3 sem mecanismo Rust: o driver node-postgres é empacotado em JS,
  // evitando a ausência de libquery_engine-*.so.node na Vercel.
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}
