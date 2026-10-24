import webPush from 'web-push'
import crypto from 'node:crypto'

export const sqlAll = (store, sql, values = []) =>
  new Promise((resolve, reject) =>
    store.db.all(sql, values, (error, rows) =>
      error ? reject(error) : resolve(rows)
    )
  )
export const sqlRun = (store, sql, values = []) =>
  new Promise((resolve, reject) =>
    store.db.run(sql, values, function (error) {
      error
        ? reject(error)
        : resolve({ changes: this.changes, id: this.lastID })
    })
  )

export async function initPush(store) {
  await new Promise((resolve, reject) =>
    store.db.exec(
      `
    CREATE TABLE IF NOT EXISTS panel_push_devices (
      user_id INTEGER NOT NULL REFERENCES panel_users(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL, permission TEXT NOT NULL DEFAULT 'default',
      enabled INTEGER NOT NULL DEFAULT 0, endpoint TEXT UNIQUE, subscription TEXT,
      checked_at INTEGER NOT NULL, prompt_after INTEGER NOT NULL DEFAULT 0,
      last_error TEXT, session_hash TEXT, PRIMARY KEY(user_id, device_id)
    );
    CREATE TABLE IF NOT EXISTS panel_push_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL,
      url TEXT NOT NULL, created_by INTEGER, created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued'
    );
    CREATE TABLE IF NOT EXISTS panel_push_deliveries (
      job_id INTEGER NOT NULL REFERENCES panel_push_jobs(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL, device_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', updated_at INTEGER NOT NULL,
      PRIMARY KEY(job_id,user_id,device_id)
    );
    CREATE INDEX IF NOT EXISTS idx_push_jobs_status ON panel_push_jobs(status,id);
    CREATE INDEX IF NOT EXISTS idx_push_delivery_status ON panel_push_deliveries(job_id,status);
  `,
      (error) => (error ? reject(error) : resolve())
    )
  )
  if (
    !(await sqlAll(store, 'PRAGMA table_info(panel_push_devices)')).some(
      (column) => column.name === 'session_hash'
    )
  )
    await sqlRun(
      store,
      'ALTER TABLE panel_push_devices ADD COLUMN session_hash TEXT'
    )
}

export function validateSubscription(input) {
  if (!input || typeof input !== 'object')
    throw new Error('La suscripción no es válida.')
  const url = new URL(String(input.endpoint || ''))
  const host = url.hostname.toLowerCase()
  const allowed =
    host === 'fcm.googleapis.com' ||
    host === 'web.push.apple.com' ||
    host.endsWith('.push.services.mozilla.com') ||
    host.endsWith('.notify.windows.com')
  if (
    !allowed ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    url.href.length > 2048
  )
    throw new Error('El servicio push no está permitido.')
  const keys = input.keys || {}
  if (
    !/^[\w-]+={0,2}$/.test(keys.p256dh || '') ||
    Buffer.from(keys.p256dh, 'base64url').length !== 65 ||
    !/^[\w-]+={0,2}$/.test(keys.auth || '') ||
    Buffer.from(keys.auth, 'base64url').length !== 16
  )
    throw new Error('Las claves de la suscripción no son válidas.')
  try{crypto.ECDH.convertKey(Buffer.from(keys.p256dh,'base64url'),'prime256v1',undefined,undefined,'uncompressed')}catch{throw new Error('La clave del dispositivo no es válida.')}
  return {
    endpoint: url.href,
    expirationTime: null,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  }
}

export function deviceId(value) {
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(String(value || '')))
    throw new Error('El identificador del dispositivo no es válido.')
  return String(value)
}

export async function pushSettings(store) {
  const minutes = Number(await store.obtenerMeta('push_prompt_minutes'))
  return {
    enabled: (await store.obtenerMeta('push_prompt_enabled')) !== '0',
    promptMinutes:
      Number.isFinite(minutes) && minutes >= 5 && minutes <= 43200
        ? minutes
        : 1440,
  }
}

