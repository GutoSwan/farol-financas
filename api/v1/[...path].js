/**
 * Ponte QA entre o frontend Preview e o backend Preview.
 * Vercel controla o OIDC entre deployments; o backend verifica o JWT Supabase,
 * sessão ativa e a participação do usuário em cada espaço financeiro.
 * Gravação só para lançamento fictício com flag privada, rota exata e JWT.
 */
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}'
const SPACE_PATH = new RegExp('^/api/v1/workspaces/' + UUID + '(?:/(?:transactions|recurring-bills|fixed-expenses|budgets))?$')
const QA_BILL_PATH = '/api/v1/qa-bill-write'
const QA_BILL_COLLECTION = new RegExp('^/api/v1/workspaces/' + UUID + '/recurring-bills$')
const QA_TRANSACTION_COLLECTION = new RegExp('^/api/v1/workspaces/' + UUID + '/transactions$')
const QA_TRANSACTION_ITEM = new RegExp('^/api/v1/workspaces/' + UUID + '/transactions/' + UUID + '$')
const READINESS_PATH = new RegExp('^/api/v1/workspaces/' + UUID + '/legacy-readiness$')
const SIMPLE_PATHS = new Set(['/api/v1/health', '/api/v1/ready', '/api/v1/me', '/api/v1/workspaces'])

