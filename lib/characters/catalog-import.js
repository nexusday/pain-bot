import { createHash } from 'node:crypto'

export function claveTexto(texto = '') {
  return String(texto).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

export function claveNombre(texto = '') {
  return String(texto).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join(' ')
}

export function crearIndiceSeries(paginas) {
  const indice = new Map()
  const actual = new Date().getFullYear()
  for (const pagina of paginas) {
    for (const anime of pagina.data || []) {
      const a = anime.attributes || {}
      const anio = Number(a.startDate?.slice(0, 4))
      if (a.nsfw || !anio || anio < 2020 || anio > actual) continue
      const serie = { id: String(anime.id), anio, titulo: a.titles?.en || a.canonicalTitle }
      for (const titulo of [a.canonicalTitle, ...Object.values(a.titles || {}), ...(a.abbreviatedTitles || [])]) {
        const clave = claveTexto(titulo)
        if (clave && !indice.has(clave)) indice.set(clave, serie)
      }
    }
  }
  return indice
}

export function normalizarAniPersona(fila, indice, revision, archivos) {
  const serie = indice.get(claveTexto(fila.title))
  if (!serie || !fila.character || !fila.file_name || !archivos.has(fila.file_name)) return null
  let origen
  try { origen = new URL(fila.url) } catch { return null }
  if (origen.protocol !== 'https:' || !origen.hostname.endsWith('.fandom.com') || !origen.pathname.startsWith('/wiki/')) return null
  if (/(?:^|\/)(?:Category|File|Template|User|List_of|Episode|Chapter|Volume):?/i.test(origen.pathname.slice(6))) return null
  if (!/^images\/[a-zA-Z0-9_/-]+\.(?:png|jpe?g|webp)$/i.test(fila.file_name)) return null
  const hash = createHash('sha256').update(origen.href).digest('hex').slice(0, 24)
  const imagen = `https://huggingface.co/datasets/mrzjy/AniPersonaCaps/resolve/${revision}/${fila.file_name}`
  return {
    id: `fandom:${hash}`, source: 'anipersona', sourceUrl: origen.href,
    name: fila.character, anime: fila.title, image: imagen, imageAlt: imagen,
    modernYear: serie.anio, dataset: 'mrzjy/AniPersonaCaps', license: 'CC-BY-4.0',
  }
}
