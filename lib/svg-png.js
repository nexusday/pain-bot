import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import sharp from './sharp.js'

const RAIZ = dirname(fileURLToPath(import.meta.url))
const FAMILIA = 'DejaVu Sans'

const PROPIAS = [
  join(RAIZ, 'fonts', 'DejaVuSans.ttf'),
  join(RAIZ, 'fonts', 'DejaVuSans-Bold.ttf'),
]

const SISTEMA = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
  'C:/Windows/Fonts/segoeuib.ttf',
]

function archivosFuente() {
  const propias = PROPIAS.filter((ruta) => existsSync(ruta))
  if (propias.length) return propias
  return SISTEMA.filter((ruta) => existsSync(ruta))
}

function opcionesFuente() {
  const fontFiles = archivosFuente()
  return {
    loadSystemFonts: false,
    fontFiles,
    defaultFontFamily: FAMILIA,
    sansSerifFamily: FAMILIA,
    serifFamily: FAMILIA,
    cursiveFamily: FAMILIA,
    fantasyFamily: FAMILIA,
    monospaceFamily: FAMILIA,
  }
}

function prepararSvg(svg) {
  let marcado = String(svg || '')
  if (!marcado.includes('xmlns=')) {
    marcado = marcado.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
  }
  return marcado.replace(/font-family="[^"]*"/gi, `font-family="${FAMILIA}"`)
}

export async function svgAPng(svg, width) {
  const marcado = prepararSvg(svg)
  try {
    const { Resvg } = await import('@resvg/resvg-js')
    const resvg = new Resvg(marcado, {
      fitTo: width ? { mode: 'width', value: width } : undefined,
      font: opcionesFuente(),
    })
    return Buffer.from(resvg.render().asPng())
  } catch (e) {
    console.error('[tablero] svg:', e?.message || e)
    return sharp(Buffer.from(marcado)).png().toBuffer()
  }
}

export async function fotoValidaAPng(data) {
  try {
    if (!data) return null
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
    if (buf.length < 64) return null
    return await sharp(buf).rotate().png().toBuffer()
  } catch {
    return null
  }
}
