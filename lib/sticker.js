import { dirname } from 'path'
import { fileURLToPath } from 'url'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { spawn } from 'child_process'
import fluent_ffmpeg from 'fluent-ffmpeg'
import { ffmpeg } from './converter.js'
import uploadFile from './uploadFile.js'
import { fileTypeFromBuffer } from 'file-type'
import webp from 'node-webpmux'
import fetch from 'node-fetch'

const __dirname = dirname(fileURLToPath(import.meta.url))
const tmp = path.join(__dirname, '../tmp')

function consultaURL(consultas) {
  return new URLSearchParams(Object.entries(consultas))
}

async function lienzo(codigo, tipo = 'png', calidad = 0.92) {
  let res = await fetch('https://nurutomo.herokuapp.com/api/canvas?' + consultaURL({ type: tipo, quality: calidad }), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': codigo.length
    },
    body: codigo
  })
  return await res.buffer()
}

async function sticker1(img, url) {
  url = url ? url : await uploadFile(img)
  let { mime } = url ? { mime: 'image/jpeg' } : await fileTypeFromBuffer(img)
  let sc = `let im = await loadImg('data:${mime};base64,'+(await window.loadToDataURI('${url}')))
c.width = c.height = 512
let max = Math.max(im.width, im.height)
let w = 512 * im.width / max
let h = 512 * im.height / max
ctx.drawImage(im, 256 - w / 2, 256 - h / 2, w, h)`
  return await lienzo(sc, 'webp')
}

function sticker2(img, url) {
  return new Promise(async (resolve, reject) => {
    try {
      if (url) {
        let res = await fetch(url)
        if (res.status !== 200) throw await res.text()
        img = await res.buffer()
      }
      let entrada = path.join(tmp, +new Date + '.jpeg')
      await fs.promises.writeFile(entrada, img)
      let ff = spawn('ffmpeg', [
        '-y', '-i', entrada,
        '-vf', 'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1',
        '-f', 'png', '-'
      ])
      ff.on('error', reject)
      ff.on('close', async () => {
        await fs.promises.unlink(entrada)
      })

      let bufs = []
      const [_spawnprocess, ..._spawnargs] = [...(module.exports.support.gm ? ['gm'] : module.exports.magick ? ['magick'] : []), 'convert', 'png:-', 'webp:-']
      let im = spawn(_spawnprocess, _spawnargs)
      im.on('error', e => conn.reply(m.chat, util.format(e), m))
      im.stdout.on('data', chunk => bufs.push(chunk))
      ff.stdout.pipe(im.stdin)
      im.on('exit', () => {
        resolve(Buffer.concat(bufs))
      })
    } catch (e) {
      reject(e)
    }
  })
}

async function sticker3(img, url, packname, author) {
  url = url ? url : await uploadFile(img)
  let res = await fetch('https://api.xteam.xyz/sticker/wm?' + new URLSearchParams({ url, packname, author }))
  return await res.buffer()
}

async function sticker4(img, url) {
  if (url) {
    let res = await fetch(url)
    if (res.status !== 200) throw await res.text()
    img = await res.buffer()
  }
  return await ffmpeg(img, [
    '-vf', 'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1'
  ], 'jpeg', 'webp')
}

async function sticker5(img, url, packname, author, categories = [''], extra = {}) {
  const { Sticker } = await import('wa-sticker-formatter')
  const metadatosSticker = {
    type: 'default',
    pack: packname,
    author,
    categories,
    ...extra
  }
  return (new Sticker(img ? img : url, metadatosSticker)).toBuffer()
}

function sticker6(img, url) {
  return new Promise(async (resolve, reject) => {
    try {
      if (url) {
        let res = await fetch(url)
        if (res.status !== 200) throw await res.text()
        img = await res.buffer()
      }
      const tipo = await fileTypeFromBuffer(img) || { mime: 'application/octet-stream', ext: 'bin' }
      if (tipo.ext == 'bin') reject(img)
      const archivoTmp = path.join(__dirname, `../tmp/${+new Date()}.${tipo.ext}`)
      const archivoSalida = archivoTmp + '.webp'

      await fs.promises.writeFile(archivoTmp, img)

      let Fffmpeg = /video/i.test(tipo.mime) ? fluent_ffmpeg(archivoTmp).inputFormat(tipo.ext) : fluent_ffmpeg(archivoTmp).input(archivoTmp)
      Fffmpeg
        .on('error', async (err) => {
          console.error(err)
          await fs.promises.unlink(archivoTmp)
          reject(img)
        })
        .on('end', async () => {
          await fs.promises.unlink(archivoTmp)
          resolve(await fs.promises.readFile(archivoSalida))
        })
        .addOutputOptions([
          '-vcodec', 'libwebp',
          '-vf', `scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0,split [a][b];[a] palettegen=reserve_transparent=on:transparency_color=ffffff [p];[b][p] paletteuse`
        ])
        .toFormat('webp')
        .save(archivoSalida)
    } catch (e) {
      reject(e)
    }
  })
}

async function agregarExif(webpSticker, packname, author, categories = [''], extra = {}) {
  const img = new webp.Image()
  const idPaqueteSticker = crypto.randomBytes(32).toString('hex')
  const json = {
    'sticker-pack-id': idPaqueteSticker,
    'sticker-pack-name': packname,
    'sticker-pack-publisher': author,
    'android-app-store-link': 'https://play.google.com/store/apps/details?id=com.marsvard.stickermakerforwhatsapp',
    'ios-app-store-link': 'https://itunes.apple.com/app/sticker-maker-studio/id1443326857',
    'emojis': categories,
    ...extra
  }
  let attrExif = Buffer.from([
    0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x16, 0x00,
    0x00, 0x00
  ])
  let bufferJson = Buffer.from(JSON.stringify(json), 'utf8')
  let exif = Buffer.concat([attrExif, bufferJson])
  exif.writeUIntLE(bufferJson.length, 14, 4)
  await img.load(webpSticker)
  img.exif = exif
  return await img.save(null)
}

async function sticker(img, url, ...args) {
  let ultimoError, stiker
  for (let func of [
    sticker3,
    global.support.ffmpeg && sticker6,
    sticker5,
    global.support.ffmpeg && global.support.ffmpegWebp && sticker4,
    global.support.ffmpeg && (global.support.convert || global.support.magick || global.support.gm) && sticker2,
    sticker1
  ].filter(f => f)) {
    try {
      stiker = await func(img, url, ...args)
      if (stiker.includes('html')) continue
      if (stiker.includes('WEBP')) {
        try {
          return await agregarExif(stiker, ...args)
        } catch (e) {
          console.error(e)
          return stiker
        }
      }
      throw stiker.toString()
    } catch (err) {
      ultimoError = err
      continue
    }
  }
  console.error(ultimoError)
  return ultimoError
}

const soporte = {
  ffmpeg: true,
  ffprobe: true,
  ffmpegWebp: true,
  convert: true,
  magick: false,
  gm: false,
  find: false
}

export {
  sticker,
  sticker1,
  sticker2,
  sticker3,
  sticker4,
  sticker6,
  agregarExif as addExif,
  agregarExif,
  soporte as support,
  soporte
}
