import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import initSqlJs from 'sql.js'
import sqlite3 from 'sqlite3'
import { ArchivoSqliteCompartido } from '../lib/db-sqlite.js'

async function crearDirectorioTemporal() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'painbot-sqlite-'))
}

test('imports the complete JSON database without creating a JSON backup', async () => {
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
    assert.deepEqual(JSON.parse(await fs.readFile(legacy, 'utf8')), original)
    await assert.rejects(fs.access(`${legacy}.pre-sqlite.bak`), { code: 'ENOENT' })
    assert.equal(await fs.stat(sqlite).then(info => info.isFile()), true)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('uses SQLite after migration and does not import later changes from the legacy JSON', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: { alice: { coins: 10 } }, chats: {} }))
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy)
    const state = await adapter.read()
    state.users.alice.coins = 25
    await adapter.write(state)

    await fs.writeFile(legacy, JSON.stringify({ users: { alice: { coins: 999 } }, chats: {} }))
    const restartedAdapter = new ArchivoSqliteCompartido(sqlite, legacy)
    assert.equal((await restartedAdapter.read()).users.alice.coins, 25)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('opens an existing sql.js database in native SQLite without changing its payload', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const SQL = await initSqlJs()
  const oldDatabase = new SQL.Database()
  const expected = { users: { alice: { coins: 75 } }, chats: {} }

  try {
    oldDatabase.run(`
      CREATE TABLE bot_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0
      )
    `)
    oldDatabase.run(
      'INSERT INTO bot_state (id, payload, revision) VALUES (1, ?, 4)',
      [JSON.stringify(expected)]
    )
    await fs.writeFile(sqlite, Buffer.from(oldDatabase.export()))

    const adapter = new ArchivoSqliteCompartido(sqlite, legacy)
    assert.deepEqual(await adapter.read(), expected)
    const updated = await adapter.claimAndUpdate(
      expected,
      'daily-user:alice',
      60_000,
      (data) => {
        data.users.alice.coins += 25
        return { coins: data.users.alice.coins }
      }
    )
    assert.deepEqual(updated.result, { coins: 100 })
    assert.equal(
      (await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice.coins,
      100
    )
  } finally {
    oldDatabase.close()
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

test('merges concurrent plugin totals, successes, and timestamps without conflicts', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const baseline = {
    users: {},
    chats: {},
    stats: {
      'rpg-daily.js': { total: 10, success: 9, last: 100, lastSuccess: 90 },
    },
  }

  try {
    await fs.writeFile(legacy, JSON.stringify(baseline))
    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await workerA.read()
    const stateB = await workerB.read()
    Object.assign(stateA.stats['rpg-daily.js'], {
      total: 11,
      success: 10,
      last: 200,
      lastSuccess: 190,
    })
    Object.assign(stateB.stats['rpg-daily.js'], {
      total: 11,
      success: 10,
      last: 300,
      lastSuccess: 290,
    })

    await workerA.write(stateA)
    await workerB.write(stateB)

    const stats = (await new ArchivoSqliteCompartido(sqlite, legacy).read()).stats['rpg-daily.js']
    assert.deepEqual(stats, { total: 12, success: 11, last: 300, lastSuccess: 290 })
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
    const databaseBeforeClaims = await fs.readFile(sqlite)

    const results = await Promise.all([
      workerA.claimCommand(dataA, claimKey),
      workerB.claimCommand(dataB, claimKey),
    ])
    assert.deepEqual(results.sort(), [false, true])
    assert.deepEqual(await fs.readFile(sqlite), databaseBeforeClaims)
    assert.equal(await fs.stat(`${sqlite}.claims.sqlite`).then(info => info.isFile()), true)
    assert.equal(await fs.stat(`${sqlite}.lock`).then(() => true, () => false), false)

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
    const second = await workerB.claimAndUpdate(stateB, key, 60_000, (data, now) => {
      const remaining = 60_000 - (now - data.users.alice.lastCrime)
      if (remaining > 0) return { claim: false, remaining }
      data.users.alice.coins += 25
      data.users.alice.lastCrime = now
      return { coins: data.users.alice.coins }
    })

    assert.deepEqual(first, { acquired: true, result: { coins: 35 } })
    assert.equal(second.acquired, true)
    assert.ok(second.result.remaining > 0)
    assert.equal((await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice.coins, 35)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('returns the remaining cooldown from the committed shared state on a duplicate daily claim', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const cooldown = 24 * 60 * 60 * 1000

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: { alice: { coins: 10 } }, chats: {} }))
    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await workerA.read()
    const stateB = await workerB.read()
    const claimKey = 'daily-user:alice'

    const first = await workerA.claimAndUpdate(stateA, claimKey, cooldown, (data, now) => {
      data.users.alice.coins += 9000
      data.users.alice.lastDaily = now
      data.users.alice.dailyStreak = 1
      return { coins: data.users.alice.coins }
    })
    const duplicate = await workerB.claimAndUpdate(stateB, claimKey, cooldown, (data, now) => {
      const remaining = cooldown - (now - data.users.alice.lastDaily)
      return remaining > 0
        ? { claim: false, tiempoRestante: remaining, proximaRacha: data.users.alice.dailyStreak + 1 }
        : { claim: true }
    })

    assert.equal(first.acquired, true)
    assert.equal(duplicate.acquired, true)
    assert.ok(duplicate.result.tiempoRestante > 0)
    assert.ok(duplicate.result.tiempoRestante <= cooldown)
    assert.equal(duplicate.result.proximaRacha, 2)
    assert.equal((await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice.coins, 9010)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('serializes concurrent daily-style claims from multiple workers without losing balances', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: {}, chats: {} }))
    const adapters = await Promise.all(
      Array.from({ length: 12 }, async () => {
        const adapter = new ArchivoSqliteCompartido(sqlite, legacy, { lockTimeoutMs: 10_000 })
        return { adapter, state: await adapter.read() }
      })
    )
    await Promise.all(adapters.map(({ adapter, state }, index) =>
      adapter.claimAndUpdate(state, `daily-user:user-${index}`, 60_000, (data) => {
        data.users[`user-${index}`] = { coins: 9000 }
        return { coins: 9000 }
      })
    ))

    const finalState = await new ArchivoSqliteCompartido(sqlite, legacy).read()
    assert.equal(Object.keys(finalState.users).length, 12)
    assert.ok(Object.values(finalState.users).every(({ coins }) => coins === 9000))
    assert.equal(await fs.stat(`${sqlite}.lock`).then(() => true, () => false), false)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('waits for SQLite writers asynchronously so timers in the worker keep running', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  let blocker

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: { alice: { coins: 10 } }, chats: {} }))
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy, { lockTimeoutMs: 3000 })
    const state = await adapter.read()
    blocker = await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(sqlite, (error) => error ? reject(error) : resolve(db))
    })
    await new Promise((resolve, reject) => {
      blocker.run('BEGIN IMMEDIATE', (error) => error ? reject(error) : resolve())
    })

    let timerTicks = 0
    const timer = setInterval(() => timerTicks++, 5)
    const claim = adapter.claimAndUpdate(state, 'daily-user:alice', 60_000, (data) => {
      data.users.alice.coins += 5
      return { coins: data.users.alice.coins }
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    clearInterval(timer)
    assert.ok(timerTicks > 0)

    await new Promise((resolve, reject) => {
      blocker.run('COMMIT', (error) => error ? reject(error) : resolve())
    })
    assert.equal((await claim).result.coins, 15)
  } finally {
    if (blocker) {
      await new Promise((resolve) => blocker.close(() => resolve()))
    }
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('queues a burst of daily-style transactions on one worker instead of racing for its file lock', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: {}, chats: {} }))
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy, { lockTimeoutMs: 3000 })
    const state = await adapter.read()
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        adapter.claimAndUpdate(state, `daily-user:burst-${index}`, 60_000, (data) => {
          data.users[`burst-${index}`] = { coins: 9000 }
          return { coins: 9000 }
        })
      )
    )

    assert.ok(results.every(({ acquired }) => acquired))
    assert.equal(Object.keys(state.users).length, 20)
    assert.equal(await fs.stat(`${sqlite}.lock`).then(() => true, () => false), false)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('reuses worker SQLite connections and closes them explicitly on shutdown', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: { alice: { coins: 10 } }, chats: {} }))
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy, { persistConnections: true })
    const state = await adapter.read()
    await Promise.all(Array.from({ length: 10 }, () => adapter.refresh(state)))
    const claim = await adapter.claimAndUpdate(state, 'daily-user:alice', 60_000, (data) => {
      data.users.alice.coins += 5
      return { coins: data.users.alice.coins }
    })

    assert.equal(claim.result.coins, 15)
    await adapter.close()
    await assert.rejects(adapter.refresh(state), /ya se está cerrando/)
    await fs.rm(directory, { recursive: true, force: true })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('coalesces repeated shared-state refreshes within the configured interval', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const cooldown = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: { alice: { coins: 10 } }, chats: {} }))
    const reader = new ArchivoSqliteCompartido(sqlite, legacy, {
      persistConnections: true,
      refreshMinIntervalMs: 40,
    })
    const writer = new ArchivoSqliteCompartido(sqlite, legacy)
    const readerState = await reader.read()
    const writerState = await writer.read()
    writerState.users.alice.coins = 20
    await writer.write(writerState)
    await reader.refresh(readerState)
    assert.equal(readerState.users.alice.coins, 20)

    writerState.users.alice.coins = 30
    await writer.write(writerState)
    await reader.refresh(readerState)
    assert.equal(readerState.users.alice.coins, 20)
    await cooldown(50)
    await reader.refresh(readerState)
    assert.equal(readerState.users.alice.coins, 30)
    await reader.close()
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

