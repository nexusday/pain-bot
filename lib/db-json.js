import fs from 'fs'
import { Writer } from 'steno'

function ceder() {
  return new Promise((resolve) => setImmediate(resolve))
}

async function unirCediendo(partes) {
  let lista = partes
  while (lista.length > 1) {
    const siguiente = []
    for (let i = 0; i < lista.length; i += 24) {
      siguiente.push(lista.slice(i, i + 24).join(''))
      if (siguiente.length % 4 === 0) await ceder()
    }
    lista = siguiente
  }
  return lista[0] || ''
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

  const partes = ['{']
  let escritos = 0
  let desdeCeder = 0
  for (const clave in valor) {
    if (!Object.prototype.hasOwnProperty.call(valor, clave)) continue
    const crudo = valor[clave]
    if (typeof crudo === 'function' || typeof crudo === 'symbol' || crudo === undefined) continue
    const cuerpo = esMapaGrande(crudo)
      ? await stringifyPorPartes(crudo)
      : JSON.stringify(crudo)
    if (cuerpo === undefined) continue
    if (escritos) partes.push(',')
    partes.push(JSON.stringify(clave), ':', cuerpo)
    escritos++
    desdeCeder++
    if (desdeCeder >= 20) {
      desdeCeder = 0
      await ceder()
    }
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
