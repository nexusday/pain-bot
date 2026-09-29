import fs from 'fs'
import { Writer } from 'steno'

function ceder() {
  return new Promise((resolve) => setImmediate(resolve))
}

async function unirCediendo(partes) {
  const bloques = []
  const tamano = 300
  for (let i = 0; i < partes.length; i += tamano) {
    bloques.push(partes.slice(i, i + tamano).join(''))
    await ceder()
  }
  if (bloques.length <= 1) return bloques[0] || ''
  let texto = ''
  for (let i = 0; i < bloques.length; i++) {
    texto += bloques[i]
    if (i % 8 === 0) await ceder()
  }
  return texto
}

function esMapaGrande(valor) {
  return valor && typeof valor === 'object' && !Array.isArray(valor) && Object.keys(valor).length > 60
}

/**
 * Arma el JSON por tandas y suelta el hilo entre ellas.
 * Un stringify de todo el archivo (12 MB o más) frenaba comandos de todos los bots.
 */
export async function stringifyPorPartes(valor) {
  if (valor === undefined) return undefined
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor)
  if (Array.isArray(valor)) {
    const partes = ['[']
    for (let i = 0; i < valor.length; i++) {
      const pieza = await stringifyPorPartes(valor[i])
      partes.push(pieza === undefined ? 'null' : pieza)
      if (i < valor.length - 1) partes.push(',')
      if (i > 0 && i % 80 === 0) await ceder()
    }
    partes.push(']')
    return unirCediendo(partes)
  }

  const claves = Object.keys(valor)
  const partes = ['{']
  let escritos = 0
  for (let i = 0; i < claves.length; i++) {
    const clave = claves[i]
    const crudo = valor[clave]
    if (typeof crudo === 'function' || typeof crudo === 'symbol' || crudo === undefined) continue
    const cuerpo = esMapaGrande(crudo)
      ? await stringifyPorPartes(crudo)
      : JSON.stringify(crudo)
    if (cuerpo === undefined) continue
    if (escritos) partes.push(',')
    partes.push(JSON.stringify(clave), ':', cuerpo)
    escritos++
    if (escritos % 40 === 0) await ceder()
  }
  partes.push('}')
  return unirCediendo(partes)
}

/**
 * Igual que el JSON de lowdb, sin sangría.
 * El contador de spam no se guarda: se arma de nuevo en memoria y no infla el archivo.
 */
export class ArchivoJsonCompacto {
  constructor(filename) {
    this.filename = filename
    this.writer = new Writer(filename)
  }

  async read() {
    try {
      const data = await fs.promises.readFile(this.filename, 'utf8')
      return JSON.parse(data)
    } catch (e) {
      if (e?.code === 'ENOENT') return null
      throw e
    }
  }

  async write(obj) {
    if (obj == null) return
    const { spamCount, ...resto } = obj
    const texto = await stringifyPorPartes(resto)
    return this.writer.write(texto)
  }
}
