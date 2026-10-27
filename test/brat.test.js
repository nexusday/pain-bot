import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from '../lib/sharp.js'
import { addExif } from '../lib/sticker.js'
import {
  BRAT2_MAX_SEGUNDOS,
  BRAT2_MAX_TEXT,
  BRAT2_MIN_SEGUNDOS,
  ErrorBrat2,
  MAX_TEXT,
  normalizarTextoBrat,
  parsearBrat2,
  planificarReveladoBrat2,
  textoAStickerBrat,
  textoAStickerBrat2
} from '../lib/brat.js'
import brat from '../plugins/stickers-sp.js'
import brat2 from '../plugins/stickers-brat2.js'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('Brat: conserva mayúsculas y minúsculas en el texto', async () => {
  assert.equal(normalizarTextoBrat('  HOLA Mundo  '), 'HOLA Mundo')
  assert.equal(normalizarTextoBrat('linea1\\nlinea2'), 'linea1\nlinea2')
  assert.equal(MAX_TEXT, 320)

  const mayusculas = await textoAStickerBrat('HOLA')
  const minusculas = await textoAStickerBrat('hola')

  assert.equal((await sharp(mayusculas).metadata()).format, 'webp')
  assert.equal((await sharp(minusculas).metadata()).format, 'webp')
  assert.ok(!mayusculas.equals(minusculas), 'HOLA y hola generaron el mismo sticker: el texto se está pasando a minúsculas')
})

test('Brat2: parsea "segundos|texto" y conserva el texto tal cual', () => {
  assert.deepEqual(parsearBrat2(' 4 | HOLA Mundo '), { segundos: 4, texto: 'HOLA Mundo' })
  assert.deepEqual(parsearBrat2('10|a|b'), { segundos: 10, texto: 'a|b' })
  assert.deepEqual(parsearBrat2('02|  líneas\ncon espacios  '), {
    segundos: 2,
    texto: 'líneas\ncon espacios'
  })
  assert.equal(BRAT2_MIN_SEGUNDOS, 2)
  assert.equal(BRAT2_MAX_SEGUNDOS, 10)
  assert.equal(BRAT2_MAX_TEXT, 200)

  for (const entrada of [
    '',
    'HOLA',
    '|HOLA',
    'abc|HOLA',
    '2.5|HOLA',
    '1|HOLA',
    '11|HOLA',
    '4|',
    '4|   ',
    `4|${'a'.repeat(BRAT2_MAX_TEXT + 1)}`
  ]) {
    assert.throws(() => parsearBrat2(entrada), ErrorBrat2, `debía rechazar: ${entrada}`)
  }

  assert.equal(parsearBrat2(`4|${'a'.repeat(BRAT2_MAX_TEXT)}`).segundos, 4)
})

test('Brat2: planifica fotogramas, duración exacta y revelado progresivo', () => {
  const plan = planificarReveladoBrat2(4, 20)

  assert.equal(plan.frames, 48)
  assert.equal(plan.delays.length, plan.frames)
  assert.equal(plan.delays.reduce((a, b) => a + b, 0), 4000)
  assert.ok(plan.delays.every(delay => delay > 0))
  assert.equal(plan.pasos.length, plan.frames)
  assert.equal(plan.pasos[0], 0)
  assert.equal(plan.pasos.at(-1), 20)
  assert.ok(plan.reveladoMs < plan.duracionMs)

  for (let i = 1; i < plan.pasos.length; i++) {
    assert.ok(plan.pasos[i] >= plan.pasos[i - 1], 'el revelado nunca debe retroceder')
  }

  assert.ok(plan.pasos.filter(visibles => visibles === 20).length > 0, 'debe mantener el texto completo')

  const largo = planificarReveladoBrat2(10, 200)
  assert.equal(largo.frames, 96)
  assert.equal(largo.delays.reduce((a, b) => a + b, 0), 10000)
  assert.equal(largo.pasos.at(-1), 200)
})

test('Brat2: genera un WebP animado con duración y EXIF intactos', async () => {
  const segundos = 2
  const webp = await textoAStickerBrat2('Hola BRAT', segundos)
  const meta = await sharp(webp, { animated: true }).metadata()
  const plan = planificarReveladoBrat2(segundos, 'HolaBRAT'.length)

  assert.equal(meta.format, 'webp')
  assert.equal(meta.width, 512)
  assert.equal(meta.pageHeight, 512)
  assert.ok(meta.pages > 1 && meta.pages <= plan.frames)
  assert.equal(meta.delay.length, meta.pages)
  assert.equal(meta.loop, 0)
  assert.equal(meta.delay.reduce((a, b) => a + b, 0), segundos * 1000)
  assert.ok(meta.delay.every(delay => delay > 0))
  assert.ok(webp.length <= 1000 * 1024)

  const conExif = await addExif(webp, 'Pain-Bot', 'tests')
  const metaExif = await sharp(conExif, { animated: true }).metadata()
  assert.equal(metaExif.pages, meta.pages)
  assert.deepEqual(metaExif.delay, meta.delay)
})

test('Brat2: valida la duración y el tamaño también en el generador', async () => {
  await assert.rejects(() => textoAStickerBrat2('HOLA', 1), ErrorBrat2)
  await assert.rejects(() => textoAStickerBrat2('HOLA', 11), ErrorBrat2)
  await assert.rejects(() => textoAStickerBrat2('HOLA', 2.5), ErrorBrat2)
  await assert.rejects(() => textoAStickerBrat2('   ', 4), ErrorBrat2)
  await assert.rejects(
    () => textoAStickerBrat2('a'.repeat(BRAT2_MAX_TEXT + 1), 4),
    ErrorBrat2
  )
})

test('/brat conserva sus alias y /brat2 queda registrado en menú y ayuda', () => {
  assert.deepEqual(brat.command, ['brat', 'sp', 'stickerplain', 'memetext', 'bratgen'])
  assert.deepEqual(brat2.command, ['brat2'])
  assert.deepEqual(brat2.tags, ['stickers'])
  assert.match(brat2.help[0], /brat2/)
  assert.match(brat2.help[0], /animado/)

  const menu = fs.readFileSync(path.join(raiz, 'lib/menu-categories.js'), 'utf8')
  assert.match(menu, /brat2 <segundos>\|<texto>/)
})

test('/brat2: responde con ayuda y validación sin intentar enviar un sticker', async () => {
  const respuestas = []
  const conn = {
    reply: async (chat, texto) => respuestas.push({ chat, texto }),
    sendFile: async () => {
      throw new Error('no debía generar un sticker para una entrada inválida')
    }
  }
  const m = { chat: 'chat@s.whatsapp.net', quoted: null }

  await brat2(m, { conn, args: [], usedPrefix: '/', command: 'brat2' })
  assert.match(respuestas.at(-1).texto, /segundos\|texto/)

  await brat2(m, { conn, args: ['1|HOLA'], usedPrefix: '/', command: 'brat2' })
  assert.match(respuestas.at(-1).texto, /entre 2 y 10/)

  await brat2(m, { conn, args: ['4|'], usedPrefix: '/', command: 'brat2' })
  assert.match(respuestas.at(-1).texto, /Falta el texto/)
})
