import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { listarSubBotsRegistrados, puedeRegistrarSubBot, establecerMaxSubs } from '../lib/max-subs.js'

test('max-subs: las sesiones muertas (registered:false) no ocupan plazas', () => {
  const anteriorBot = global.bot
  const rutaMax = path.join(process.cwd(), 'storage', 'maxsubs.json')
  const maxAnterior = fs.existsSync(rutaMax) ? fs.readFileSync(rutaMax, 'utf8') : null
  const carpeta = `.test-maxsubs-${process.pid}-${Date.now()}`
  const raiz = path.join(process.cwd(), carpeta)
  try {
    global.bot = carpeta
    fs.mkdirSync(raiz, { recursive: true })
    // Dos vivas y tres muertas.
    for (const [numero, registered] of [
      ['111111111', true],
      ['222222222', true],
      ['333333333', false],
      ['444444444', false],
      ['555555555', false],
    ]) {
      const dir = path.join(raiz, numero)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'creds.json'), JSON.stringify({ registered }), 'utf8')
    }
    const registrados = listarSubBotsRegistrados()
    assert.deepEqual(registrados.sort(), ['111111111', '222222222'])

    establecerMaxSubs(3)
    // Con 2 vivas y max 3, hay hueco; antes las 5 carpetas lo bloqueaban.
    const ranura = puedeRegistrarSubBot('999999999')
    assert.equal(ranura.ok, true)
    assert.equal(ranura.registered, 2)
    assert.equal(ranura.max, 3)
  } finally {
    if (maxAnterior === null) {
      try { fs.rmSync(rutaMax, { force: true }) } catch {}
    } else {
      try { fs.writeFileSync(rutaMax, maxAnterior, 'utf8') } catch {}
    }
    global.bot = anteriorBot
    try { fs.rmSync(raiz, { recursive: true, force: true }) } catch {}
  }
})
