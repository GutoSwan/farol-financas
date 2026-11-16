/**
 * Ponte somente leitura entre o frontend Preview e o backend Preview.
 * Vercel controla o OIDC entre deployments; o backend verifica o JWT Supabase,
 * sessão ativa e a participação do usuário em cada espaço financeiro.
 * Nenhuma rota de escrita ou configuração enviada pelo navegador é aceita.
 */
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}'
const SPACE_PATH = new RegExp('^/api/v1/workspaces/' + UUID + '(?:/(?:transactions|recurring-bills|fixed-expenses|budgets))?$')
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
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.statusCode = 405
    return res.end(JSON.stringify({ error: 'Método não permitido no Preview.' }))
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
  const isFinancial = SPACE_PATH.test(route)
  const allowed = SIMPLE_PATHS.has(route) || isFinancial || READINESS_PATH.test(route)
  const params = [...url.searchParams.keys()]
  if (!allowed || params.some(key => key !== 'limit') ||
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
      method: 'GET', headers, cache: 'no-store', redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    })
    if (upstream.status >= 300 && upstream.status < 400) {
      res.statusCode = 502
      return res.end(JSON.stringify({ error: 'O backend não está disponível.' }))
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
