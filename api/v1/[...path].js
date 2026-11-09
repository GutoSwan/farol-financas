/**
 * Server-only proxy for protected Vercel Preview API calls.
 * Frontend browser requests remain same-origin and never see the Vercel OIDC
 * identity token. Backend still verifies the user's Supabase JWT + AAL2.
 *
 * Never expose this function in production: it is a Dev Preview-only bridge.
 */
const BACKEND_PREVIEW = 'https://farol-api-git-security-v014-auth-hardening-farol13.vercel.app'
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}'
const SPACE_PATH = new RegExp('^/api/v1/workspaces/' + UUID + '(?:/(?:transactions|recurring-bills|fixed-expenses|budgets))?$')
const SIMPLE_PATHS = new Set(['/api/v1/health', '/api/v1/ready', '/api/v1/me', '/api/v1/workspaces'])

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

  let target
  try {
    target = new URL(req.url ?? '', 'https://farol-preview.invalid')
  } catch {
    res.statusCode = 400
    return res.end(JSON.stringify({ error: 'Endereço inválido.' }))
  }
  // A Vercel injeta os parâmetros das rotas dinâmicas na query interna.
  // Nunca encaminhar esses parâmetros ao backend. A autorização continua
  // ancorada na URL real e no JWT validado pelo servidor.
  for (const internal of ['...path', 'workspaceId', 'kind']) {
    target.searchParams.delete(internal)
  }
  const allowed = SIMPLE_PATHS.has(target.pathname) || SPACE_PATH.test(target.pathname)
  if (!allowed || [...target.searchParams.keys()].some(k => k !== 'limit') ||
      target.searchParams.getAll('limit').length > 1) {
    res.statusCode = 404
    return res.end(JSON.stringify({ error: 'Rota não autorizada.' }))
  }

  const token = req.headers.authorization
  if (target.pathname !== '/api/v1/health' && target.pathname !== '/api/v1/ready' &&
      (typeof token !== 'string' || !/^Bearer [a-zA-Z0-9._-]{30,8000}$/.test(token))) {
    res.statusCode = 401
    return res.end(JSON.stringify({ error: 'Autenticação necessária.' }))
  }

  // Vercel injects the short-lived workload identity into function requests.
  // Never accept an arbitrary fallback header or a client-supplied bypass key.
  const oidc = req.headers['x-vercel-oidc-token']
  if (typeof oidc !== 'string' || !/^[A-Za-z0-9._-]{50,8000}$/.test(oidc)) {
    res.statusCode = 503
    return res.end(JSON.stringify({ error: 'Identidade da infraestrutura indisponível.' }))
  }

  try {
    const headers = { 'x-vercel-trusted-oidc-idp-token': oidc }
    if (typeof token === 'string') headers.Authorization = token
    const upstream = await fetch(BACKEND_PREVIEW + target.pathname + target.search, {
      method: 'GET',
      headers,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    })
    if (upstream.status >= 300 && upstream.status < 400) {
      res.statusCode = 502
      return res.end(JSON.stringify({ error: 'O backend não está disponível.' }))
    }
    const contentType = upstream.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
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
