import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ArchivoSqliteCompartido } from '../lib/db-sqlite.js'

async function crearDirectorioTemporal() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'painbot-sqlite-'))
}

test('imports the complete JSON database and preserves the original backup', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const original = {
    users: { alice: { coins: 42, game: { items: ['potion'] } } },
    chats: { group: { antiLink: true } },
    spamCount: { transient: 1 },
  }
  const migrado = { users: original.users, chats: original.chats }
  const originalBytes = Buffer.from(JSON.stringify(original))

  try {
    await fs.writeFile(legacy, originalBytes)
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy)

    assert.deepEqual(await adapter.read(), migrado)
    assert.deepEqual(await fs.readFile(`${legacy}.pre-sqlite.bak`), originalBytes)
    assert.deepEqual(JSON.parse(await fs.readFile(legacy, 'utf8')), original)
    assert.equal(await fs.stat(sqlite).then(info => info.isFile()), true)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('merges concurrent process snapshots when they modify independent fields', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const original = { users: { alice: { coins: 10, name: 'Alice' } }, chats: {} }

  try {
    await fs.writeFile(legacy, JSON.stringify(original))
    const first = new ArchivoSqliteCompartido(sqlite, legacy)
    const second = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await first.read()
    const stateB = await second.read()
    stateA.users.alice.coins += 5
    stateB.users.alice.name = 'Alice 2'

    await first.write(stateA)
    await second.write(stateB)

    const finalState = await new ArchivoSqliteCompartido(sqlite, legacy).read()
    assert.deepEqual(finalState.users.alice, { coins: 15, name: 'Alice 2' })
    assert.deepEqual(stateB.users.alice, { coins: 15, name: 'Alice 2' })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('adds concurrent message and command counter increments without conflict', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const original = {
    users: { alice: { msgCount: 100, commandCount: 20, stickerCount: 4 } },
    chats: {},
  }

  try {
    await fs.writeFile(legacy, JSON.stringify(original))
    const writerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const writerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await writerA.read()
    const stateB = await writerB.read()
    stateA.users.alice.msgCount += 1
    stateA.users.alice.commandCount += 1
    stateB.users.alice.msgCount += 1
    stateB.users.alice.commandCount += 1
    stateB.users.alice.stickerCount += 1

    await writerA.write(stateA)
    await writerB.write(stateB)

    const finalUser = (await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice
    assert.deepEqual(finalUser, { msgCount: 102, commandCount: 22, stickerCount: 5 })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('only one worker can claim a game message and claims survive ordinary DB writes', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const original = { users: { alice: { msgCount: 1 } }, chats: {} }

  try {
    await fs.writeFile(legacy, JSON.stringify(original))
    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const dataA = await workerA.read()
    const dataB = await workerB.read()
    const claimKey = 'game:group@g.us:message-1'

    const results = await Promise.all([
      workerA.claimCommand(dataA, claimKey),
      workerB.claimCommand(dataB, claimKey),
    ])
    assert.deepEqual(results.sort(), [false, true])

    dataA.users.alice.msgCount++
    await workerA.write(dataA)
    assert.equal(await workerB.claimCommand(dataB, claimKey), false)
    assert.equal(await workerB.releaseCommand(claimKey), true)
    assert.equal(await workerA.claimCommand(dataA, claimKey), true)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('merges last message timestamp and chat by most recent activity', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const original = {
    users: { alice: { lastMsgAt: 100, lastMsgChat: 'old@g.us' } },
    chats: {},
  }

  try {
    await fs.writeFile(legacy, JSON.stringify(original))
    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const dataA = await workerA.read()
    const dataB = await workerB.read()
    dataA.users.alice.lastMsgAt = 200
    dataA.users.alice.lastMsgChat = 'first@g.us'
    dataB.users.alice.lastMsgAt = 300
    dataB.users.alice.lastMsgChat = 'latest@g.us'

    await workerA.write(dataA)
    await workerB.write(dataB)

    const user = (await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice
    assert.equal(user.lastMsgAt, 300)
    assert.equal(user.lastMsgChat, 'latest@g.us')
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('merges signed exp changes on refresh without writing the shared database', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({
      users: { alice: { exp: 100, level: 4 } },
      chats: {},
    }))
    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await workerA.read()
    const stateB = await workerB.read()
    stateA.users.alice.exp += 10
    stateA.users.alice.level += 1
    stateB.users.alice.exp += 7
    stateB.users.alice.level += 1

    await workerA.write(stateA)
    await workerB.refresh(stateB)
    assert.equal(stateB.users.alice.exp, 117)
    assert.equal(stateB.users.alice.level, 6)

    const concurrentWorker = new ArchivoSqliteCompartido(sqlite, legacy)
    const concurrentState = await concurrentWorker.read()
    concurrentState.users.alice.exp -= 20
    await concurrentWorker.write(concurrentState)
    await workerB.refresh(stateB)
    assert.equal(stateB.users.alice.exp, 97)
    assert.equal((await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice.exp, 90)
    await workerB.write(stateB)
    assert.equal((await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice.exp, 97)
    assert.equal(await fs.stat(`${sqlite}.lock`).then(() => true, () => false), false)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('refresh exposes another worker commit while retaining local independent changes', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({
      users: { alice: { coins: 10, msgCount: 1 }, bob: { coins: 4 } },
      chats: {},
    }))
    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await workerA.read()
    const stateB = await workerB.read()
    stateA.users.alice.msgCount += 1
    stateA.users.bob.coins = 8
    await workerA.write(stateA)

    stateB.users.alice.coins = 20
    await workerB.refresh(stateB)
    assert.equal(stateB.users.alice.msgCount, 2)
    assert.equal(stateB.users.alice.coins, 20)
    assert.equal(stateB.users.bob.coins, 8)
    const afterRefresh = await new ArchivoSqliteCompartido(sqlite, legacy).read()
    assert.equal(afterRefresh.users.bob.coins, 8)
    await workerB.write(stateB)

    const committed = await new ArchivoSqliteCompartido(sqlite, legacy).read()
    assert.equal(committed.users.alice.msgCount, 2)
    assert.equal(committed.users.alice.coins, 20)
    assert.equal(committed.users.bob.coins, 8)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('refresh resolves only conflicting fields to committed values and keeps independent local edits', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({
      users: { alice: { coins: 10, name: 'Alice' } },
      chats: {},
    }))
    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await workerA.read()
    const stateB = await workerB.read()
    stateA.users.alice.coins = 3
    stateB.users.alice.coins = 30
    stateB.users.alice.name = 'Alice 2'

    await workerA.write(stateA)
    await workerB.refresh(stateB)

    assert.deepEqual(stateB.users.alice, { coins: 3, name: 'Alice 2' })
    await workerB.write(stateB)
    assert.deepEqual(
      (await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice,
      { coins: 3, name: 'Alice 2' }
    )
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('claimAndUpdate atomically applies one cooldown action and persists it to every worker', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: { alice: { coins: 10 } }, chats: {} }))
    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await workerA.read()
    const stateB = await workerB.read()
    const key = 'cooldown:crime:alice'
    const first = await workerA.claimAndUpdate(stateA, key, 60_000, (data, now) => {
      data.users.alice.coins += 25
      data.users.alice.lastCrime = now
      return { coins: data.users.alice.coins }
    })
    const second = await workerB.claimAndUpdate(stateB, key, 60_000, (data) => {
      data.users.alice.coins += 25
      return { coins: data.users.alice.coins }
    })

    assert.deepEqual(first, { acquired: true, result: { coins: 35 } })
    assert.equal(second.acquired, false)
    assert.equal((await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice.coins, 35)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('rejects conflicting writes to the same balance instead of overwriting either transaction', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const original = { users: { alice: { coins: 10 } }, chats: {} }

  try {
    await fs.writeFile(legacy, JSON.stringify(original))
    const first = new ArchivoSqliteCompartido(sqlite, legacy)
    const second = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await first.read()
    const stateB = await second.read()
    stateA.users.alice.coins -= 7
    stateB.users.alice.coins += 20

    await first.write(stateA)
    await assert.rejects(second.write(stateB), { code: 'ERR_SQLITE_WRITE_CONFLICT' })

    const finalState = await new ArchivoSqliteCompartido(sqlite, legacy).read()
    assert.equal(finalState.users.alice.coins, 3)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('serializes simultaneous independent process writes to the shared database', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: {}, chats: {} }))
    const writers = await Promise.all(
      Array.from({ length: 8 }, async (_, index) => {
        const adapter = new ArchivoSqliteCompartido(sqlite, legacy)
        const state = await adapter.read()
        state.users[`user-${index}`] = { coins: index }
        return () => adapter.write(state)
      })
    )

    await Promise.all(writers.map(write => write()))
    const finalState = await new ArchivoSqliteCompartido(sqlite, legacy).read()
    assert.equal(Object.keys(finalState.users).length, 8)
    for (let index = 0; index < 8; index++) {
      assert.equal(finalState.users[`user-${index}`].coins, index)
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('rejects corrupt JSON and never creates a new database or replaces the source', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const original = '{"users":'

  try {
    await fs.writeFile(legacy, original)
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy)
    await assert.rejects(adapter.read(), SyntaxError)
    assert.equal(await fs.readFile(legacy, 'utf8'), original)
    await assert.rejects(fs.access(sqlite), { code: 'ENOENT' })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
