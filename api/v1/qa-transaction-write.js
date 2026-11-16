/**
 * Entrada fixa para edição/exclusão QA no frontend Vercel.
 * Evita dependência da rota dinâmica PATCH/DELETE na borda.
 * Somente transforma um comando POST validado em PATCH/DELETE interno;
 * a ponte e o backend ainda exigem JWT, papel OWNER/EDITOR, espaço QA e If-Match.
 */
import proxy from './[...path].js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.statusCode = 405
    return res.end(JSON.stringify({ error: 'Use POST para a operação QA.' }))
  }
  const body = req.body
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !UUID.test(body.workspaceId ?? '') || !UUID.test(body.transactionId ?? '') ||
      !['update', 'delete'].includes(body.action)) {
    res.statusCode = 400
    return res.end(JSON.stringify({ error: 'Comando QA inválido.' }))
  }
  const keys = Object.keys(body).sort().join(',')
  const expected = body.action === 'update'
    ? 'action,input,transactionId,workspaceId'
    : 'action,transactionId,workspaceId'
  if (keys !== expected ||
      (body.action === 'update' && (!body.input || typeof body.input !== 'object' || Array.isArray(body.input)))) {
    res.statusCode = 400
    return res.end(JSON.stringify({ error: 'Estrutura do comando QA inválida.' }))
  }

  // O caminho é construído exclusivamente a partir de UUIDs validados.
  // Não aceitar URL ou método de destino indicados pelo navegador.
  req.url = '/api/v1/workspaces/' + body.workspaceId + '/transactions/' + body.transactionId
  req.method = body.action === 'update' ? 'PATCH' : 'DELETE'
  req.body = body.action === 'update' ? body.input : undefined
  console.info('[farol-qa-bridge] command validated:', body.action)
  return proxy(req, res)
}
