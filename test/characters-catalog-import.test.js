import test from 'node:test'
import assert from 'node:assert/strict'
import { crearIndiceSeries, claveTexto, claveNombre, normalizarAniPersona } from '../lib/characters/catalog-import.js'
import { normalizarIdPersonaje, insertarOActualizarEntradaCatalogo } from '../lib/characters/store.js'

const pagina = { data: [
  { id: '42', attributes: { startDate: '2023-09-29', canonicalTitle: 'Sousou no Frieren', titles: { en: "Frieren: Beyond Journey's End" }, abbreviatedTitles: ['Frieren'], nsfw: false } },
  { id: '43', attributes: { startDate: '1999-01-01', canonicalTitle: 'Antigua' } },
  { id: '44', attributes: { startDate: '2024-01-01', canonicalTitle: 'Explícita', nsfw: true } },
] }
const fila = { character: 'Frieren', title: "Frieren: Beyond Journey's End", url: 'https://frieren.fandom.com/wiki/Frieren', file_name: 'images/images_23/abc-def.png' }
const archivos = new Set([fila.file_name])

test('índice moderno reconoce alias, conserva caracteres Unicode y excluye series antiguas', () => {
  const indice = crearIndiceSeries([pagina])
  assert.equal(indice.get(claveTexto('Frieren')).anio, 2023)
  assert.equal(indice.get(claveTexto('Sousou no Frieren')).id, '42')
  assert.equal(indice.has(claveTexto('Antigua')), false)
  assert.equal(indice.has(claveTexto('Explícita')), false)
  assert.equal(claveNombre('Gojo, Satoru'), claveNombre('Satoru Gojo'))
  assert.notEqual(claveTexto('五条'), '')
})

test('importador genera IDs estables separados y conserva atribución y revisión de imagen', () => {
  const indice = crearIndiceSeries([pagina])
  const c = normalizarAniPersona(fila, indice, 'revision123', archivos)
  assert.match(c.id, /^fandom:[a-f0-9]{24}$/)
  assert.equal(normalizarIdPersonaje(c.id), c.id)
  assert.equal(normalizarAniPersona(fila, indice, 'otrarevision', archivos).id, c.id)
  assert.match(c.image, /resolve\/revision123\/images\//)
  const almacen = { characters: {} }
  const guardado = insertarOActualizarEntradaCatalogo(c, almacen)
  assert.equal(guardado.sourceUrl, fila.url)
  assert.equal(guardado.license, 'CC-BY-4.0')
  assert.equal(guardado.dataset, 'mrzjy/AniPersonaCaps')
  assert.equal(guardado.source, 'anipersona')
})

test('no importa fichas sin fecha moderna, sin archivo real o con URLs inválidas', () => {
  const indice = crearIndiceSeries([pagina])
  assert.equal(normalizarAniPersona({ ...fila, title: 'Antigua' }, indice, 'rev', archivos), null)
  assert.equal(normalizarAniPersona(fila, indice, 'rev', new Set()), null)
  assert.equal(normalizarAniPersona({ ...fila, url: 'https://example.com/wiki/Frieren' }, indice, 'rev', archivos), null)
  assert.equal(normalizarAniPersona({ ...fila, url: 'https://frieren.fandom.com/wiki/Category:People' }, indice, 'rev', archivos), null)
})
