import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePublicApiOrigin, verifyPublicHealth } from './verify-public-health.mjs'

const origin = 'https://farol.example.com/'
const response = (status, payload) => ({ status, async json() { return payload } })

test('só permite endereços públicos HTTPS sem credenciais, caminho ou query', () => {
  assert.equal(parsePublicApiOrigin(origin), 'https://farol.example.com')
  for (const bad of [
    '', 'http://farol.example.com/', 'https://user:secret@farol.example.com/',
    'https://farol.example.com/api/v1/health', 'https://farol.example.com/?token=abc',
    'https://localhost/', 'https://127.0.0.1/', 'https://10.0.0.1/',
    'https://farol.local/', 'https://farol.internal/',
  ]) {
    assert.throws(() => parsePublicApiOrigin(bad))
  }
})

test('verifica ambos os endpoints, sem modificar nada', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    return url.endsWith('/health')
      ? response(200, { status: 'ok', service: 'farol-api' })
      : response(200, { status: 'ready' })
  }
  assert.equal(await verifyPublicHealth(origin, fetcher), true)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map(call => call.options.method), ['GET', 'GET'])
  assert.deepEqual(calls.map(call => new URL(call.url).pathname),
    ['/api/v1/health', '/api/v1/ready'])
  assert.ok(calls.every(call => call.options.redirect === 'error'))
  assert.ok(calls.every(call => !('Authorization' in call.options.headers)))
})

test('não mascara indisponibilidade do banco de dados', async () => {
  const fetcher = async url => url.endsWith('/health')
    ? response(200, { status: 'ok' })
    : response(503, { status: 'unavailable' })
  await assert.rejects(verifyPublicHealth(origin, fetcher), /HTTP 503/)
})

test('recusa resposta errada mesmo que o servidor retorne HTTP 200', async () => {
  const fetcher = async () => response(200, { status: 'ok' })
  await assert.rejects(verifyPublicHealth(origin, fetcher), /status incompatível/)
})

test('não considera resposta de rede como sucesso', async () => {
  await assert.rejects(verifyPublicHealth(origin, async () => {
    throw new Error('ECONNRESET')
  }), /não respondeu/)
})
