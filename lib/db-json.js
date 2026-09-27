import fs from 'fs'
import { Writer } from 'steno'

/**
 * Igual que el JSON de lowdb, sin sangría.
 * El guardado cada 30s deja de congelar el proceso de todos los bots.
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

  write(obj) {
    return this.writer.write(JSON.stringify(obj))
  }
}
