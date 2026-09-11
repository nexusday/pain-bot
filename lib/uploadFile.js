import fetch from 'node-fetch'
import { FormData, Blob } from 'formdata-node'
import { fileTypeFromBuffer } from 'file-type'

const subirFileIO = async buffer => {
  const { ext, mime } = await fileTypeFromBuffer(buffer) || {}
  let formulario = new FormData()
  const blob = new Blob([buffer.toArrayBuffer()], { type: mime })
  formulario.append('file', blob, 'tmp.' + ext)
  let res = await fetch('https://file.io/?expires=1d', {
    method: 'POST',
    body: formulario
  })
  let json = await res.json()
  if (!json.success) throw json
  return json.link
}

const subirRESTfulAPI = async entrada => {
  let formulario = new FormData()
  let buffers = entrada
  if (!Array.isArray(entrada)) buffers = [entrada]
  for (let buffer of buffers) {
    const blob = new Blob([buffer.toArrayBuffer()])
    formulario.append('file', blob)
  }
  let res = await fetch('https://storage.restfulapi.my.id/upload', {
    method: 'POST',
    body: formulario
  })
  let json = await res.text()
  try {
    json = JSON.parse(json)
    if (!Array.isArray(entrada)) return json.files[0].url
    return json.files.map(r => r.url)
  } catch (e) {
    throw json
  }
}

async function subirArchivo(entrada) {
  let err = false
  for (let subir of [subirRESTfulAPI, subirFileIO]) {
    try {
      return await subir(entrada)
    } catch (e) {
      err = e
    }
  }
  if (err) throw err
}

export default subirArchivo
export { subirArchivo as uploadFile, subirArchivo }