export async function syncPushDevice(store, userId, body) {
  const id = deviceId(body.deviceId)
  const permission = ['granted', 'denied', 'default', 'unsupported'].includes(
    body.permission
  )
    ? body.permission
    : 'default'
  const subscription =
    permission === 'granted' && body.subscription
      ? validateSubscription(body.subscription)
      : null
  const now = Date.now()
  if (subscription) {
    // Un navegador compartido no puede seguir suscrito a la cuenta anterior.
    await sqlRun(
      store,
      'DELETE FROM panel_push_devices WHERE endpoint = ? AND (user_id <> ? OR device_id <> ?)',
      [subscription.endpoint, userId,id]
    )
  }
  const existing = (
    await sqlAll(
      store,
      'SELECT * FROM panel_push_devices WHERE user_id=? AND device_id=?',
      [userId, id]
    )
  )[0]
  if (
    !existing &&
    (
      await sqlAll(
        store,
        'SELECT COUNT(*) AS total FROM panel_push_devices WHERE user_id=?',
        [userId]
      )
    )[0].total >= 20
  )
    throw new Error(
      'Llegaste al máximo de 20 dispositivos registrados en esta cuenta.'
    )
  const justRevoked = existing?.enabled && !subscription
  await sqlRun(
    store,
    `INSERT INTO panel_push_devices(user_id,device_id,permission,enabled,endpoint,subscription,checked_at,prompt_after)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,device_id) DO UPDATE SET
    permission=excluded.permission, enabled=excluded.enabled, endpoint=excluded.endpoint,
    subscription=excluded.subscription, checked_at=excluded.checked_at, last_error=NULL,
    prompt_after=CASE WHEN ? THEN 0 ELSE panel_push_devices.prompt_after END`,
    [
      userId,
      id,
      permission,
      subscription ? 1 : 0,
      subscription?.endpoint || null,
      subscription ? JSON.stringify(subscription) : null,
      now,
      0,
      justRevoked ? 1 : 0,
    ]
  )
  return pushDeviceState(store, userId, id)
}

export async function pushDeviceState(store, userId, id) {
  const row = (
    await sqlAll(
      store,
      'SELECT permission,enabled,checked_at,prompt_after,last_error FROM panel_push_devices WHERE user_id=? AND device_id=?',
      [userId, deviceId(id)]
    )
  )[0]
  return {
    permission: row?.permission || 'default',
    enabled: Boolean(row?.enabled),
    checkedAt: row?.checked_at || null,
    promptAfter: row?.prompt_after || 0,
    reason: row?.last_error || null,
  }
}

export async function listPushUsers(store, query = '', offset = 0) {
  return sqlAll(
    store,
    `SELECT u.id,u.username,u.email,
    COUNT(d.device_id) AS devices, COALESCE(SUM(d.enabled),0) AS activeDevices,
    MAX(d.checked_at) AS checkedAt,
    CASE WHEN COALESCE(SUM(d.enabled),0)>0 THEN 'active'
      WHEN SUM(CASE WHEN d.permission='denied' THEN 1 ELSE 0 END)>0 THEN 'denied' ELSE 'inactive' END AS pushStatus
    FROM panel_users u LEFT JOIN panel_push_devices d ON d.user_id=u.id
    WHERE u.status='active' AND (u.username LIKE ? OR COALESCE(u.email,'') LIKE ?)
    GROUP BY u.id ORDER BY u.id DESC LIMIT 200 OFFSET ?`,
    [`%${query}%`, `%${query}%`, offset]
  )
}