test('skips unchanged snapshots without waiting for the shared database lock', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: { alice: { coins: 1 } }, chats: {} }))
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy, { lockTimeoutMs: 30 })
    const state = await adapter.read()
    await fs.mkdir(`${sqlite}.lock`)

    await adapter.write(state)
    assert.equal(await fs.stat(`${sqlite}.lock`).then(() => true), true)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('native SQLite transactions ignore obsolete application lock directories', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const lockPath = `${sqlite}.lock`

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: { alice: { coins: 10 } }, chats: {} }))
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy, { lockTimeoutMs: 1000 })
    const state = await adapter.read()
    await fs.mkdir(lockPath)

    const claim = await adapter.claimAndUpdate(state, 'daily-user:alice', 60_000, (data) => {
      data.users.alice.coins += 9000
      return { coins: data.users.alice.coins }
    })

    assert.equal(claim.acquired, true)
    assert.equal(claim.result.coins, 9010)
    assert.equal((await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice.coins, 9010)
    assert.equal(await fs.stat(lockPath).then(() => true, () => false), true)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('command claims use SQLite transactions without creating application lock files', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')
  const claimsLock = `${sqlite}.claims.sqlite.lock`

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: {}, chats: {} }))
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy, { lockTimeoutMs: 30 })
    const state = await adapter.read()
    await fs.mkdir(claimsLock)
    assert.equal(await adapter.claimCommand(state, 'rpg-progress:group:message'), true)
    assert.equal(await fs.stat(claimsLock).then(() => true, () => false), true)
    assert.equal(await fs.stat(`${sqlite}.claims.sqlite`).then(() => true, () => false), true)
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

