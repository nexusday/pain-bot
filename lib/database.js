import { resolve, dirname as _dirname } from 'path'
import _fs, { existsSync, readFileSync } from 'fs'
const { promises: fs } = _fs

class BaseDeDatos {
    constructor(rutaArchivo, ...args) {
        this.file = resolve(rutaArchivo)
        this.logger = console
        
        this._cargar()

        this._jsonargs = args
        this._estado = false
        this._cola = []
        this._intervalo = setInterval(async () => {
          if (!this._estado && this._cola && this._cola[0]) {
            this._estado = true
            await this[this._cola.shift()]().catch(this.logger.error)
            this._estado = false
          }
        }, 1000)
        
    }

    get data() {
        return this._data
    }

    set data(valor) {
        this._data = valor
        this.guardar()
    }

    cargar() {
        this._cola.push('_cargar')
    }

    guardar() {
        this._cola.push('_guardar')
    }

    _cargar() {
        try {
          return this._data = existsSync(this.file) ? JSON.parse(readFileSync(this.file)) : {}
        } catch (e) {
          this.logger.error(e)
          return this._data = {}
        }
    }

    async _guardar() {
        let dirname = _dirname(this.file)
        if (!existsSync(dirname)) await fs.mkdir(dirname, { recursive: true })
        await fs.writeFile(this.file, JSON.stringify(this._data, ...this._jsonargs))
        return this.file
    }
}

// Alias de métodos públicos en inglés
BaseDeDatos.prototype.load = BaseDeDatos.prototype.cargar
BaseDeDatos.prototype.save = BaseDeDatos.prototype.guardar

export { BaseDeDatos as Database }
export default BaseDeDatos
