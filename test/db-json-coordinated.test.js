import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { ArchivoJsonCoordinado } from '../lib/db-json.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '.artifacts')

test('rejects a stale process snapshot without overwriting the latest data', async () => {
  const directory = path.join(root, `stale-write-${process.pid}-${Date.now()}`)
  const filename = path.join(directory, 'database.json')

  try {
    const initialWriter = new ArchivoJsonCoordinado(filename)
    assert.equal(await initialWriter.read(), null)
    await initialWriter.write({ users: { alice: { coins: 10 } } })

    const writerA = new ArchivoJsonCoordinado(filename)
    const writerB = new ArchivoJsonCoordinado(filename)
    const snapshotA = await writerA.read()
    const snapshotB = await writerB.read()
    snapshotA.users.alice.coins = 11
    snapshotB.users.alice.coins = 12

    await writerA.write(snapshotA)
    await assert.rejects(writerB.write(snapshotB), { code: 'ERR_DB_STALE_WRITE' })

    assert.deepEqual(JSON.parse(await fs.readFile(filename, 'utf8')), {
      users: { alice: { coins: 11 } },
    })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('does not replace malformed database JSON after a read error', async () => {
  const directory = path.join(root, `malformed-${process.pid}-${Date.now()}`)
  const filename = path.join(directory, 'database.json')
  const original = '{"users":'

  try {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(filename, original, 'utf8')
    const writer = new ArchivoJsonCoordinado(filename)

    await assert.rejects(writer.read(), SyntaxError)
    await assert.rejects(writer.write({ users: {} }), SyntaxError)
    assert.equal(await fs.readFile(filename, 'utf8'), original)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
