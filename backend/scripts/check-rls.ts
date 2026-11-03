import 'dotenv/config'
import { createPrismaClient } from '../src/infrastructure/database/prisma.js'

const names = [
  'User', 'Workspace', 'WorkspaceMember', 'RecurringBill', 'MonthlyBillEntry',
  'FixedExpense', 'FixedExpensePayment', 'Transaction', 'BudgetProject', 'BudgetItem', 'BudgetQuote',
]

async function main() {
  const prisma = createPrismaClient()
  try {
    const rows = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT c.relname, c.relrowsecurity
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `
    const flags = new Map(rows.map((row) => [row.relname, row.relrowsecurity]))
    const unprotected = names.filter((name) => flags.get(name) !== true)
    if (unprotected.length) throw new Error('Tabelas sem proteção RLS: ' + unprotected.join(', '))
    process.stdout.write(`Migração validada: ${names.length} tabelas protegidas com RLS.\n`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falha ao conferir RLS.')
  process.exitCode = 1
})