test('refresh drops an entity deleted by another worker using the incremental cursor', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({
      users: { alice: { coins: 1 }, bob: { coins: 2 } },
      chats: { 'g@g.us': { antiLink: true } },
    }))
    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await workerA.read()
    const stateB = await workerB.read()

    delete stateA.users.bob
    delete stateA.chats['g@g.us']
    await workerA.write(stateA)

    await workerB.refresh(stateB)
    assert.equal(stateB.users.bob, undefined)
    assert.equal(stateB.chats['g@g.us'], undefined)
    // Un lector totalmente nuevo tampoco debe verlos.
    const finalState = await new ArchivoSqliteCompartido(sqlite, legacy).read()
    assert.deepEqual(finalState.users, { alice: { coins: 1 } })
    assert.deepEqual(finalState.chats, {})
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('recreating an entity after deletion is not resurrected by a stale tombstone', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({
      users: { alice: { coins: 1 } },
      chats: {},
    }))
    const reader = new ArchivoSqliteCompartido(sqlite, legacy)
    const readerState = await reader.read()

    // Otro worker borra a alice...
    const deleter = new ArchivoSqliteCompartido(sqlite, legacy)
    const deleterState = await deleter.read()
    delete deleterState.users.alice
    await deleter.write(deleterState)

    // ...y acto seguido se vuelve a crear.
    const creator = new ArchivoSqliteCompartido(sqlite, legacy)
    const creatorState = await creator.read()
    creatorState.users.alice = { coins: 50 }
    await creator.write(creatorState)

    // El lector parte del estado inicial (alice coins 1) y debe terminar con
    // la versión viva, sin que el borrado pendiente la elimine.
    await reader.refresh(readerState)
    assert.deepEqual(readerState.users.alice, { coins: 50 })

    const finalState = await new ArchivoSqliteCompartido(sqlite, legacy).read()
    assert.deepEqual(finalState.users.alice, { coins: 50 })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('refresh only reads entities changed since its last cursor', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    const users = {}
    for (let index = 0; index < 400; index++) users[`user-${index}`] = { coins: index }
    await fs.writeFile(legacy, JSON.stringify({ users, chats: {} }))

    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy, { persistConnections: true })
    const stateA = await workerA.read()
    const stateB = await workerB.read()
    const cursorInicial = workerB.cursorSeq

    stateA.users['user-7'].coins = 777
    await workerA.write(stateA)

    await workerB.refresh(stateB)
    assert.equal(stateB.users['user-7'].coins, 777)
    assert.equal(stateB.users['user-200'].coins, 200)
    assert.ok(workerB.cursorSeq > cursorInicial)
    await workerB.close()
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('claimAndUpdate reconciles only the entity the callback touches', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({
      users: { alice: { coins: 10 }, bob: { coins: 20 }, carol: { coins: 30 } },
      chats: {},
    }))
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy)
    const state = await adapter.read()

    const resultado = await adapter.claimAndUpdate(state, 'daily-user:alice', 60_000, (datos) => {
      datos.users.alice.coins += 5
      return { coins: datos.users.alice.coins }
    })

    assert.deepEqual(resultado.result, { coins: 15 })
    assert.equal(state.users.alice.coins, 15)
    assert.equal(state.users.bob.coins, 20)
    assert.equal(state.users.carol.coins, 30)

    const finalState = await new ArchivoSqliteCompartido(sqlite, legacy).read()
    assert.deepEqual(finalState.users, {
      alice: { coins: 15 },
      bob: { coins: 20 },
      carol: { coins: 30 },
    })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('claimAndUpdate sees a remote write made inside the cursor window', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: { alice: { coins: 10 } }, chats: {} }))
    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await workerA.read()
    const stateB = await workerB.read()

    stateA.users.alice.coins = 50
    await workerA.write(stateA)

    let visto
    const resultado = await workerB.claimAndUpdate(stateB, 'daily-user:alice', 60_000, (datos) => {
      visto = datos.users.alice.coins
      datos.users.alice.coins += 1
      return { antes: visto }
    })

    assert.equal(visto, 50)
    assert.deepEqual(resultado.result, { antes: 50 })
    assert.equal(stateB.users.alice.coins, 51)
    assert.equal((await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice.coins, 51)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('claimAndUpdate merges a remote update with local edits without losing either', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: { alice: { coins: 10, level: 1 } }, chats: {} }))
    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await workerA.read()
    const stateB = await workerB.read()

    stateA.users.alice.level = 5
    await workerA.write(stateA)
    stateB.users.alice.coins = 99

    await workerB.claimAndUpdate(stateB, 'daily-user:alice', 60_000, (datos) => {
      datos.users.alice.coins += 1
      return {}
    })

    assert.deepEqual(stateB.users.alice, { coins: 100, level: 5 })
    assert.deepEqual(
      (await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice,
      { coins: 100, level: 5 }
    )
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('claimAndUpdate deletes an entity through the callback and propagates it', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({
      users: { alice: { coins: 1 }, bob: { coins: 2 } },
      chats: {},
    }))
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy)
    const state = await adapter.read()

    await adapter.claimAndUpdate(state, 'daily-user:alice', 60_000, (datos) => {
      delete datos.users.bob
      return {}
    })

    assert.equal(state.users.bob, undefined)
    assert.deepEqual(state.users, { alice: { coins: 1 } })
    assert.deepEqual(
      (await new ArchivoSqliteCompartido(sqlite, legacy).read()).users,
      { alice: { coins: 1 } }
    )
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('a rejected claim neither persists nor touches the live snapshot', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({ users: { alice: { coins: 10 } }, chats: {} }))
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy)
    const state = await adapter.read()

    await adapter.claimAndUpdate(state, 'daily-user:alice', 60_000, (datos, now) => {
      datos.users.alice.coins += 5
      datos.users.alice.lastDaily = now
      return { claim: true }
    })
    const revBefore = JSON.stringify(state.users.alice)

    const duplicado = await adapter.claimAndUpdate(state, 'daily-user:alice', 60_000, (datos, now) => {
      const restante = 60_000 - (now - datos.users.alice.lastDaily)
      if (restante > 0) return { claim: false, restante }
      datos.users.alice.coins += 5
      return { claim: true }
    })

    assert.equal(duplicado.acquired, true)
    assert.ok(duplicado.result.restante > 0)
    assert.equal(JSON.stringify(state.users.alice), revBefore)
    assert.equal((await new ArchivoSqliteCompartido(sqlite, legacy).read()).users.alice.coins, 15)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('the lazy entity view supports membership and enumeration inside the claim', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({
      users: { alice: { coins: 1 }, bob: { coins: 2 } },
      chats: {},
    }))
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy)
    const state = await adapter.read()

    let averiguado
    await adapter.claimAndUpdate(state, 'loteria-buy:x', 60_000, (datos) => {
      averiguado = {
        tieneAlice: 'alice' in datos.users,
        claves: Object.keys(datos.users).sort(),
      }
      return {}
    })

    assert.equal(averiguado.tieneAlice, true)
    assert.deepEqual(averiguado.claves, ['alice', 'bob'])
    assert.deepEqual(state.users, { alice: { coins: 1 }, bob: { coins: 2 } })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('claimAndUpdate reconciles in place without replacing live object identities', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    await fs.writeFile(legacy, JSON.stringify({
      users: { alice: { coins: 10, level: 1 } },
      chats: {},
    }))
    const workerA = new ArchivoSqliteCompartido(sqlite, legacy)
    const workerB = new ArchivoSqliteCompartido(sqlite, legacy)
    const stateA = await workerA.read()
    const stateB = await workerB.read()

    const mapaRef = stateB.users
    const usuarioRef = stateB.users.alice

    stateA.users.alice.level = 9
    await workerA.write(stateA)

    await workerB.claimAndUpdate(stateB, 'daily-user:alice', 60_000, (datos) => {
      datos.users.alice.coins += 1
      return {}
    })

    assert.equal(stateB.users, mapaRef)
    assert.equal(stateB.users.alice, usuarioRef)
    assert.deepEqual(usuarioRef, { coins: 11, level: 9 })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('migrates a per-collection schema without the sequence column and keeps refreshing', async () => {
  const directory = await crearDirectorioTemporal()
  const legacy = path.join(directory, 'database.json')
  const sqlite = path.join(directory, 'database.sqlite')

  try {
    // Esquema intermedio: colecciones/entidades ya fragmentadas pero sin la
    // columna `updated` ni las tablas de borrados y cursor.
    const stats = JSON.stringify({ commands: 3 })
    const alice = JSON.stringify({ coins: 10 })
    const grupo = JSON.stringify({ antiLink: true })
    await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(sqlite)
      db.exec(`
        CREATE TABLE bot_collections (
          key TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE bot_entidades (
          collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (collection, id)
        );
        CREATE TABLE bot_coleccion_revs (
          collection TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO bot_collections (key, payload, revision) VALUES ('stats', '${stats}', 4);
        INSERT INTO bot_entidades (collection, id, data, revision) VALUES ('users', 'alice', '${alice}', 2);
        INSERT INTO bot_entidades (collection, id, data, revision) VALUES ('chats', 'g1', '${grupo}', 5);
        INSERT INTO bot_coleccion_revs (collection, revision) VALUES ('users', 2);
      `, (error) => {
        if (error) { reject(error); return }
        db.close((closeError) => closeError ? reject(closeError) : resolve())
      })
    })

    const adapter = new ArchivoSqliteCompartido(sqlite, legacy)
    const state = await adapter.read()
    assert.deepEqual(state.stats, { commands: 3 })
    assert.deepEqual(state.users, { alice: { coins: 10 } })
    assert.deepEqual(state.chats, { g1: { antiLink: true } })

    // Tras migrar, el refresco incremental sigue viendo los cambios propios.
    state.users.alice.coins = 25
    await adapter.write(state)
    await adapter.refresh(state)
    const finalState = await new ArchivoSqliteCompartido(sqlite, legacy).read()
    assert.equal(finalState.users.alice.coins, 25)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