export async function queuePush(store, userId, input) {
  if((await sqlAll(store,'SELECT COUNT(*) AS total FROM panel_push_jobs WHERE created_by=? AND created_at>?',[userId,Date.now()-15*60000]))[0].total>=5)throw new Error('Puedes programar hasta cinco campañas cada 15 minutos.')
  if (
    (
      await sqlAll(
        store,
        "SELECT COUNT(*) AS total FROM panel_push_jobs WHERE status IN ('preparing','queued','sending')"
      )
    )[0].total >= 5
  )
    throw new Error(
      'Ya hay cinco campañas en curso. Espera a que terminen antes de programar otra.'
    )
  const title = String(input.title || '').trim()
  const body = String(input.body || '').trim()
  const url = String(input.url || '/#/dashboard').trim()
  if (!title || title.length > 100 || !body || body.length > 1000)
    throw new Error(
      'Escribe un título (máximo 100 caracteres) y un mensaje (máximo 1000).'
    )
  if (
    !url.startsWith('/') ||
    url.startsWith('//') ||
    /[\\\u0000-\u001f\u007f]/.test(url) ||
    url.length > 500
  )
    throw new Error('El enlace debe ser una ruta del propio panel.')
  if(Buffer.byteLength(JSON.stringify({title,body,url,tag:'pain-campaign'}))>3500)throw new Error('El mensaje y el enlace juntos son demasiado largos para una notificación push.')
  const ids = Array.isArray(input.userIds)
    ? [...new Set(input.userIds.map(Number))]
    : []
  if (
    input.audience !== 'all' &&
    (!ids.length ||
      ids.length > 2000 ||
      ids.some((id) => !Number.isSafeInteger(id) || id < 1))
  )
    throw new Error('Selecciona al menos un usuario (máximo 2000).')
  const selection = `FROM panel_push_devices d
    JOIN panel_users u ON u.id=d.user_id WHERE d.enabled=1 AND d.subscription IS NOT NULL AND u.status='active'
    ${input.audience === 'all' ? '' : `AND u.id IN (${ids.map(() => '?').join(',')})`}`
  const selectedIds = input.audience === 'all' ? [] : ids
  const devices = await sqlAll(
    store,
    `SELECT d.user_id,d.device_id ${selection} LIMIT 10001`,
    selectedIds
  )
  if (!devices.length)
    throw new Error(
      'No hay dispositivos con notificaciones activas entre los destinatarios.'
    )
  if (devices.length > 10000)
    throw new Error(
      'Esta campaña supera el máximo de 10000 dispositivos. Divide el envío.'
    )
  const job = await sqlRun(
    store,
    "INSERT INTO panel_push_jobs(title,body,url,created_by,created_at,status) VALUES(?,?,?,?,?,'preparing')",
    [title, body, url, userId, Date.now()]
  )
  try {
    await sqlRun(
      store,
      `INSERT INTO panel_push_deliveries(job_id,user_id,device_id,updated_at) SELECT ?,d.user_id,d.device_id,? ${selection} LIMIT 10000`,
      [job.id, Date.now(), ...selectedIds]
    )
    await sqlRun(
      store,
      "UPDATE panel_push_jobs SET status='queued' WHERE id=?",
      [job.id]
    )
  } catch (error) {
    await sqlRun(store, 'DELETE FROM panel_push_jobs WHERE id=?', [job.id])
    throw error
  }
  return {
    id: job.id,
    devices: devices.length,
    users: new Set(devices.map((d) => d.user_id)).size,
  }
}

