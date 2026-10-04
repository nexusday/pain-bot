import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buscarParticipanteBotActual,
  esRolAdministrador,
  identidadesJidBot
} from '../lib/group-participant.js'

test('resolves the bot participant through its LID-to-phone mapping', async () => {
  const conn = {
    user: { lid: '987654321@lid' },
    decodeJid: jid => jid,
    signalRepository: {
      lidMapping: {
        getPNForLID: async jid => jid === '987654321@lid' ? '5215551234567@s.whatsapp.net' : null
      }
    }
  }
  const participants = [
    { id: '5215551234567@s.whatsapp.net', admin: 'admin' },
    { id: '5215557654321@s.whatsapp.net', admin: null }
  ]

  const bot = await buscarParticipanteBotActual(conn, participants)
  assert.equal(bot, participants[0])
  assert.equal(esRolAdministrador(bot?.admin), true)
  assert.deepEqual(identidadesJidBot(conn), ['987654321@lid'])
})

test('recognizes supported admin role values without accepting missing roles', () => {
  assert.equal(esRolAdministrador('admin'), true)
  assert.equal(esRolAdministrador('superadmin'), true)
  assert.equal(esRolAdministrador(true), true)
  assert.equal(esRolAdministrador(null), false)
  assert.equal(esRolAdministrador(false), false)
})
