import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTextEffectUrl,
  buildTextproUrl,
  extractImageUrl,
  extractTextproImage
} from '../lib/textpro-api.js'

test('builds the Textpro route using the global Qasim API base and both text parts', () => {
  const url = buildTextproUrl({
    url: 'https://api.qasimdev.dpdns.org',
    key: 'test-key'
  }, '/api/textpro/pornhubStyle', 'Hola', 'XD')

  assert.equal(url.origin, 'https://api.qasimdev.dpdns.org')
  assert.equal(url.pathname, '/api/textpro/pornhubStyle')
  assert.equal(url.searchParams.get('apiKey'), 'test-key')
  assert.equal(url.searchParams.get('text1'), 'Hola')
  assert.equal(url.searchParams.get('text2'), 'XD')
})

test('requires the global API configuration', () => {
  assert.throws(
    () => buildTextproUrl({ url: 'https://example.com' }, '/api/textpro/pornhubStyle', 'A', 'B'),
    /API global de Qasim/
  )
})

test('extracts the Photooxy response image without requiring a status field', () => {
  assert.equal(extractImageUrl({
    success: true,
    data: { image_url: 'https://e2.yotools.net/images/result.jpg' }
  }), 'https://e2.yotools.net/images/result.jpg')
  assert.equal(extractImageUrl({
    success: true,
    data: { image_url: 'javascript:alert(1)' }
  }), '')
  assert.equal(extractImageUrl({ success: false, data: { image_url: 'https://example.com/a.jpg' } }), '')
})

test('keeps the Textpro helper compatible with the shared text effect URL builder', () => {
  const args = [{ url: 'https://api.example.com', key: 'key' }, '/text', 'one', 'two']
  assert.equal(buildTextproUrl(...args).href, buildTextEffectUrl(...args).href)
})

test('accepts only successful HTTP(S) image URLs', () => {
  assert.equal(extractTextproImage({
    success: true,
    data: { status: true, image_url: 'https://example.com/result.jpg' }
  }), 'https://example.com/result.jpg')
  assert.equal(extractTextproImage({
    success: true,
    data: { status: false, image_url: 'https://example.com/result.jpg' }
  }), '')
  assert.equal(extractTextproImage({
    success: true,
    data: { status: true, image_url: 'javascript:alert(1)' }
  }), '')
})
