import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

/**
 * Checagem de saúde sem credenciais, sem escrita e sem expor detalhes da API.
 * É executada SOMENTE quando um endereço público for configurado no GitHub.
 */
export function parsePublicApiOrigin(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 240) {
    throw new Error('Configure um endereço HTTPS público da API no GitHub.')
  }
  let url
  try { url = new URL(value) } catch {
    throw new Error('Endereço da API inválido.')
  }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/' || url.port ||
      host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]' ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) || !host.includes('.')) {
    throw new Error('Use somente a origem pública HTTPS da API (sem caminho, porta, IP ou credenciais).')
  }
  return url.origin
}

export async function verifyPublicHealth(value, fetcher = fetch) {
  const origin = parsePublicApiOrigin(value)
  for (const [endpoint, expected] of [
    ['/api/v1/health', 'ok'],
    ['/api/v1/ready', 'ready'],
  ]) {
    let response
    try {
      response = await fetcher(origin + endpoint, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new Error('A API pública não respondeu ao endpoint ' + endpoint + '.')
    }
    if (response.status !== 200) {
      throw new Error(endpoint + ': HTTP ' + response.status + ', esperado HTTP 200.')
    }
    let body
    try { body = await response.json() } catch {
      throw new Error(endpoint + ': resposta não é JSON válido.')
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        body.status !== expected) {
      throw new Error(endpoint + ': status incompatível com a API do Farol.')
    }
  }
  return true
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await verifyPublicHealth(process.env.FAROL_PUBLIC_API_BASE_URL)
    console.info('Farol: health/ready públicos responderam corretamente.')
  } catch (error) {
    // Não registrar URL completa, SQL, credenciais ou payloads de erro.
    console.error('Falha no teste público:', error instanceof Error ? error.message : 'erro desconhecido')
    process.exitCode = 1
  }
}
