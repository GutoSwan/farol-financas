import 'dotenv/config'
import { createPrismaClient } from '../src/infrastructure/database/prisma.js'
import { isMigrationMetadataExposed } from '../src/infrastructure/security/schemaGuard.js'

const names = [
  'User', 'Workspace', 'WorkspaceMember', 'RecurringBill', 'MonthlyBillEntry',
  'FixedExpense', 'FixedExpensePayment', 'Transaction', 'BudgetProject', 'BudgetItem', 'BudgetQuote',
]

async function main() {
  const prisma = createPrismaClient()
  try {
    const rows = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT c.relname::text AS relname, c.relrowsecurity
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `
    const flags = new Map(rows.map((row) => [row.relname, row.relrowsecurity]))
    const unprotected = names.filter((name) => flags.get(name) !== true)
    if (unprotected.length) throw new Error('Tabelas sem proteção RLS: ' + unprotected.join(', '))
    // Também incluir tabela interna criada automaticamente pelo Prisma.
    // Sem RLS E com GRANT público, o histórico de migrações pode ser adulterado.
    const metadata = await prisma.$queryRaw<Array<{ relrowsecurity: boolean; client_grants: boolean }>>`
      SELECT c.relrowsecurity, EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
        ) acl
        LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
        WHERE acl.grantee = 0 OR grantee.rolname IN ('anon', 'authenticated')
      ) AS client_grants
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = '_prisma_migrations'
    `
    if (!metadata.length || metadata.some((row) =>
      isMigrationMetadataExposed(row.relrowsecurity, row.client_grants))) {
      throw new Error('Histórico interno de migrações inacessível ou exposto a papéis públicos.')
    }
    process.stdout.write(`Migração validada: ${names.length} tabelas protegidas com RLS; metadata Prisma sem exposição direta.\n`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falha ao conferir RLS.')
  process.exitCode = 1
})