export function createPushService(
  store,
  config,
  send = webPush.sendNotification.bind(webPush)
) {
  let running = false
  let closed = false
  let keyPromise
  // Rastreo anti-bucle por campaña: { pending, ticks } con el mismo avance.
  const atascos = new Map()
  const keys = () =>
    (keyPromise ||= (async () => {
      const saved = await store.obtenerMeta('push_vapid_keys')
      if (saved) {
        try {
          const value = JSON.parse(saved)
          if (
            typeof value.publicKey !== 'string' ||
            typeof value.privateKey !== 'string'
          )
            throw new Error()
          return { publicKey: value.publicKey, privateKey: value.privateKey }
        } catch {
          throw new Error(
            'Las claves push necesitan revisión del administrador.'
          )
        }
      }
      const value = webPush.generateVAPIDKeys()
      await sqlRun(
        store,
        'INSERT OR IGNORE INTO panel_meta(key,value) VALUES(?,?)',
        ['push_vapid_keys', JSON.stringify(value)]
      )
      const persisted = JSON.parse(await store.obtenerMeta('push_vapid_keys'))
      return {
        publicKey: persisted.publicKey,
        privateKey: persisted.privateKey,
      }
    })())
  const tick = async () => {
    if (running || closed) return
    running = true
    try {
      const jobs = await sqlAll(
        store,
        "SELECT * FROM panel_push_jobs WHERE status IN ('queued','sending') ORDER BY id LIMIT 1"
      )
      for (const job of jobs) {
        await sqlRun(
          store,
          "UPDATE panel_push_jobs SET status='sending' WHERE id=?",
          [job.id]
        )
        const deliveries = await sqlAll(
          store,
          `SELECT x.*,d.subscription,d.enabled,u.status AS user_status
          FROM panel_push_deliveries x LEFT JOIN panel_push_devices d ON d.user_id=x.user_id AND d.device_id=x.device_id
          LEFT JOIN panel_users u ON u.id=x.user_id WHERE x.job_id=? AND x.status='pending' LIMIT 4`,
          [job.id]
        )
        let vapid = null
        if (deliveries.length) {
          try {
            vapid = await keys()
          } catch (error) {
            // Claves VAPID rotas o no disponibles: fallar la campaña de forma
            // controlada en lugar de reintentar para siempre cada segundo.
            console.error('[webpanel-push]', `Campaña ${job.id} fallida:`, error.message)
            await sqlRun(store, "UPDATE panel_push_jobs SET status='failed' WHERE id=?", [job.id])
            atascos.delete(job.id)
            continue
          }
        }
        await Promise.all(
          deliveries.map(async (delivery) => {
            const claim = await sqlRun(
              store,
              "UPDATE panel_push_deliveries SET status='sending',updated_at=? WHERE job_id=? AND user_id=? AND device_id=? AND status='pending'",
              [Date.now(), job.id, delivery.user_id, delivery.device_id]
            )
            if (!claim.changes) return
            let status = 'skipped'
            if (
              delivery.enabled &&
              delivery.subscription &&
              delivery.user_status === 'active'
            ) {
              try {
                await send(
                  validateSubscription(JSON.parse(delivery.subscription)),
                  JSON.stringify({
                    title: job.title,
                    body: job.body,
                    url: job.url,
                    tag: `pain-${job.id}`,
                  }),
                  {
                    TTL: 86400,
                    timeout: 10000,
                    vapidDetails: {
                      subject: config.publicUrl.startsWith('https://')
                        ? config.publicUrl
                        : 'mailto:admin@example.com',
                      ...vapid,
                    },
                  }
                )
                status = 'sent'
              } catch (error) {
                status = 'failed'
                if ([404, 410].includes(error.statusCode))
                  await sqlRun(
                    store,
                    'UPDATE panel_push_devices SET enabled=0,subscription=NULL,endpoint=NULL,last_error=? WHERE user_id=? AND device_id=?',
                    ['expired', delivery.user_id, delivery.device_id]
                  )
              }
            }
            await sqlRun(
              store,
              'UPDATE panel_push_deliveries SET status=?,updated_at=? WHERE job_id=? AND user_id=? AND device_id=?',
              [status, Date.now(), job.id, delivery.user_id, delivery.device_id]
            )
          })
        )
        const left = (
          await sqlAll(
            store,
            "SELECT COUNT(*) AS total FROM panel_push_deliveries WHERE job_id=? AND status IN ('pending','sending')",
            [job.id]
          )
        )[0].total
        if (!left) {
          atascos.delete(job.id)
          await sqlRun(
            store,
            "UPDATE panel_push_jobs SET status='done' WHERE id=?",
            [job.id]
          )
        } else {
          // Salvavidas anti-bucle: si la campaña lleva 60 intentos (≈1 min)
          // con el mismo avance sin moverse, se marca fallida y se detiene.
          const previo = atascos.get(job.id)
          if (!previo || previo.pending !== left) {
            atascos.set(job.id, { pending: left, ticks: 0 })
          } else if (++previo.ticks >= 60) {
            console.error('[webpanel-push]', `Campaña ${job.id} sin progresar en 60 intentos; se marca como fallida.`)
            await sqlRun(store, "UPDATE panel_push_jobs SET status='failed' WHERE id=?", [job.id])
            atascos.delete(job.id)
          }
        }
      }
    } catch (error) {
      console.error('[webpanel-push]', error.message)
    } finally {
      running = false
    }
  }
  const timer = setInterval(tick, 1000)
  timer.unref?.()
  return {
    keys,
    tick,
    async recover() {
      await sqlRun(
        store,
        "DELETE FROM panel_push_jobs WHERE status='preparing'"
      )
      await sqlRun(
        store,
        "UPDATE panel_push_deliveries SET status='pending' WHERE status='sending'"
      )
    },
    close() {
      closed = true
      clearInterval(timer)
    },
  }
}

export async function pushHistory(store) {
  return sqlAll(
    store,
    `SELECT j.id,j.title,j.body,j.url,j.status,j.created_at,
    COUNT(d.user_id) AS total, SUM(d.status='sent') AS sent,SUM(d.status='failed') AS failed,
    SUM(d.status='skipped') AS skipped FROM panel_push_jobs j LEFT JOIN panel_push_deliveries d ON d.job_id=j.id
    GROUP BY j.id ORDER BY j.id DESC LIMIT 30`
  )
}

// Retención de campañas push: elimina jobs antiguos; las deliveries se
// borran en cascada (ON DELETE CASCADE). Se invoca desde el mantenimiento.
export async function purgarPushAntiguo(store, olderThan) {
  const { changes } = await sqlRun(
    store,
    'DELETE FROM panel_push_jobs WHERE created_at < ?',
    [Number(olderThan)]
  )
  return changes
}
