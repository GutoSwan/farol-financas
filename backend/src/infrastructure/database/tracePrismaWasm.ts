import { readFileSync } from 'node:fs'

// Apenas diagnóstico e sinalização ao Node File Trace da Vercel.
// Os caminhos são literais e resolvidos relativamente ao módulo compilado
// (dist/infrastructure/database -> raiz do backend -> node_modules).
// Não há leitura de credenciais nem saída do conteúdo binário nos logs.
export function inspectPrismaWasm(): void {
  let generatedWasm = false
  let runtimeWasm = false

  try {
    const bytes = readFileSync(new URL('../../../node_modules/.prisma/client/query_compiler_bg.wasm', import.meta.url))
    generatedWasm = bytes.length >= 4 &&
      bytes[0] === 0 && bytes[1] === 97 && bytes[2] === 115 && bytes[3] === 109
  } catch {
    // O arquivo pode não estar disponível no deployment da Function.
  }

  try {
    const bytes = readFileSync(new URL('../../../node_modules/@prisma/client/runtime/query_compiler_bg.postgresql.wasm', import.meta.url))
    runtimeWasm = bytes.length >= 4 &&
      bytes[0] === 0 && bytes[1] === 97 && bytes[2] === 115 && bytes[3] === 109
  } catch {
    // Algumas versões do Prisma não usam este nome de arquivo.
  }

  console.info('[farol-api] Prisma WASM arquivos:',
    'generatedValid=' + generatedWasm,
    'runtimeValid=' + runtimeWasm)
}
