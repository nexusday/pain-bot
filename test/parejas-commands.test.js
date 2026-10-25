import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ArchivoSqliteCompartido } from '../lib/db-sqlite.js'
import pareja from '../plugins/pareja-union.js'
import topcoins from '../plugins/top-coins.js'
import topharem from '../plugins/rpg-char-topharem.js'
import { DIA_PAREJA } from '../lib/parejas.js'

test('comandos: propuesta, respuesta de la pareja, tops combinados, diario y separación', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pain-pareja-comandos-'))
  const prev = { db: global.db, rcanal: global.rcanal, moneda: global.moneda }
  const A = '5211111111111@s.whatsapp.net'
  const B = '5222222222222@s.whatsapp.net'
  const LA = '777777777777@lid'
  const LB = '888888888888@lid'
  const CHAT = 'prueba@g.us'
  const participants = [{ id: LA }, { id: LB }]
  const enviados = []
  const conn = {
    decodeJid: j => j,
    signalRepository: { lidMapping: {
      getPNForLID: async j => ({ [LA]: A, [LB]: B })[j],
      getLIDForPN: async j => ({ [A]: LA, [B]: LB })[j],
    } },
    sendMessage: async (chat, content) => { enviados.push(content); return { key: { id: 'enviado' } } },
  }
  const m = (sender, text = '') => ({ sender, chat: CHAT, isGroup: true, text, key: { id: String(enviados.length) } })
  const contexto = command => ({ conn, participants, command, usedPrefix: '/', args: [] })
  let adapter
  try {
    const chars = cantidad => [{ id: 'local:987654321', name: 'Personaje de prueba', qty: cantidad, price: 100 }]
    const inicial = { users: {
      [A]: { name: 'Ana', partner: B, marriedAt: Date.now() - 2 * DIA_PAREJA, coins: 100, bancoDinero: 20, characters: chars(1) },
      [B]: { name: 'Bruno', partner: A, marriedAt: Date.now() - 2 * DIA_PAREJA, coins: 200, bancoDinero: 30, characters: chars(2) },
    }, chats: { [CHAT]: {} } }
    const legado = path.join(dir, 'datos.json')
    await fs.writeFile(legado, JSON.stringify(inicial))
    adapter = new ArchivoSqliteCompartido(path.join(dir, 'datos.sqlite'), legado)
    global.db = { adapter, data: await adapter.read() }
    global.rcanal = { contextInfo: {} }
    global.moneda = 'monedas'

    await pareja(m(LA), contexto('unip'))
    assert.match(enviados.at(-1).text, /Propuesta de unión/)
    assert.match(enviados.at(-1).text, /No se mezcla el dinero/)
    await pareja.all(m(A, 'si'), { conn, participants })
    assert.equal(enviados.length, 1, 'el proponente no puede aceptar por sí mismo')
    await pareja.all(m(LB, 'sí'), { conn, participants })
    assert.match(enviados.at(-1).text, /activada/)

    await topcoins(m(A), contexto('topcoins'))
    assert.match(enviados.at(-1).text, /Pareja: Ana y Bruno/)
    assert.match(enviados.at(-1).text, /350/)
    assert.equal(global.db.data.users[A].coins, 100)
    assert.equal(global.db.data.users[B].coins, 200)

    // La consulta desde otro grupo, sin ninguno de los cónyuges presente,
    // mantiene la misma suma global. Lo mismo ocurre por privado.
    await topcoins({ ...m(A), chat: 'otro@g.us' }, { ...contexto('topcoins'), participants: [] })
    assert.match(enviados.at(-1).text, /Pareja: Ana y Bruno/)
    await topcoins({ ...m(A), chat: A, isGroup: false }, { ...contexto('topcoins'), participants: [] })
    assert.match(enviados.at(-1).text, /Pareja: Ana y Bruno/)

    await topharem(m(A), contexto('topharem'))
    assert.match(enviados.at(-1).text, /Pareja:/)
    assert.match(enviados.at(-1).text, /tipos.*`1`/)
    assert.match(enviados.at(-1).text, /unidades.*`3`/)
    assert.equal(global.db.data.users[A].characters[0].qty, 1)
    assert.equal(global.db.data.users[B].characters[0].qty, 2)
    await topharem({ ...m(A), chat: 'otro@g.us' }, { ...contexto('topharem'), participants: [] })
    assert.match(enviados.at(-1).text, /Pareja:/)

    await pareja(m(LA), contexto('dma'))
    assert.match(enviados.at(-1).text, /para cada uno/)
    assert.equal(global.db.data.users[A].coins, 2100)
    assert.equal(global.db.data.users[B].coins, 2200)
    await pareja(m(LB), contexto('dma'))
    assert.match(enviados.at(-1).text, /siguiente premio/)
    assert.equal(global.db.data.users[B].coins, 2200)

    await pareja(m(A), contexto('pareja'))
    assert.match(enviados.at(-1).text, /Nuestra pareja/)
    await pareja({ ...m(B), chat: 'otro@g.us' }, { ...contexto('unip'), participants: [{ id: B }], args: ['off'] })
    assert.match(enviados.at(-1).text, /desactivada/)
    await topcoins(m(A), contexto('topcoins'))
    assert.doesNotMatch(enviados.at(-1).text, /Pareja: Ana y Bruno/)
    const guardado = await adapter.read()
    assert.equal(guardado.users[A].coins, 2100)
    assert.equal(guardado.users[B].coins, 2200)
  } finally {
    global.db = prev.db
    global.rcanal = prev.rcanal
    global.moneda = prev.moneda
    await adapter?.close?.()
    await fs.rm(dir, { recursive: true, force: true })
  }
})