function backendOrigin() {
  try {
    const parsed = new URL(process.env.FAROL_QA_BACKEND_ORIGIN || '')
    if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password ||
        parsed.search || parsed.hash || parsed.pathname !== '/' ||
        !/^farol-[a-z0-9-]+-farol13\.vercel\.app$/.test(parsed.hostname)) return null
    return parsed.origin
  } catch { return null }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (process.env.VERCEL_ENV !== 'preview') {
    res.statusCode = 404
    return res.end(JSON.stringify({ error: 'Recurso indisponível.' }))
  }
  const upstreamOrigin = backendOrigin()
  if (!upstreamOrigin) {
    res.statusCode = 503
    return res.end(JSON.stringify({ error: 'Backend QA não configurado.' }))
  }

  let url
  try { url = new URL(req.url ?? '', 'https://farol-preview.invalid') }
  catch {
    res.statusCode = 400
    return res.end(JSON.stringify({ error: 'Endereço inválido.' }))
  }
  for (const internal of ['...path', 'workspaceId', 'kind']) url.searchParams.delete(internal)
  const route = url.pathname
  const isQaMutation = process.env.FAROL_QA_TRANSACTION_WRITES_ENABLED === 'true' &&
    ((req.method === 'POST' && QA_TRANSACTION_COLLECTION.test(route)) ||
      (['PATCH', 'DELETE'].includes(req.method) && QA_TRANSACTION_ITEM.test(route)) ||
      (req.method === 'POST' && (route === QA_BILL_PATH || QA_BILL_COLLECTION.test(route))))
  if (req.method !== 'GET' && !isQaMutation) {
    // Diagnóstico restrito a métodos de escrita; não registrar URL, IDs ou JWT.
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      console.warn('[farol-qa-proxy] mutation denied before proxy:', req.method)
    }
    res.setHeader('Allow', 'GET')
    res.statusCode = 405
    return res.end(JSON.stringify({ error: 'Método não permitido no Preview.' }))
  }
  const isFinancial = SPACE_PATH.test(route)
  const allowed = SIMPLE_PATHS.has(route) || isFinancial || READINESS_PATH.test(route)
  const params = [...url.searchParams.keys()]
  if ((!allowed && !isQaMutation) || (isQaMutation && params.length > 0) ||
      params.some(key => key !== 'limit') ||
      url.searchParams.getAll('limit').length > 1 ||
      (params.length && !isFinancial) ||
      (url.searchParams.has('limit') && !/^(?:[1-9]|[1-4][0-9]|50)$/.test(url.searchParams.get('limit') ?? ''))) {
    res.statusCode = 404
    return res.end(JSON.stringify({ error: 'Rota não autorizada.' }))
  }

  const token = req.headers.authorization
  if (route !== '/api/v1/health' && route !== '/api/v1/ready' &&
      (typeof token !== 'string' || !/^Bearer [A-Za-z0-9._-]{30,8000}$/.test(token))) {
    res.statusCode = 401
    return res.end(JSON.stringify({ error: 'Autenticação necessária.' }))
  }

  // Credencial privada da Vercel, injetada somente na Function da branch QA.
  // Nunca utilizar cabeçalhos do navegador como autenticação entre projetos.
  const bypass = process.env.FAROL_QA_BACKEND_BYPASS_SECRET ?? ''
  const oidc = process.env.VERCEL_OIDC_TOKEN ?? ''
  const headers = {}
  let mutationBody
  if (isQaMutation) {
    if (req.method === 'POST' || req.method === 'PATCH') {
      if (!new RegExp('^application/json(?:;|$)', 'i').test(req.headers['content-type'] ?? '') ||
          !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: 'Envie um objeto JSON.' }))
      }
      mutationBody = JSON.stringify(req.body)
      if (mutationBody.length > 2000) {
        res.statusCode = 413
        return res.end(JSON.stringify({ error: 'Payload QA excede o limite.' }))
      }
      headers['Content-Type'] = 'application/json'
    } else if (req.body && Object.keys(req.body).length > 0) {
      res.statusCode = 400
      return res.end(JSON.stringify({ error: 'DELETE não recebe conteúdo.' }))
    }
    if (req.method === 'PATCH' || req.method === 'DELETE' ||
        ((route === QA_BILL_PATH || QA_BILL_COLLECTION.test(route)) && req.body.action !== 'create')) {
      const version = req.headers['if-match']
      if (typeof version !== 'string' || !/^"([1-9][0-9]{0,9})"$/.test(version)) {
        res.statusCode = 428
        return res.end(JSON.stringify({ error: 'Envie If-Match com a versão atual.' }))
      }
      headers['If-Match'] = version
    }
  }
  if (/^[A-Za-z0-9._-]{24,512}$/.test(bypass)) {
    headers['x-vercel-protection-bypass'] = bypass
  } else if (/^[A-Za-z0-9._-]{50,8000}$/.test(oidc)) {
    headers['x-vercel-trusted-oidc-idp-token'] = oidc
  } else {
    res.statusCode = 503
    return res.end(JSON.stringify({ error: 'Identidade da infraestrutura indisponível.' }))
  }
  try {
    if (typeof token === 'string') headers.Authorization = token
    const upstream = await fetch(upstreamOrigin + route + url.search, {
      method: req.method, headers, ...(mutationBody ? { body: mutationBody } : {}), cache: 'no-store', redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    })
    if (isQaMutation) {
      // Somente método e HTTP status: sem identificadores nem valores financeiros.
      console.info('[farol-qa-proxy] mutation upstream:', req.method, upstream.status)
      res.setHeader('X-Farol-QA-Backend', 'reached')
    }
    if (upstream.status >= 300 && upstream.status < 400) {
      res.statusCode = 502
      return res.end(JSON.stringify({ error: 'O backend não está disponível.' }))
    }
    if (upstream.status === 204) {
      res.statusCode = 204
      return res.end()
    }
    if (!(upstream.headers.get('content-type') ?? '').includes('application/json')) {
      res.statusCode = 502
      return res.end(JSON.stringify({ error: 'Resposta inesperada do backend.' }))
    }
    const body = await upstream.text()
    if (body.length > 300000) {
      res.statusCode = 502
      return res.end(JSON.stringify({ error: 'Resposta excede o limite.' }))
    }
    res.statusCode = upstream.status
    return res.end(body)
  } catch {
    res.statusCode = 502
    return res.end(JSON.stringify({ error: 'Não foi possível consultar o backend.' }))
  }
}
