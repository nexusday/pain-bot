import assert from 'node:assert/strict'
import test from 'node:test'
import { buscarParticipanteBotActual, esRolAdministrador } from '../lib/group-participant.js'

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

  assert.equal(await buscarParticipanteBotActual(conn, participants), participants[0])
})

test('recognizes supported admin role values without accepting missing roles', () => {
  assert.equal(esRolAdministrador('admin'), true)
  assert.equal(esRolAdministrador('superadmin'), true)
  assert.equal(esRolAdministrador(true), true)
  assert.equal(esRolAdministrador(null), false)
  assert.equal(esRolAdministrador(false), false)
})
