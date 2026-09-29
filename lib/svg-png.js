import { existsSync } from 'fs'
import sharp from './sharp.js'

const CANDIDATAS = [
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

function opcionesFuente() {
  const fontFiles = CANDIDATAS.filter((ruta) => existsSync(ruta))
  const deja = fontFiles.some((ruta) => /dejavu|freesans|liberation/i.test(ruta))
  return {
    loadSystemFonts: true,
    fontFiles,
    defaultFontFamily: deja ? 'DejaVu Sans' : 'Arial',
  }
}

export async function svgAPng(svg, width) {
  const marcado = String(svg || '').includes('xmlns=')
    ? String(svg)
    : String(svg).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')

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
