import test from 'node:test'
import assert from 'node:assert/strict'
import { crearProveedorModerno, listarAnimeModernos, normalizarRepartoModerno } from '../lib/characters/modern.js'
import { normalizarIdPersonaje, insertarOActualizarEntradaCatalogo, obtenerEntradaCatalogo, aPersonajeRuntime } from '../lib/characters/store.js'
import { agregarPersonaje, asegurarUsuarioChars, obtenerCantidadPoseida } from '../lib/characters/collection.js'
import { extraerModernosKitsu, recorrerModernosKitsu } from '../lib/characters/modern-kitsu.js'

const anime = { mal_id: 52991, title: 'Sousou no Frieren', title_english: 'Frieren: Beyond Journey’s End', aired: { prop: { from: { year: 2023 } } } }
const personaje = (id, role = 'Main') => ({ role, character: { mal_id: id, name: `Personaje ${id}`, images: { jpg: { image_url: `https://cdn.myanimelist.net/images/characters/${id}.jpg` } } } })

test('el respaldo Kitsu vincula reparto real, respeta IDs y descarta series antiguas o explícitas', () => {
  const serie = {
    attributes: { canonicalTitle: 'Dandadan', startDate: '2024-10-04', nsfw: false },
    relationships: { characters: { data: [{ type: 'mediaCharacters', id: '1' }] } },
  }
  const json = {
    data: [serie],
    included: [
      { type: 'mediaCharacters', id: '1', attributes: { role: 'main' }, relationships: { character: { data: { type: 'characters', id: '105968' } } } },
      { type: 'characters', id: '105968', attributes: { canonicalName: 'Okarun', image: { original: 'https://media.kitsu.app/okarun.png' } } },
    ],
  }
  const salida = extraerModernosKitsu(json, 2024)
  assert.equal(salida.length, 1)
  assert.equal(salida[0].id, '105968')
  assert.equal(salida[0].modernYear, 2024)
  serie.attributes.nsfw = true
  assert.deepEqual(extraerModernosKitsu(json, 2024), [])
  serie.attributes.nsfw = false
  serie.attributes.startDate = '1999-10-04'
  assert.deepEqual(extraerModernosKitsu(json, 2024), [])
})

test('IDs externos no colisionan con IDs históricos de Kitsu', () => {
  assert.equal(normalizarIdPersonaje('123'), '123')
  assert.equal(normalizarIdPersonaje('kitsu:123'), '123')
  assert.equal(normalizarIdPersonaje('jikan:123'), 'jikan:123')
  assert.equal(normalizarIdPersonaje('anilist:123'), 'anilist:123')
  const almacen = { characters: {} }
  const viejo = insertarOActualizarEntradaCatalogo({ id: '123', name: 'Clásico' }, almacen)
  const nuevo = insertarOActualizarEntradaCatalogo({ id: 'jikan:123', source: 'jikan', name: 'Moderno', modernYear: 2023 }, almacen)
  assert.equal(obtenerEntradaCatalogo('123', almacen).name, 'Clásico')
  assert.equal(obtenerEntradaCatalogo('jikan:123', almacen).name, 'Moderno')
  assert.equal(aPersonajeRuntime(nuevo).source, 'jikan')
  const actualizado = insertarOActualizarEntradaCatalogo({ id: nuevo.id, name: 'Actualizado' }, almacen)
  assert.equal(actualizado.price, nuevo.price)
  assert.equal(actualizado.modernYear, 2023)
  assert.equal(viejo.name, 'Clásico')
})

test('la descarga completa recorre todas las páginas y no filtra personajes secundarios', async () => {
  const offsets = []
  const consultar = async (anio, offset) => {
    offsets.push(offset)
    if (offset >= 60) return { data: [], links: {} }
    return {
      data: [{ id: String(offset), attributes: { canonicalTitle: 'Serie reciente', startDate: '2024-01-01' }, relationships: { characters: { data: [{ type: 'mediaCharacters', id: '1' }] } } }],
      included: [
        { type: 'mediaCharacters', id: '1', attributes: { role: 'supporting' }, relationships: { character: { data: { type: 'characters', id: String(100 + offset) } } } },
        { type: 'characters', id: String(100 + offset), attributes: { canonicalName: 'Secundario', image: { original: 'https://example.com/image.jpg' } } },
      ],
      // La fuente puede omitir next incluso cuando quedan resultados.
      meta: { count: 3 }, links: {},
    }
  }
  const paginas = []
  for await (const p of recorrerModernosKitsu(2024, { consultar, pausa: 0 })) paginas.push(p)
  assert.deepEqual(offsets, [0, 20, 40, 60])
  assert.equal(paginas.flatMap(p => p.personajes).length, 3)
  assert.deepEqual(paginas.flatMap(p => p.personajes.map(c => c.id)), ['100', '120', '140'])
})

