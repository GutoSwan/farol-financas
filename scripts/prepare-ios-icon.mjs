import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeIcon } from './generate-pwa-icons.mjs'

const folder = join(process.cwd(), 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset')
const metadata = JSON.parse(readFileSync(join(folder, 'Contents.json'), 'utf-8'))
let filesWritten = 0

for (const entry of metadata.images ?? []) {
  if (!entry.filename) continue
  const pointSize = Number.parseFloat(entry.size || '1024')
  const scale = Number.parseFloat(entry.scale || '1')
  const pixels = Math.round(pointSize * scale)
  if (!Number.isFinite(pixels) || pixels < 1 || pixels > 1024) {
    throw new Error('Tamanho inesperado de ícone iOS: ' + entry.filename)
  }
  // PNG RGB sem canal alfa, apropriado para App Store e com a arte do Farol.
  writeFileSync(join(folder, entry.filename), makeIcon(pixels, 3))
  filesWritten++
}

if (!filesWritten) throw new Error('Catálogo AppIcon do iOS não contém arquivos de ícone.')
console.log('Ícones iOS do Farol gerados: ' + filesWritten)
