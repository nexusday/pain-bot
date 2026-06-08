console.log('⧉ Inicializando Pain...')

import { join, dirname } from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import cluster from 'node:cluster'

const { setupMaster, fork } = cluster
import { watchFile, unwatchFile } from 'fs'
import cfonts from 'cfonts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(__dirname)

cfonts.say('PAIN\nBOT', {
  font: 'block',
  align: 'center',
  gradient: ['cyan', 'blue']
})

cfonts.say('WhatsApp Multi-Bot', {
  font: 'simple',
  align: 'center',
  gradient: ['blue', 'white']
})

let isWorking = false

async function launch(scripts) {
  if (isWorking) return
  isWorking = true

  for (const script of scripts) {
    const args = [join(__dirname, script), ...process.argv.slice(2)]

    setupMaster({
      exec: args[0],
      args: args.slice(1),
    })

    let child = fork()

    child.on('exit', (code) => {
      isWorking = false
      launch(scripts)

      if (code === 0) return
      watchFile(args[0], () => {
        unwatchFile(args[0])
        launch(scripts)
      })
    })
  }
}

launch(['main.js'])