/**
 * Compactación del almacén de auth en un hilo aparte.
 *
 * El proceso principal solo renombra el diario actual y manda el trabajo aquí.
 * Este hilo lee el snapshot + diarios pendientes, escribe el snapshot nuevo y
 * borra los diarios. Así un JSON grande de credenciales no bloquea el event
 * loop de los sockets (antes se veían compactaciones de 45 s).
 */
import { parentPort } from 'node:worker_threads'
import fs from 'node:fs/promises'
import path from 'node:path'
import { BufferJSON } from '@whiskeysockets/baileys'

const ARCHIVO_CLAVES = 'auth-keys.json'

function normalizarSnapshot(leido) {
  if (!leido || typeof leido !== 'object') return { v: 2, keyT: 0, keys: {} }
  const keys = leido.keys && typeof leido.keys === 'object' ? leido.keys : leido
  return {
    v: 2,
    keyT: Number(leido.keyT) || 0,
    keys: keys && typeof keys === 'object' ? keys : {}
  }
}

async function aplicarDiario(snapshot, rutaDiario) {
  let texto = ''
  try {
    texto = await fs.readFile(rutaDiario, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  }
  let aplicadas = 0
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue
    try {
      const entrada = JSON.parse(linea, BufferJSON.reviver)
      if (!entrada?.c || !Array.isArray(entrada.u)) continue
      const destino = snapshot.keys[entrada.c] || (snapshot.keys[entrada.c] = {})
      for (const [id, valor] of entrada.u) {
        if (valor === null || valor === undefined) delete destino[id]
        else destino[id] = valor
        aplicadas++
      }
    } catch {}
  }
  return aplicadas
}

parentPort.on('message', async (job) => {
  const { id, carpeta, diarios = [], keyT } = job
  const inicio = Date.now()
  try {
    let snapshot = { v: 2, keyT: 0, keys: {} }
    try {
      const leido = JSON.parse(
        await fs.readFile(path.join(carpeta, ARCHIVO_CLAVES), 'utf8'),
        BufferJSON.reviver
      )
      snapshot = normalizarSnapshot(leido)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }

    let aplicadas = 0
    for (const rutaDiario of diarios) {
      aplicadas += await aplicarDiario(snapshot, rutaDiario)
    }
    snapshot.v = 2
    snapshot.keyT = Number(keyT) || Date.now()

    const destino = path.join(carpeta, ARCHIVO_CLAVES)
    const temporal = `${destino}.${process.pid}.${inicio}.tmp`
    const texto = JSON.stringify(snapshot, BufferJSON.replacer)
    await fs.writeFile(temporal, texto)
    await fs.rename(temporal, destino)
    for (const rutaDiario of diarios) {
      await fs.unlink(rutaDiario).catch((error) => {
        if (error?.code !== 'ENOENT') throw error
      })
    }
    parentPort.postMessage({
      id,
      ok: true,
      ms: Date.now() - inicio,
      bytes: Buffer.byteLength(texto),
      aplicadas
    })
  } catch (error) {
    // Un temporal a medias no debe quedar en la carpeta de la sesión.
    try {
      const temporal = path.join(carpeta, `${ARCHIVO_CLAVES}.${process.pid}.${inicio}.tmp`)
      await fs.unlink(temporal)
    } catch {}
    parentPort.postMessage({
      id,
      ok: false,
      code: error?.code || null,
      ms: Date.now() - inicio,
      error: error?.message || String(error)
    })
  }
})
