/* By Sunkovv
*/



import { watchFile, unwatchFile } from 'fs' 
import chalk from 'chalk'
import { fileURLToPath } from 'url'


// CAMBIA POR EL NUMERO QUE VA SER OWNER DEL BOT
global.owner = [
  ['tunumero', 'Sunkovv', true],
]

//  ACA PON EL LID DEL OWNER DEL BOT PARA QUE TE HAGA CASO COMO OWNER EL BOT, USA EL COMANDO /ID EN TU 
//PRIVADO PARA SACAR TU LID
global.ownerLid = [
  ['198119006412828', 'Sunkovv', true],
  ['120298544349272', 'Zafiro(Mod)', true],
  ['acaElLiD', 'nombre', true]
]

global.sessions = 'Sessions'
global.bot = 'Serbot' 
global.AFBots = true

global.packname = '𝗣𝗔𝗜𝗡 𝗕𝗢𝗧'
global.namebot = '𝗣𝗔𝗜𝗡 𝗕𝗢𝗧'
global.author = 'Sunkovv'
global.moneda = 'USD'


global.canal = ''

global.ch = {
ch1: '',
}

global.mods =   []
global.prems = []

global.multiplier = 69 
global.maxwarn = '2'

// APIS QUE USA EL BOT EN GLOBAL(NO BORRES)
global.APIs = {
vreden: { url: "https://api.vreden.web.id", key: null },
delirius: { url: "https://api.delirius.online", key: null },
zenzxz: { url: "https://api.zenzxz.my.id", key: null },
siputzx: { url: "https://api.siputzx.my.id", key: null }
}

let file = fileURLToPath(import.meta.url)
watchFile(file, () => {
  unwatchFile(file)
  console.log(chalk.redBright("Update 'config.js'"))
  import(`${file}?update=${Date.now()}`)
})
