import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const output = new URL('../public/icons/', import.meta.url)
mkdirSync(output, { recursive: true })

const palette = {
  plum: [113, 46, 73, 255],
  plumDeep: [87, 32, 60, 255],
  warm: [247, 234, 208, 255],
  gold: [255, 206, 111, 255],
  white: [255, 251, 244, 255],
}

function colorAt(x, y) {
  const dx = x - 0.5
  const dy = y - 0.5
  let color = palette.plum
  // O desenho fica na área segura de ícones adaptativos/maskable.
  if (dx * dx + dy * dy < 0.305 ** 2) color = palette.plumDeep
  if (y > 0.298 && y < 0.343 && ((x > 0.24 && x < 0.385) || (x > 0.615 && x < 0.76))) color = palette.gold
  if (y > 0.365 && y < 0.4 && ((x > 0.28 && x < 0.385) || (x > 0.615 && x < 0.72))) color = palette.gold
  if (y > 0.415 && y < 0.735 && Math.abs(dx) < 0.075 + (y - 0.415) * 0.17) color = palette.warm
  if (y > 0.397 && y < 0.435 && Math.abs(dx) < 0.123) color = palette.white
  if (y > 0.327 && y < 0.399 && Math.abs(dx) < 0.073) color = palette.gold
  if (y > 0.299 && y < 0.323 && Math.abs(dx) < 0.107) color = palette.white
  if (y > 0.27 && y < 0.303 && Math.abs(dx) < (0.075 - (y - 0.27) * 1.2)) color = palette.white
  if (y > 0.54 && y < 0.735 && Math.abs(dx) < 0.022) color = palette.plumDeep
  if (y > 0.72 && y < 0.745 && Math.abs(dx) < 0.15) color = palette.white
  return color
}

function checksum(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const label = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(checksum(Buffer.concat([label, data])))
  return Buffer.concat([length, label, data, crc])
}

function makeIcon(size) {
  const bytes = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    for (let x = 0; x < size; x++) {
      const color = colorAt((x + 0.5) / size, (y + 0.5) / size)
      for (let i = 0; i < 4; i++) bytes[row + 1 + x * 4 + i] = color[i]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(bytes, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, output), makeIcon(size))
}