test('el recorrido completo ignora la primera página repetida sin perder la última', async () => {
  const paginas = []
  const consultar = async (_, offset) => ({
    data: offset >= 60 ? [] : [{ id: offset < 40 ? 'primera' : 'ultima', attributes: {} }],
    links: {},
  })
  for await (const p of recorrerModernosKitsu(2024, { consultar, pausa: 0 })) paginas.push(p)
  assert.deepEqual(paginas.map(p => p.offset), [0, 40])
})

test('el reparto moderno usa principales con imagen y elimina duplicados', () => {
  const filas = [personaje(1), personaje(1), personaje(2, 'Supporting'), { role: 'Main', character: { mal_id: 3, name: 'Sin foto' } }]
  const normalizados = normalizarRepartoModerno(anime, filas)
  assert.equal(normalizados.length, 1)
  assert.equal(normalizados[0].id, 'jikan:1')
  assert.equal(normalizados[0].anime, anime.title_english)
  assert.equal(normalizados[0].modernYear, 2023)
})

test('la búsqueda moderna pide popularidad desde 2020 y descarta series antiguas', async () => {
  const salida = await listarAnimeModernos(async ruta => {
    assert.match(ruta, /start_date=2020-01-01/)
    assert.match(ruta, /order_by=popularity/)
    assert.match(ruta, /sfw=true/)
    return [anime, { ...anime, aired: { prop: { from: { year: 1990 } } } }]
  })
  assert.deepEqual(salida, [anime])
})

test('proveedor moderno comparte peticiones, respeta exclusiones y usa caché', async () => {
  const rutas = []
  const elegir = crearProveedorModerno({
    cargar: () => [], guardar: c => c, azar: () => 0, ahora: () => 1000,
    consultar: async ruta => {
      rutas.push(ruta)
      return ruta.includes('/characters') ? [personaje(1), personaje(2)] : [anime]
    },
  })
  const resultados = await Promise.all([elegir(), elegir()])
  assert.equal(resultados[0].id, 'jikan:1')
  assert.equal(resultados[1].id, 'jikan:1')
  assert.equal(rutas.length, 2)
  assert.equal((await elegir(new Set(['jikan:1']))).id, 'jikan:2')
  assert.equal(await elegir(new Set(['jikan:1', 'jikan:2'])), null)
  assert.equal(rutas.length, 2)
})

test('una caída de la API no rompe las tiradas ni dispara reintentos continuos', async () => {
  let llamadas = 0
  const elegir = crearProveedorModerno({
    cargar: () => [], guardar: c => c, ahora: () => 1000,
    consultar: async () => { llamadas++; throw new Error('Jikan HTTP 429') },
  })
  assert.equal(await elegir(), null)
  assert.equal(await elegir(), null)
  assert.equal(llamadas, 1)
})

test('los personajes nuevos conservan fuente y se apilan separados de Kitsu', () => {
  const usuario = { characters: [] }
  agregarPersonaje(usuario, { id: '777', name: 'Antiguo', image: 'https://example.com/old.jpg' })
  const moderno = normalizarRepartoModerno(anime, [personaje(777)])[0]
  agregarPersonaje(usuario, moderno)
  agregarPersonaje(usuario, moderno)
  asegurarUsuarioChars(usuario)
  assert.equal(usuario.characters.length, 2)
  assert.equal(obtenerCantidadPoseida(usuario, '777'), 1)
  assert.equal(obtenerCantidadPoseida(usuario, 'jikan:777'), 2)
  assert.equal(usuario.characters.find(c => c.id === 'jikan:777').source, 'jikan')
})
