import test from 'node:test'
import assert from 'node:assert/strict'
import { conSocketEstable, ignorarJidInutil } from '../lib/socket-estable.js'

test('descarta estados y canales pero no chats ni grupos', () => {
  assert.equal(ignorarJidInutil('status@broadcast'), true)
  assert.equal(ignorarJidInutil('120363409634472801@newsletter'), true)
  assert.equal(ignorarJidInutil('120363429031140094@g.us'), false)
  assert.equal(ignorarJidInutil('51999999999@s.whatsapp.net'), false)
  assert.equal(conSocketEstable().shouldIgnoreJid, ignorarJidInutil)
})
