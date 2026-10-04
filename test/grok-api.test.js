import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGrokApiUrl, extractGrokResult, formatGrokPrompt } from '../lib/grok-api.js'

test('builds the Grok route from the global Qasim API base URL', () => {
  const url = buildGrokApiUrl({
    url: 'https://api.qasimdev.dpdns.org',
    key: 'test-key'
  }, '/api/groq/ai', '¿Qué es Grok?')

  assert.equal(url.origin, 'https://api.qasimdev.dpdns.org')
  assert.equal(url.pathname, '/api/groq/ai')
  assert.equal(url.searchParams.get('text'), '¿Qué es Grok?')
  assert.equal(url.searchParams.get('apiKey'), 'test-key')
})

test('requires an API key without disclosing it', () => {
  assert.throws(
    () => buildGrokApiUrl({ url: 'https://example.com' }, '/api/groq/ai', 'hola'),
    /Define QASIM_API_KEY/
  )
})

test('instructs the API to identify itself as Grok', () => {
  const prompt = formatGrokPrompt('¿Quién eres?')

  assert.match(prompt, /Eres Grok/)
  assert.match(prompt, /responde que eres Grok/)
  assert.match(prompt, /¿Quién eres\?/)
})

test('extracts only successful string results', () => {
  assert.equal(extractGrokResult({
    success: true,
    data: { result: '  respuesta  ' }
  }), 'respuesta')
  assert.equal(extractGrokResult({ success: false, data: { result: 'no' } }), '')
  assert.equal(extractGrokResult({ success: true, data: { result: null } }), '')
})
