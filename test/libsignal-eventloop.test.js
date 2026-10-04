import test from 'node:test'
import assert from 'node:assert/strict'
import { yieldBetweenSignalDecryptAttempts } from '../lib/libsignal-eventloop.js'

test('yields between failed Signal session decryptions', async () => {
  const events = []
  class FakeSessionCipher {
    async decryptWithSessions(_data, sessions) {
      for (const session of sessions) {
        try {
          return await this.doDecryptWhisperMessage(session)
        } catch {}
      }
      throw new Error('no matching sessions')
    }

    async doDecryptWhisperMessage(session) {
      events.push(`attempt-${session}`)
      if (session < 3) throw new Error('stale session')
      return 'decrypted'
    }
  }

  assert.equal(yieldBetweenSignalDecryptAttempts(FakeSessionCipher), true)
  setImmediate(() => events.push('event-loop'))

  const result = await new FakeSessionCipher().decryptWithSessions(null, [1, 2, 3])
  assert.equal(result, 'decrypted')
  assert.deepEqual(events, ['attempt-1', 'event-loop', 'attempt-2', 'attempt-3'])
  assert.equal(yieldBetweenSignalDecryptAttempts(FakeSessionCipher), false)
})

test('preserves the fast path when a Signal address has one session', async () => {
  const events = []
  class SingleSessionCipher {
    async decryptWithSessions(_data, sessions) {
      for (const session of sessions) {
        return this.doDecryptWhisperMessage(session)
      }
    }

    async doDecryptWhisperMessage(session) {
      events.push(`attempt-${session}`)
      return 'decrypted'
    }
  }

  yieldBetweenSignalDecryptAttempts(SingleSessionCipher)
  setImmediate(() => events.push('event-loop'))
  const result = await new SingleSessionCipher().decryptWithSessions(null, [1])
  assert.equal(result, 'decrypted')
  assert.deepEqual(events, ['attempt-1'])
})
