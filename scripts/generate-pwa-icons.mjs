import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * stride + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const BG = [13, 27, 74, 255]
const FG = [255, 255, 255, 255]
const ACCENT = [77, 171, 247, 255]

function drawIcon(size) {
  const px = new Uint8Array(size * size * 4)
  const s = size / 512
  const radius = Math.round(96 * s)
  const setPx = (x, y, c) => {
    const i = (y * size + x) * 4
    px[i] = c[0]
    px[i + 1] = c[1]
    px[i + 2] = c[2]
    px[i + 3] = c[3]
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.min(Math.max(x, radius), size - radius)
      const cy = Math.min(Math.max(y, radius), size - radius)
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= radius * radius) setPx(x, y, BG)
    }
  }
  const bx = Math.round(128 * s)
  const by = Math.round(140 * s)
  const bw = Math.round(256 * s)
  const bh = Math.round(232 * s)
  const roofH = Math.round(96 * s)
  for (let y = by; y < by + bh && y < size; y++)
    for (let x = bx; x < bx + bw && x < size; x++) setPx(x, y, FG)
  for (let y = by - roofH; y < by && y >= 0; y++) {
    const progress = (y - (by - roofH)) / roofH
    const width = Math.round(bw * (0.55 + 0.45 * progress))
    for (let x = bx; x < bx + width && x < size; x++) setPx(x, y, FG)
  }
  const chimneyX = bx + Math.round(bw * 0.72)
  const chimneyW = Math.round(40 * s)
  for (let y = by - Math.round(roofH * 1.3); y < by; y++)
    for (let x = chimneyX; x < chimneyX + chimneyW && x < size; x++) setPx(x, y, FG)
  const bandY = by + Math.round(bh * 0.86)
  const bandH = Math.max(2, Math.round(20 * s))
  for (let y = bandY; y < bandY + bandH && y < size; y++)
    for (let x = bx; x < bx + bw && x < size; x++) setPx(x, y, ACCENT)
  return px
}

mkdirSync(resolve(root, 'public/icons'), { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(
    resolve(root, `public/icons/icon-${size}.png`),
    encodePng(size, size, drawIcon(size)),
  )
}
console.log('ícones PWA gerados: public/icons/icon-192.png, public/icons/icon-512.png')
