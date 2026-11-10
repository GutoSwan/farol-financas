import 'dotenv/config'
import { Client } from 'pg'

/**
 * Regressão real de RLS apenas no PostgreSQL EFÊMERO do GitHub Actions.
 * Insere identidades artificiais dentro de uma transação que sempre termina
 * em ROLLBACK. Nunca conecta, consulta ou altera Supabase Dev/Prod.
 */
async function main(): Promise<void> {
  const raw = process.env.DATABASE_URL ?? ''
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('Banco CI inválido.') }
  if (process.env.CI !== 'true' ||
      !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.port !== '5433' || url.pathname !== '/farol' ||
      decodeURIComponent(url.username) !== 'farol') {
    throw new Error('Teste de RLS autorizado somente no PostgreSQL efêmero do CI.')
  }

  const client = new Client({ connectionString: raw, connectionTimeoutMillis: 5_000 })
  try {
    await client.connect()
    await client.query('BEGIN')
    await client.query('CREATE ROLE farol_ci_rls_reader NOLOGIN NOBYPASSRLS')
    await client.query('GRANT USAGE ON SCHEMA public TO farol_ci_rls_reader')
    await client.query(`GRANT SELECT ON
      public."User", public."Workspace", public."WorkspaceMember", public."Transaction"
      TO farol_ci_rls_reader`)
    const userId = '11111111-1111-4111-8111-111111111111'
    const workspaceId = '22222222-2222-4222-8222-222222222222'
    await client.query('INSERT INTO public."User" ("id") VALUES ($1::uuid)', [userId])
    await client.query('INSERT INTO public."Workspace" ("id","name") VALUES ($1::uuid,$2)', [workspaceId, 'Espaço fictício CI'])
    await client.query(`INSERT INTO public."WorkspaceMember"
      ("userId","workspaceId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [userId, workspaceId])
    await client.query(`INSERT INTO public."Transaction"
      ("id","workspaceId","description","category","amountCents","kind","occurredOn")
      VALUES ('33333333-3333-4333-8333-333333333333'::uuid,
        $1::uuid,'Dado fictício CI','Teste',1000,'EXPENSE','2026-11-09')`, [workspaceId])

    const tables = ['User', 'Workspace', 'WorkspaceMember', 'Transaction'] as const
    for (const name of tables) {
      const data = await client.query<{ total: number }>(`SELECT count(*)::int AS total FROM public."${name}"`)
      if (data.rows[0]?.total !== 1) throw new Error('Falha no preparo do teste RLS: ' + name)
    }
    await client.query('SET LOCAL ROLE farol_ci_rls_reader')
    const role = await client.query<{ username: string; bypassrls: boolean }>(`
      SELECT current_user AS username, rolbypassrls AS bypassrls FROM pg_roles WHERE rolname = current_user
    `)
    if (role.rows[0]?.username !== 'farol_ci_rls_reader' || role.rows[0].bypassrls) {
      throw new Error('Papel de teste não isolado.')
    }
    for (const name of tables) {
      const visible = await client.query<{ total: number }>(`SELECT count(*)::int AS total FROM public."${name}"`)
      if (visible.rows[0]?.total !== 0) throw new Error('RLS falhou em ocultar a tabela ' + name)
    }
    console.info('PostgreSQL CI: quatro tabelas negaram leitura a usuário sem política autorizadora.')
  } finally {
    try { await client.query('ROLLBACK') } catch { /* desconexão também desfaz a transação */ }
    await client.end().catch(() => {})
  }
}

main().catch(() => {
  console.error('Falha de regressão de RLS no PostgreSQL temporário.')
  process.exitCode = 1
})
