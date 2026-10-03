import { readFileSync, writeFileSync, existsSync } from 'fs'

const { initAuthCreds, BufferJSON, proto } = (await import('@whiskeysockets/baileys')).default

import { handleWelcomeGoodbye } from './welcome-goodbye.js'
import { manejarJoinAntiBot } from './Antis/anti-bot.js'
import { refrescarMetadataSiSigue } from './group-meta-cache.js'
import { invalidarIndiceParticipantes } from './group-participant.js'

function aplicarCambioParticipantes(metadata, participants, action) {
    if (!metadata || !Array.isArray(participants)) return
    if (!Array.isArray(metadata.participants)) metadata.participants = []
    const ids = new Set(participants.map(p => String(p)))
    if (action === 'remove') {
        metadata.participants = metadata.participants.filter(p => !ids.has(String(p.id || p.jid || '')))
        return
    }
    if (action === 'promote' || action === 'demote') {
        const admin = action === 'promote' ? 'admin' : null
        for (const p of metadata.participants) {
            if (ids.has(String(p.id || p.jid || ''))) p.admin = admin
        }
        return
    }
    if (action === 'add') {
        for (const jid of participants) {
            if (!metadata.participants.some(p => String(p.id || p.jid || '') === String(jid))) {
                metadata.participants.push({ id: jid, admin: null })
            }
        }
    }
}

function vincular(conn) {
    if (!conn || conn._painStore) return
    conn._painStore = true
    if (!conn.chats) conn.chats = {}
    function actualizarNombreEnDb(contactos) {
        if (!contactos) return
        try {
            contactos = contactos.contacts || contactos
            for (const contacto of contactos) {
                const id = conn.decodeJid(contacto.id)
                if (!id || id === 'status@broadcast') continue
                let chats = conn.chats[id]
                if (!chats) chats = conn.chats[id] = { ...contacto, id }
                conn.chats[id] = {
                    ...chats,
                    ...({
                        ...contacto, id, ...(id.endsWith('@g.us') ?
                            { subject: contacto.subject || contacto.name || chats.subject || '' } :
                            { name: contacto.notify || contacto.name || chats.name || chats.notify || '' })
                    } || {})
                }
            }
        } catch (e) {
            console.error(e)
        }
    }
    conn.ev.on('contacts.upsert', actualizarNombreEnDb)
    conn.ev.on('groups.update', actualizarNombreEnDb)
    conn.ev.on('contacts.set', actualizarNombreEnDb)
    conn.ev.on('chats.set', async ({ chats }) => {
        try {
            for (let { id, name, readOnly } of chats) {
                id = conn.decodeJid(id)
                if (!id || id === 'status@broadcast') continue
                const esGrupo = id.endsWith('@g.us')
                let chats = conn.chats[id]
                if (!chats) chats = conn.chats[id] = { id }
                chats.isChats = !readOnly
                if (name) chats[esGrupo ? 'subject' : 'name'] = name
            }
        } catch (e) {
            console.error(e)
        }
    })
    conn.ev.on('group-participants.update', async function actualizarParticipantesEnDb({ id, participants, action }) {
        try {
            if (!id) return
            id = conn.decodeJid(id)
            if (id === 'status@broadcast') return
            if (!(id in conn.chats)) conn.chats[id] = { id }
            const chats = conn.chats[id]
            chats.isChats = true
            if (chats.metadata) {
                const participantesPrevios = chats.metadata.participants
                aplicarCambioParticipantes(chats.metadata, participants, action)
                invalidarIndiceParticipantes(participantesPrevios)
                invalidarIndiceParticipantes(chats.metadata.participants)
            }
            await refrescarMetadataSiSigue(conn, id, { id, participants, action }).catch(() => {})

            await handleWelcomeGoodbye(conn, { id, participants, action }).catch((e) => {
                console.error('[bienvenida]', e?.message || e)
            })
            await manejarJoinAntiBot(conn, { id, participants, action }).catch(() => {})
        } catch (e) {
            console.error('[grupo]', e?.message || e)
        }
    })

    conn.ev.on('groups.update', async function empujarActualizacionGrupoADb(groupsUpdates) {
        try {
            for (const update of groupsUpdates) {
                const id = conn.decodeJid(update.id)
                if (!id || id === 'status@broadcast') continue
                const esGrupo = id.endsWith('@g.us')
                if (!esGrupo) continue
                let chats = conn.chats[id]
                if (!chats) chats = conn.chats[id] = { id }
                chats.isChats = true
                const ahora = Date.now()
                const metadata = await refrescarMetadataSiSigue(conn, id)
                if (metadata) {
                  chats.metadata = metadata
                  chats._metaEn = ahora
                }
                if (update.subject || metadata?.subject) chats.subject = update.subject || metadata.subject
            }
        } catch (e) {
            console.error(e)
        }
    })
    conn.ev.on('chats.upsert', function empujarChatsUpsertADb(chatsUpsert) {
        try {
            const { id, name } = chatsUpsert
            if (!id || id === 'status@broadcast') return
            conn.chats[id] = { ...(conn.chats[id] || {}), ...chatsUpsert, isChats: true }
        } catch (e) {
            console.error(e)
        }
    })
}

const MAPA_CLAVES = {
    'pre-key': 'preKeys',
    'session': 'sessions',
    'sender-key': 'senderKeys',
    'app-state-sync-key': 'appStateSyncKeys',
    'app-state-sync-version': 'appStateVersions',
    'sender-key-memory': 'senderKeyMemory'
}

function usarEstadoAuthArchivoUnico(nombreArchivo, logger) {
    let creds, keys = {}, contadorGuardado = 0
    const guardarEstado = (forzarGuardado) => {
        logger?.trace('saving auth state')
        contadorGuardado++
        if (forzarGuardado || contadorGuardado > 5) {
            writeFileSync(
                nombreArchivo,
                JSON.stringify({ creds, keys }, BufferJSON.replacer, 2)
            )
            contadorGuardado = 0
        }
    }

    if (existsSync(nombreArchivo)) {
        const resultado = JSON.parse(
            readFileSync(nombreArchivo, { encoding: 'utf-8' }),
            BufferJSON.reviver
        )
        creds = resultado.creds
        keys = resultado.keys
    } else {
        creds = initAuthCreds()
        keys = {}
    }

    return {
        state: {
            creds,
            keys: {
                get: (type, ids) => {
                    const clave = MAPA_CLAVES[type]
                    return ids.reduce(
                        (dict, id) => {
                            let valor = keys[clave]?.[id]
                            if (valor) {
                                if (type === 'app-state-sync-key') {
                                    valor = proto.AppStateSyncKeyData.fromObject(valor)
                                }

                                dict[id] = valor
                            }

                            return dict
                        }, {}
                    )
                },
                set: (datos) => {
                    for (const _clave in datos) {
                        const clave = MAPA_CLAVES[_clave]
                        keys[clave] = keys[clave] || {}
                        Object.assign(keys[clave], datos[_clave])
                    }

                    guardarEstado()
                }
            }
        },
        saveState: guardarEstado
    }
}

export {
  vincular as bind,
  usarEstadoAuthArchivoUnico as useSingleFileAuthState
}

export default {
    bind: vincular,
    useSingleFileAuthState: usarEstadoAuthArchivoUnico
}
