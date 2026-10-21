import assert from 'node:assert/strict'
import test from 'node:test'
import { sendOwnWelcomeMessage } from '../plugins/serbot-serbot.js'

test('subbot: al vincularse desde el panel se escribe a su propio chat', async () => {
  const enviados = []
  const sock = {
    user: { jid: '5215512345678@s.whatsapp.net', id: '5215512345678@s.whatsapp.net' },
    phoneNumber: '5215512345678',
    sendMessage: async (destino, contenido) => {
      enviados.push({ destino, texto: String(contenido?.text || '') })
      return { key: {} }
    },
  }

  await sendOwnWelcomeMessage({
    sock,
    nombreBot: 'Pain Bot',
    botNumber: '5215512345678',
    userName: 'paindesk',
    usedPrefix: '.',
  })

  assert.equal(enviados.length, 1)
  // Se escribe a SU propio JID (chat "mensajes para ti mismo").
  assert.equal(enviados[0].destino, '5215512345678@s.whatsapp.net')
  const texto = enviados[0].texto
  assert.match(texto, /ya te vinculaste/)
  assert.match(texto, /Pain Bot/)
  assert.match(texto, /tu sub-bot quedó conectado/)
  assert.match(texto, /\+5215512345678/)
  assert.match(texto, /paindesk/)
  assert.match(texto, /no responde en la comunidad oficial/)
  assert.match(texto, /\.setbotname <nombre>/)
  assert.match(texto, /\.setbotimg/)
  assert.match(texto, /\.setautoread on\/off/)
  assert.match(texto, /\.antipv on\/off/)
  assert.match(texto, /\.setlen es\/in\/pt/)
  assert.match(texto, /\.setmenu ios\/android/)
  assert.match(texto, /\.menu/)
})
