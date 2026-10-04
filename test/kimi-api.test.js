import test from 'node:test'
import assert from 'node:assert/strict'
import { buildKimiApiUrl, extractKimiResult, formatKimiPrompt } from '../lib/kimi-api.js'

test('builds the Kimi route from the global Qasim API base URL', () => {
  const url = buildKimiApiUrl({
    url: 'https://api.qasimdev.dpdns.org',
    key: 'test-key'
  }, '/api/kimi/ai', 'Eres Kimi. ¿Quién eres?')

  assert.equal(url.origin, 'https://api.qasimdev.dpdns.org')
  assert.equal(url.pathname, '/api/kimi/ai')
  assert.equal(url.searchParams.get('prompt'), 'Eres Kimi. ¿Quién eres?')
  assert.equal(url.searchParams.get('apiKey'), 'test-key')
})

test('requires the configured Qasim API key', () => {
  assert.throws(
    () => buildKimiApiUrl({ url: 'https://api.qasimdev.dpdns.org' }, '/api/kimi/ai', 'Hola'),
    /API de Kimi no está configurada/
  )
})

test('instructs the API to identify itself as Kimi', () => {
  const prompt = formatKimiPrompt('¿Quién eres?')

  assert.match(prompt, /Eres Kimi/)
  assert.match(prompt, /responde que eres Kimi/)
  assert.match(prompt, /¿Quién eres\?/)
})

test('extracts only successful string results', () => {
  assert.equal(extractKimiResult({ success: true, data: { result: ' respuesta ' } }), 'respuesta')
  assert.equal(extractKimiResult({ success: false, data: { result: 'no' } }), '')
  assert.equal(extractKimiResult({ success: true, data: { result: null } }), '')
})
