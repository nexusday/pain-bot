import { readdirSync, existsSync, readFileSync, watch } from 'fs'
import { join, resolve } from 'path'
import { format } from 'util'
import syntaxerror from 'syntax-error'
import importFile from './import.js'
import Helper from './helper.js'

const __dirname = Helper.__dirname(import.meta)
const carpetaPlugins = Helper.__dirname(join(__dirname, '../plugins'))
const filtroPlugin = nombreArchivo => /\.(mc)?js$/.test(nombreArchivo)


let observador, plugins, carpetasPlugins = []
observador = plugins = {}

async function iniciarArchivos(carpetaPluginsParam = carpetaPlugins, filtroPluginParam = filtroPlugin, conn) {
    const carpeta = resolve(carpetaPluginsParam)
    if (carpeta in observador) return
    carpetasPlugins.push(carpeta)

    await Promise.all(readdirSync(carpeta).filter(filtroPluginParam).map(async nombreArchivo => {
        try {
            let archivo = global.__filename(join(carpeta, nombreArchivo))
            const modulo = await import(archivo)
            if (modulo) plugins[nombreArchivo] = 'default' in modulo ? modulo.default : modulo
        } catch (e) {
            conn?.logger.error(e)
            delete plugins[nombreArchivo]
        }
    }))


    const vigilancia = watch(carpeta, recargar.bind(null, conn, carpeta, filtroPluginParam))
    vigilancia.on('close', () => eliminarCarpetaPlugin(carpeta, true))
    observador[carpeta] = vigilancia

    return plugins
}

function eliminarCarpetaPlugin(carpeta, yaCerrada = false) {
    const resuelta = resolve(carpeta)
    if (!(resuelta in observador)) return
    if (!yaCerrada) observador[resuelta].close()
    delete observador[resuelta]
    carpetasPlugins.splice(carpetasPlugins.indexOf(resuelta), 1)
}

async function recargar(conn, carpetaPluginsParam = carpetaPlugins, filtroPluginParam = filtroPlugin, _ev, nombreArchivo) {
    if (filtroPluginParam(nombreArchivo)) {
        let dir = global.__filename(join(carpetaPluginsParam, nombreArchivo), true)
        if (nombreArchivo in plugins) {
            if (existsSync(dir)) conn.logger.info(` updated plugin - '${nombreArchivo}'`)
            else {
                conn?.logger.warn(`deleted plugin - '${nombreArchivo}'`)
                return delete plugins[nombreArchivo]
            }
        } else conn?.logger.info(`new plugin - '${nombreArchivo}'`)
        let err = syntaxerror(readFileSync(dir), nombreArchivo, {
            sourceType: 'module',
            allowAwaitOutsideFunction: true
        })
        if (err) conn.logger.error(`syntax error while loading '${nombreArchivo}'\n${format(err)}`)
        else try {
            const modulo = await importFile(global.__filename(dir)).catch(console.error)
            if (modulo) plugins[nombreArchivo] = modulo
        } catch (e) {
            conn?.logger.error(`error require plugin '${nombreArchivo}\n${format(e)}'`)
        } finally {
            plugins = Object.fromEntries(Object.entries(plugins).sort(([a], [b]) => a.localeCompare(b)))
        }
    }
}

export {
  carpetaPlugins as pluginFolder,
  filtroPlugin as pluginFilter,
  plugins,
  observador as watcher,
  carpetasPlugins as pluginFolders,
  iniciarArchivos as filesInit,
  eliminarCarpetaPlugin as deletePluginFolder,
  recargar as reload
}
