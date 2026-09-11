import mongoose from 'mongoose'

const { Schema, connect, model: _model } = mongoose
const opcionesPorDefecto = { useNewUrlParser: true, useUnifiedTopology: true }

export class mongoDB {
  constructor(url, opciones = opcionesPorDefecto) {

    this.url = url
    this.options = opciones
    this.data = this._data = {}
    this._schema = {}
    this._model = {}
    this.db = connect(this.url, { ...this.options }).catch(console.error)
  }
  async read() {
    this.conn = await this.db
    let esquema = this._schema = new Schema({
      data: {
        type: Object,
        required: true, 
        default: {}
      }
    })
    try { this._model = _model('data', esquema) } catch { this._model = _model('data') }
    this._data = await this._model.findOne({})
    if (!this._data) {
      this.data = {}
      const [_, _data] = await Promise.all([
        this.write(this.data),
        this._model.findOne({})
      ])
      this._data = _data
    } else this.data = this._data.data
    return this.data
  }

  write(datos) {
    return new Promise(async (resolver, rechazar) => {
      if (!datos) return rechazar(datos)
      if (!this._data) return resolver((new this._model({ data: datos })).save())
      this._model.findById(this._data._id, (err, docs) => {
        if (err) return rechazar(err)
        if (!docs.data) docs.data = {}
        docs.data = datos
        this.data = {}
        return docs.save(resolver)
      })
    })
  }
}

export const mongoDBV2 = class MongoDBV2 {
  constructor(url, opciones = opcionesPorDefecto) {
    this.url = url
    this.options = opciones
    this.models = []
    this.data = {}
    this.lists
    this.list
    this.db = connect(this.url, { ...this.options }).catch(console.error)
  }
  async read() {
    this.conn = await this.db
    let esquema = new Schema({
      data: [{
        name: String,
      }]
    })
    try { this.list = _model('lists', esquema) } catch (e) { this.list = _model('lists') }
    this.lists = await this.list.findOne({})
    if (!lists?.data) {
      await this.list.create({ data: [] })
      this.lists = await this.list.findOne({})
    }
    let basura = []
    for (let { name } of this.lists.data) { 
      let coleccion
      try { coleccion = _model(name, new Schema({ data: Array })) } catch (e) {
        console.error(e)
        try { coleccion = _model(name) } catch (e) {
          basura.push(name)
          console.error(e)
        }
      }
      if (coleccion) {
        this.models.push({ name, model: coleccion })
        let datosColeccion = await coleccion.find({})
        this.data[name] = Object.fromEntries(datosColeccion.map(v => v.data))
      }
    }
    try {
      let del = await this.list.findById(this.lists._id)
      del.data = del.data.filter(v => !basura.includes(v.name))
      await del.save()
    } catch (e) {
      console.error(e)
    }

    return this.data
  }
  write(datos) {
    return new Promise(async (resolver, rechazar) => {
      if (!this.lists || !datos) return rechazar(datos || this.lists)
      let colecciones = Object.keys(datos), listDoc = [], indice = 0
      for (let clave of colecciones) {
        if ((indice = this.models.findIndex(v => v.name === clave)) !== -1) {
          let doc = this.models[indice].model
          await doc.deleteMany().catch(console.error) 
          await doc.insertMany(Object.entries(datos[clave]).map(v => ({ data: v })))
          if (doc && clave) listDoc.push({ name: clave })
        } else { 
          let esquema = new Schema({
            data: Array
          })
          let doc
          try {
            doc = _model(clave, esquema)
          } catch (e) {
            console.error(e)
            doc = _model(clave)
          }
          indice = this.models.findIndex(v => v.name === clave)
          this.models[indice === -1 ? this.models.length : indice] = { name: clave, model: doc }
          await doc.insertMany(Object.entries(datos[clave]).map(v => ({ data: v })))
          if (doc && clave) listDoc.push({ name: clave })
        }
      }

      
      this.list.findById(this.lists._id, function (err, doc) {
        if (err) return rechazar(err)
        doc.data = listDoc
        this.data = {}
        return doc.save(resolver)
      })
      return resolver(true)
    })
  }
}
