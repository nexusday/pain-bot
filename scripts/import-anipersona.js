import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pipeline } from 'node:stream/promises'
import { createInterface } from 'node:readline'
import { crearIndiceSeries, claveTexto, claveNombre, normalizarAniPersona } from '../lib/characters/catalog-import.js'
import { cargarCatalogo, insertarOActualizarEntradaCatalogo, CATALOG_PATH } from '../lib/characters/store.js'

const cache = process.env.PAIN_CATALOG_IMPORT_CACHE || path.join(
  process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : os.tmpdir(),
  'catalog-sources',
)
fs.mkdirSync(cache, { recursive: true })
const pausa = ms => new Promise(resolve => setTimeout(resolve, ms))

async function jsonRemoto(url) {
  let error
  for (let i = 0; i < 3; i++) {
    if (i) await pausa(i * 3000)
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45_000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`)
      return await r.json()
    } catch (e) { error = e }
  }
  throw error
}

async function paginasDeAnio(anio) {
  const paginas = []
  let offset = 0
  while (true) {
    const archivo = path.join(cache, `series-${anio}-${offset}.json`)
    let pagina
    if (fs.existsSync(archivo)) pagina = JSON.parse(fs.readFileSync(archivo, 'utf8'))
    else {
      await pausa(1200)
      pagina = await jsonRemoto(`https://kitsu.io/api/edge/anime?filter[seasonYear]=${anio}&sort=id&page[limit]=20&page[offset]=${offset}`)
      if (!Array.isArray(pagina.data)) throw new Error(`Página inválida: ${anio}/${offset}`)
      fs.writeFileSync(archivo, JSON.stringify(pagina))
    }
    if (!pagina.data.length) break
    paginas.push(pagina)
    // Kitsu puede omitir links.next antes de la última página real.
    // Confirmar el final con una página vacía, no solo con ese enlace.
    offset += 20
  }
  console.log(`${anio}: ${paginas.reduce((n, p) => n + p.data.length, 0)} fichas de series para comprobar fechas`)
  return paginas
}

try {
  const repo = await jsonRemoto('https://huggingface.co/api/datasets/mrzjy/AniPersonaCaps')
  if (repo.cardData?.license !== 'cc-by-4.0' || !repo.sha || !repo.siblings?.length) throw new Error('No se pudo verificar la licencia o revisión del dataset')
  const archivos = new Set(repo.siblings.map(f => f.rfilename))
  const metadata = path.join(cache, `anipersona-${repo.sha}.jsonl`)
  if (!fs.existsSync(metadata)) {
    const r = await fetch(`https://huggingface.co/datasets/mrzjy/AniPersonaCaps/resolve/${repo.sha}/metadata.jsonl`, { signal: AbortSignal.timeout(180_000) })
    if (!r.ok) throw new Error(`Descarga del dataset: HTTP ${r.status}`)
    await pipeline(r.body, fs.createWriteStream(`${metadata}.tmp`))
    fs.renameSync(`${metadata}.tmp`, metadata)
  }

  // Dos años en paralelo; cada flujo espacia sus peticiones y cachea páginas.
  const paginas = []
  for (let anio = 2020; anio <= new Date().getFullYear(); anio += 2) {
    const anios = [anio, anio + 1].filter(a => a <= new Date().getFullYear())
    paginas.push(...(await Promise.all(anios.map(paginasDeAnio))).flat())
  }
  const indice = crearIndiceSeries(paginas)
  const catalogo = cargarCatalogo()
  const coincidencias = new Map()
  const claveDe = (nombre, titulo) => {
    const serie = indice.get(claveTexto(titulo))
    return serie ? `${serie.id}:${claveNombre(nombre)}` : null
  }
  for (const c of Object.values(catalogo.characters)) {
    const clave = claveDe(c.name, c.anime)
    if (clave) coincidencias.set(clave, c)
  }

  let leidos = 0
  let nuevos = 0
  let existentes = 0
  let omitidos = 0
  const entradas = []
  const vistos = new Set()
  const lineas = createInterface({ input: fs.createReadStream(metadata), crlfDelay: Infinity })
  for await (const linea of lineas) {
    if (!linea.trim()) continue
    const fila = JSON.parse(linea)
    leidos++
    const c = normalizarAniPersona(fila, indice, repo.sha, archivos)
    if (!c) { omitidos++; continue }
    if (vistos.has(c.id)) continue
    vistos.add(c.id)
    const clave = claveDe(c.name, c.anime)
    const anterior = catalogo.characters[c.id] || coincidencias.get(clave)
    if (anterior) {
      // No reemplazar imágenes, nombres, IDs ni valores de las colecciones existentes.
      entradas.push({ ...anterior, modernYear: Math.max(anterior.modernYear || 0, c.modernYear) })
      existentes++
    } else {
      entradas.push(c)
      coincidencias.set(clave, c)
      nuevos++
    }
  }
  if (!entradas.length) throw new Error('Ningún personaje moderno válido; no se modifica el catálogo')

  const backup = path.join(cache, `catalog-before-anipersona-${Date.now()}.json`)
  fs.copyFileSync(CATALOG_PATH, backup)
  for (const c of entradas) insertarOActualizarEntradaCatalogo(c)
  catalogo.sources ||= {}
  catalogo.sources['mrzjy/AniPersonaCaps'] = {
    author: 'mrzjy', url: 'https://huggingface.co/datasets/mrzjy/AniPersonaCaps',
    revision: repo.sha, license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    changes: 'Selección de personajes de series estrenadas desde 2020, conversión al esquema del bot y asignación de estadísticas de juego.',
    importedAt: new Date().toISOString(),
  }
  catalogo.updatedAt = Date.now()
  fs.writeFileSync(`${CATALOG_PATH}.tmp`, JSON.stringify(catalogo, null, 2))
  fs.renameSync(`${CATALOG_PATH}.tmp`, CATALOG_PATH)
  console.log(JSON.stringify({ leidos, nuevos, existentes, omitidos, total: Object.keys(catalogo.characters).length, modernos: Object.values(catalogo.characters).filter(c => c.modernYear >= 2020).length, backup }, null, 2))
} catch (error) {
  console.error(`Importación AniPersonaCaps: ${error.message}`)
  process.exitCode = 1
}
