import { readFileSync, writeFileSync, existsSync } from 'fs'

const { initAuthCreds, BufferJSON, proto } = (await import('@whiskeysockets/baileys')).default

import { handleWelcomeGoodbye } from './welcome-goodbye.js'
 
function vincular(conn) {
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
                if (esGrupo) {
                    const metadata = await conn.groupMetadata(id).catch(_ => null)
                    if (name || metadata?.subject) chats.subject = name || metadata.subject
                    if (!metadata) continue
                    chats.metadata = metadata
                }
            }
        } catch (e) {
            console.error(e)
        }
    })
    conn.ev.on('group-participants.update', async function actualizarParticipantesEnDb({ id, participants, action }) {
        if (!id) return
        id = conn.decodeJid(id)
        if (id === 'status@broadcast') return
        if (!(id in conn.chats)) conn.chats[id] = { id }
        let chats = conn.chats[id]
        chats.isChats = true
        const groupMetadata = await conn.groupMetadata(id).catch(_ => null)
        if (!groupMetadata) return
        chats.subject = groupMetadata.subject
        chats.metadata = groupMetadata

    
        await handleWelcomeGoodbye(conn, { id, participants, action })
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
                const metadata = await conn.groupMetadata(id).catch(_ => null)
                if (metadata) chats.metadata = metadata
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
            const esGrupo = id.endsWith('@g.us')
            if (esGrupo) conn.insertAllGroup().catch(_ => null)
        } catch (e) {
            console.error(e)
        }
    })
    conn.ev.on('presence.update', async function empujarPresenciaADb({ id, presences }) {
        try {
            const sender = Object.keys(presences)[0] || id
            const _sender = conn.decodeJid(sender)
            const presence = presences[sender]['lastKnownPresence'] || 'composing'
            let chats = conn.chats[_sender]
            if (!chats) chats = conn.chats[_sender] = { id: sender }
            chats.presences = presence
            if (id.endsWith('@g.us')) {
                let chats = conn.chats[id]
                if (!chats) chats = conn.chats[id] = { id }
            }
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
