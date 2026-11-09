import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Scanner estático conservador, sem dependências de terceiros.
 * Não substitui auditoria SAST completa, npm audit ou testes de autorização.
 */
const roots = ['src', 'api', 'backend/src']
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.vue'])
const rules = [
  { label: 'HTML dinâmico (v-html)', pattern: /\bv-html\s*=/g },
  { label: 'Inserção direta de HTML', pattern: /\.innerHTML\s*=/g },
  { label: 'Execução dinâmica eval', pattern: /\beval\s*\(/g },
  { label: 'Execução dinâmica Function', pattern: /\bnew\s+Function\s*\(/g },
  { label: 'Escrita HTML sem sanitização', pattern: /\bdocument\.write\s*\(/g },
  { label: 'Credencial Supabase secreta em código', pattern: /\bsb_secret_[A-Za-z0-9_-]{10,}/g },
  { label: 'Chave Stripe secreta em código', pattern: /\bsk_live_[A-Za-z0-9]{12,}/g },
  { label: 'Token GitHub clássico em código', pattern: /\bghp_[A-Za-z0-9]{20,}/g },
]
async function listFiles(root) {
  const found = []
  let entries
  try { entries = await readdir(root, { withFileTypes: true }) } catch { return found }
  for (const entry of entries) {
    const location = path.join(root, entry.name)
    if (entry.isDirectory()) found.push(...await listFiles(location))
    else if (entry.isFile() && extensions.has(path.extname(location))) found.push(location)
  }
  return found
}

let failures = 0
let scanned = 0
for (const root of roots) {
  for (const file of await listFiles(root)) {
    const code = await readFile(file, 'utf8')
    scanned++
    for (const rule of rules) {
      const matches = [...code.matchAll(rule.pattern)]
      for (const match of matches) {
        failures++
        const line = code.slice(0, match.index).split('\n').length
        // O scanner nunca imprime os próprios segredos, somente o tipo do achado.
        process.stderr.write(`[SECURITY] ${file}:${line}: ${rule.label}\n`)
      }
    }
    if (file.startsWith('src' + path.sep) && /\bprocess\.env\s*\[/.test(code)) {
      failures++
      process.stderr.write(`[SECURITY] ${file}: acesso dinâmico a env no frontend.\n`)
    }
  }
}
process.stdout.write(`Verificação estática: ${scanned} arquivos examinados; ${failures} padrões proibidos.\n`)
if (failures) process.exitCode = 1
