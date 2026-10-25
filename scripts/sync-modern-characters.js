import fs from 'node:fs/promises'
import { listarAnimeModernos, obtenerRepartoModerno, ANIO_MODERNO_MINIMO } from '../lib/characters/modern.js'
import { descargarModernosKitsu, recorrerModernosKitsu } from '../lib/characters/modern-kitsu.js'
import { insertarOActualizarEntradaCatalogo, cargarCatalogo, CATALOG_PATH } from '../lib/characters/store.js'

// Importación aditiva: nunca borra el catálogo ni cambia precios de entradas existentes.
let guardados = 0
let fallos = 0
const completo = process.argv.includes('--full')

async function guardarEnDisco() {
  const catalogo = cargarCatalogo()
  catalogo.updatedAt = Date.now()
  const temporal = `${CATALOG_PATH}.tmp`
  await fs.writeFile(temporal, JSON.stringify(catalogo, null, 2))
  await fs.rename(temporal, CATALOG_PATH)
}

async function importarCompleto() {
    let series = 0
    let sinReparto = 0
    for (let anio = ANIO_MODERNO_MINIMO; anio <= new Date().getFullYear(); anio++) {
      try {
        for await (const pagina of recorrerModernosKitsu(anio)) {
          for (const c of pagina.personajes) insertarOActualizarEntradaCatalogo(c)
          guardados += pagina.personajes.length
          series += pagina.series
          sinReparto += pagina.sinReparto
          console.log(`Kitsu ${anio}: ${pagina.offset + pagina.series}/${pagina.total ?? '?'} series; ${pagina.personajes.length} personajes en esta página`)
        }
      } catch (error) {
        fallos++
        console.warn(`Año ${anio} incompleto: ${error.message}`)
      }
      // Checkpoint anual: una caída posterior no pierde los años descargados.
      if (guardados) await guardarEnDisco()
    }
    const modernos = Object.values(cargarCatalogo().characters).filter(c => c.modernYear >= ANIO_MODERNO_MINIMO)
    console.log(`Recorrido completo: ${series} series; ${modernos.length} personajes modernos únicos; ${sinReparto} series sin reparto en la fuente; ${fallos} años con errores.`)
    if (!guardados || fallos) process.exitCode = 1
}

async function importarRapido() {
  let animes
  try {
    animes = await listarAnimeModernos()
  } catch (error) {
    console.warn(`Jikan no disponible (${error.message}). Descargando respaldo moderno desde Kitsu…`)
    animes = []
    for (let anio = ANIO_MODERNO_MINIMO; anio <= new Date().getFullYear(); anio++) {
      await new Promise(resolve => setTimeout(resolve, 1200))
      try {
        const personajes = await descargarModernosKitsu(anio)
        for (const c of personajes) insertarOActualizarEntradaCatalogo(c)
        guardados += personajes.length
        console.log(`Kitsu ${anio}: ${personajes.length} personajes principales`)
      } catch (e) {
        fallos++
        console.warn(`Kitsu ${anio}: ${e.message}`)
      }
    }
    if (!guardados) throw new Error('Ninguna fuente pudo descargar personajes modernos')
  }
  if (!animes.length && !guardados) throw new Error('La fuente no devolvió series modernas')
  for (const anime of animes) {
    await new Promise(resolve => setTimeout(resolve, 1200))
    try {
      const personajes = await obtenerRepartoModerno(anime)
      for (const c of personajes) insertarOActualizarEntradaCatalogo(c)
      guardados += personajes.length
      console.log(`${anime.title}: ${personajes.length} personajes principales`)
    } catch (error) {
      fallos++
      console.warn(`${anime.title}: ${error.message}`)
      // No seguir golpeando el servicio si está limitando peticiones.
      if (/429/.test(error.message)) break
    }
  }
  if (guardados) {
    // Importador offline: mantener el formato del JSON original evita un diff
    // de más de un millón de líneas por compactar todo el catálogo.
    await guardarEnDisco()
  }
  console.log(`Catálogo moderno: ${guardados} personajes procesados; ${fallos} fallos. Catálogo anterior conservado.`)
  if (!guardados || fallos) process.exitCode = 1
}

try {
  if (completo) await importarCompleto()
  else await importarRapido()
} catch (error) {
  console.error(`No se pudo actualizar el catálogo moderno: ${error.message}`)
  process.exitCode = 1
}
