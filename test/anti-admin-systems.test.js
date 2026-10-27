import test from 'node:test'
import assert from 'node:assert/strict'
import { manejarAntiLink } from '../lib/Antis/anti-link.js'
import { manejarAntiContacto } from '../lib/Antis/anti-contact.js'
import { manejarAntiMencion } from '../lib/Antis/anti-mention.js'
import { manejarAntiCaracter } from '../lib/Antis/anti-caracter.js'
import { manejarAntiSpam } from '../lib/Antis/anti-spam.js'
import { manejarAntiEstados } from '../lib/Antis/anti-estados.js'
import { manejarAntiPalabra } from '../lib/Antis/anti-palabra.js'
import { manejarAntiBot } from '../lib/Antis/anti-bot.js'
import { manejarAntiMedia } from '../lib/Antis/anti-media-utils.js'
import { ejecutarAntiVerUnaVez } from '../lib/viewOnce.js'
import { manejarSistemasAnti, manejarAntiMediaTemprano } from '../lib/antiHandlers.js'
import { expulsarParticipanteUnaVez } from '../lib/Antis/anti-aviso.js'

const PN = '5211111111111@s.whatsapp.net'
const LID = '777777777777@lid'
const BOT = '5299999999999@s.whatsapp.net'
const canal = { contextInfo: {} }
let numero = 0

async function escenario(admin, fn) {
  const previo = { db: global.db, conn: global.conn, conns: global.conns, prefix: global.prefix, rcanal: global.rcanal, owner: global.owner, ownerLid: global.ownerLid }
  const chat = `antis-${++numero}@g.us`
  const mensajes = []
  const expulsados = []
  const parts = [{ id: PN, admin }, { id: BOT, admin: true }]
  let consultas = 0
  const conn = {
    user: { id: BOT, jid: BOT }, decodeJid: j => j,
    chats: { [chat]: { metadata: { participants: [{ id: PN, admin: null }, { id: BOT, admin: 'admin' }] } } },
    groupMetadata: async () => { consultas++; return { participants: parts } },
    signalRepository: { lidMapping: { getPNForLID: async id => id === LID ? PN : null, getLIDForPN: async id => id === PN ? LID : null } },
    sendMessage: async (chat, content) => { mensajes.push(content); return { key: { id: 'respuesta' } } },
    groupParticipantsUpdate: async (chat, ids) => { expulsados.push(...ids); return ids.map(jid => ({ jid, status: '200' })) },
  }
  const m = (extra = {}) => ({ sender: LID, chat, isGroup: true, fromMe: false, text: 'mensaje de prueba', key: { id: `key-${++numero}`, remoteJid: chat, participant: LID }, ...extra })
  const data = { users: {}, chats: { [chat]: {} } }
  for (const key of ['antiLink', 'antiSpam', 'antiContact', 'antiMention', 'antiImg', 'antiSticker', 'antiAudio', 'antiVideo', 'antiDocument', 'antiEstados', 'antiBot']) data[key] = { [chat]: 'all' }
  data.antiCaracter = { [chat]: { enabled: true, mode: 'all', limit: 5 } }
  data.antiPalabra = { [chat]: { enabled: true, words: ['prohibida'], action: 'kick' } }
  data.antiViewOnce = { [chat]: true }
  try {
    global.db = { data, write: async () => {} }
    global.conn = conn
    global.conns = []
    global.prefix = ['.', '/']
    global.rcanal = canal
    global.owner = []
    global.ownerLid = []
    await fn({ conn, m, chat, mensajes, expulsados, parts, consultas: () => consultas })
  } finally { Object.assign(global, previo) }
}

