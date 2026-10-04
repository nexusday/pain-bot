import test from 'node:test'
import assert from 'node:assert/strict'
import { buildQwenApiUrl, extractQwenResult, formatQwenPrompt } from '../lib/qwen-api.js'

test('builds the Qwen route from the global Qasim API base URL', () => {
  const url = buildQwenApiUrl({
    url: 'https://api.qasimdev.dpdns.org',
    key: 'test-key',
    openRouterKey: 'openrouter-test-key'
  }, '/api/openrouter/qwen', '¿Quién eres?')

  assert.equal(url.pathname, '/api/openrouter/qwen')
  assert.equal(url.searchParams.get('prompt'), '¿Quién eres?')
  assert.equal(url.searchParams.get('apiKey'), 'test-key')
  assert.equal(url.searchParams.get('temperature'), '0.2')
  assert.equal(url.searchParams.get('maxTokens'), '300')
  assert.equal(url.searchParams.get('openRouterKey'), 'openrouter-test-key')
})

test('omits the optional OpenRouter key when it is not configured', () => {
  const url = buildQwenApiUrl({
    url: 'https://example.com/qwen',
    key: 'test-key'
  }, '/api/openrouter/qwen', 'Hola')

  assert.equal(url.searchParams.has('openRouterKey'), false)
})

test('requires the Qasim API key without disclosing it', () => {
  assert.throws(
    () => buildQwenApiUrl({ url: 'https://example.com' }, '/api/openrouter/qwen', 'Hola'),
    /Define QASIM_API_KEY/
  )
})

test('instructs Qwen to identify itself as Qwen', () => {
  const prompt = formatQwenPrompt('¿Quién eres?')

  assert.match(prompt, /Eres Qwen/)
  assert.match(prompt, /responde que eres Qwen/)
  assert.match(prompt, /¿Quién eres\?/)
})

test('extracts only successful string results', () => {
  assert.equal(extractQwenResult({ success: true, data: { result: ' respuesta ' } }), 'respuesta')
  assert.equal(extractQwenResult({ success: false, data: { result: 'no' } }), '')
  assert.equal(extractQwenResult({ success: true, data: { result: null } }), '')
})