const casos = [
  ['antilink', ({ m, conn }) => manejarAntiLink(m({ text: 'visita https://example.com' }), conn, false, canal)],
  ['anticontacto', ({ m, conn }) => manejarAntiContacto(m({ message: { contactMessage: { displayName: 'Contacto', vcard: '' } } }), conn, false)],
  ['antimención', ({ m, conn }) => manejarAntiMencion(m({ message: { extendedTextMessage: { contextInfo: { mentionedJid: [BOT] } } } }), conn, false, canal)],
  ['anticaracter', ({ m, conn }) => manejarAntiCaracter(m(), conn, false, canal)],
  ['antiestados', ({ m, conn }) => manejarAntiEstados(m({ mtype: 'groupStatusMentionMessage' }), conn, false)],
  ['antipalabra', ({ m, conn }) => manejarAntiPalabra(m({ text: 'una palabra prohibida' }), conn, false, canal)],
  ['antispam', async ({ m, conn }) => { for (let i = 0; i < 4; i++) await manejarAntiSpam(m(), conn, false, canal) }],
  ['antibot', ({ m, conn }) => manejarAntiBot(m({ mtype: 'buttonsMessage', message: { buttonsMessage: { contentText: 'Bot ajeno' } } }), conn, false, canal)],
  ['antiverunavez', ({ m, conn }) => ejecutarAntiVerUnaVez(conn, m({ message: { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true } } } } }))],
  ...[['antiImg', 'imageMessage'], ['antiSticker', 'stickerMessage'], ['antiVideo', 'videoMessage'], ['antiAudio', 'audioMessage'], ['antiDocument', 'documentMessage']].map(([dbKey, tipo]) => [
    dbKey, ({ m, conn, parts }) => manejarAntiMedia(m({ mtype: tipo, message: { [tipo]: {} } }), conn, false, { dbKey, tipos: [tipo], participants: parts }),
  ]),
]

for (const [nombre, ejecutar] of casos) {
  test(`${nombre}: no borra ni expulsa a un administrador enviado como LID`, async () => escenario(true, async ctx => {
    await ejecutar(ctx)
    assert.equal(ctx.mensajes.filter(x => x.delete).length, 0)
    assert.equal(ctx.expulsados.length, 0)
  }))
  test(`${nombre}: sigue sancionando la misma infracción de un miembro normal`, async () => escenario(null, async ctx => {
    await ejecutar(ctx)
    assert.ok(ctx.mensajes.some(x => x.delete), 'la infracción de un miembro normal debe seguir eliminándose')
    if (nombre !== 'antiverunavez') assert.deepEqual(ctx.expulsados, [PN], 'el modo all conserva la expulsión de miembros normales')
  }))
}

test('los coordinadores temprano y general comparten la verificación y protegen al administrador', async () => escenario('admin', async ctx => {
  const mensaje = ctx.m({ mtype: 'imageMessage', text: 'prohibida https://example.com', message: { imageMessage: {} } })
  await manejarAntiMediaTemprano(mensaje, ctx.conn, false, ctx.parts)
  await manejarSistemasAnti(mensaje, ctx.conn, false, false, false, true, false, false, ctx.parts)
  assert.equal(ctx.mensajes.filter(x => x.delete).length, 0)
  assert.equal(ctx.expulsados.length, 0)
  assert.equal(ctx.consultas(), 1)
}))

test('antilink no confía en un isAdmin=true antiguo para un miembro actualmente normal', async () => escenario(null, async ctx => {
  await manejarAntiLink(ctx.m({ text: 'https://example.com' }), ctx.conn, true, canal)
  assert.ok(ctx.mensajes.some(x => x.delete))
}))

test('la última comprobación de expulsión protege a un usuario que ya es administrador', async () => escenario('superadmin', async ctx => {
  assert.equal(await expulsarParticipanteUnaVez(ctx.conn, ctx.chat, LID), false)
  assert.equal(ctx.expulsados.length, 0)
}))

test('los coordinadores no eliminan ni expulsan a ciegas si falla la metadata', async () => escenario(null, async ctx => {
  ctx.conn.groupMetadata = async () => { throw new Error('WhatsApp no disponible') }
  const mensaje = ctx.m({ mtype: 'imageMessage', text: 'prohibida https://example.com', message: { imageMessage: {} } })
  await manejarAntiMediaTemprano(mensaje, ctx.conn, false, ctx.parts)
  await manejarSistemasAnti(mensaje, ctx.conn, false, false, false, true, false, false, ctx.parts)
  assert.equal(ctx.mensajes.filter(x => x.delete).length, 0)
  assert.equal(ctx.expulsados.length, 0)
}))
