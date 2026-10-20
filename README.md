# Pain Bot

**By Sunkovv**

<p align="center">
  <a href="https://chat.whatsapp.com/DlkiS0Xmqby3Rc8EBlL7k7">
    <img src="https://img.shields.io/badge/Comunidad-WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Comunidad de WhatsApp">
  </a>
  <a href="https://clientes.nexcodea.com/">
    <img src="https://img.shields.io/badge/Hosting%20para%20bot-barato-111827?style=for-the-badge&logo=icloud&logoColor=white" alt="Hosting para bot barato">
  </a>
</p>

- **Comunidad de WhatsApp:** [unirse al grupo](https://chat.whatsapp.com/DlkiS0Xmqby3Rc8EBlL7k7)
- **Hosting para bot barato:** [clientes.nexcodea.com](https://clientes.nexcodea.com/)

Bot de WhatsApp multi-dispositivo (Baileys). Descargas, IA, administración de grupos, RPG, stickers y más.

SQLite usa un módulo nativo que debe instalarse para el sistema operativo del servidor.
Sharp también necesita su runtime opcional para la plataforma. No copies `node_modules`
de Windows a Linux ni entre arquitecturas.

```
git clone https://github.com/nexusday/pain-bot.git
cd pain-bot
npm install
npm start
```

| | |
|---|---|
| **Repositorio** | [github.com/nexusday/pain-bot](https://github.com/nexusday/pain-bot) |
| **Comunidad** | [Grupo de WhatsApp](https://chat.whatsapp.com/DlkiS0Xmqby3Rc8EBlL7k7) |
| **Hosting** | [NexCodea — hosting para bot barato](https://clientes.nexcodea.com/) |
| **Runtime** | Node.js 20.17+ |
| **Dependencias** | Instalar en el sistema operativo donde correrá el bot |
| **Licencia** | GPL-3.0-or-later |

---

## Índice

1. [Requisitos](#requisitos)
2. [Inicio rápido](#inicio-rápido)
3. [Termux](#termux)
4. [Vincular cuenta](#vincular-cuenta)
5. [PM2 en Termux](#pm2-en-termux)
6. [Configuración](#configuración)
7. [Uso](#uso)
8. [Estructura](#estructura)
9. [Actualizar](#actualizar)
10. [Problemas frecuentes](#problemas-frecuentes)
11. [Aviso y créditos](#aviso-y-créditos)

---

## Requisitos

| Componente | Detalle |
|------------|---------|
| Node.js | 20.17 o superior |
| Git | versión reciente |
| FFmpeg | recomendado (audio, video, stickers) |
| npm | instala los módulos nativos para la plataforma actual |

No reutilices `node_modules` instalado en otro sistema operativo: incluye el binario
nativo de SQLite y debe corresponder a Linux, Windows o Termux donde se ejecutará.

---

## Inicio rápido

Windows, Linux o macOS:

```bash
git clone https://github.com/nexusday/pain-bot.git
cd pain-bot
npm install
npm start
```

`npm install` prepara las dependencias y el módulo nativo SQLite para este sistema.
Al iniciar, `npm start` valida que Sharp pueda procesar una imagen. Si falta el runtime,
instala las dependencias opcionales de la plataforma (incluido Linux x64 en Pterodactyl);
si la instalación falla, detiene el arranque y muestra el error en vez de dejar que fallen
los plugins de imágenes durante su recarga.

En Debian/Ubuntu, si te falta FFmpeg:

```bash
sudo apt update
sudo apt install -y ffmpeg git
```

El comando `npm start` comprueba el módulo nativo `sqlite3` y fija la versión 5.1.7 para
evitar que una actualización descargue el binario 6.x incompatible con la GLIBC
de algunos contenedores. Si el precompilado de la plataforma no sirve, compila
SQLite desde el código fuente local y muestra el diagnóstico completo si falla.
Si necesitas repetir la comprobación manualmente:

```bash
node scripts/ensure-sqlite.js
```

---

## Termux

### Preparar el entorno

Termux desde [F-Droid](https://f-droid.org/packages/com.termux/). Luego:

```bash
termux-setup-storage
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git ffmpeg
```

Verifica:

```bash
node -v && git --version
```

### Clonar y arrancar

Instala las dependencias en Termux para compilar/seleccionar los módulos nativos:

```bash
cd ~
git clone https://github.com/nexusday/pain-bot.git
cd pain-bot
npm install
npm start
```

Si ya clonaste el proyecto en Termux y necesitas reparar dependencias:

```bash
npm install --no-bin-links
```

---

## Vincular cuenta

El método principal de vinculación es por **código de 8 dígitos** (pairing code). No hace falta escanear QR.

### Arranque

```bash
cd pain-bot   # o: cd ~/pain-bot en Termux
npm start
```

### Pasos en la terminal

1. Cuando pregunte el método de sesión, escribe:

```text
code
```

2. Ingresa el número del WhatsApp que usará el bot, **con código de país y sin símbolos**:

```text
51999999999
```

3. La terminal mostrará un código de **8 caracteres** (ej. `ABCD-EFGH`).

### Pasos en WhatsApp (teléfono)

1. Abre WhatsApp en el dispositivo del número indicado  
2. **Ajustes → Dispositivos vinculados → Vincular un dispositivo**  
3. Elige **Vincular con número de teléfono**  
4. Escribe el código de 8 dígitos que salió en la terminal  

La sesión se guarda en `Sessions/`. Conserva esa carpeta si no quieres volver a vincular.

> Tip: la primera vinculación hazla con `npm start` en primer plano para copiar el código con calma. Después puedes pasar a PM2.

Detener el proceso: `Ctrl + C`.

---

## PM2 en Termux

Para mantener el bot en segundo plano sin dejar la terminal abierta:

```bash
npm install -g pm2
cd ~/pain-bot
```

**Importante:** vincula primero con `npm start` y el código. Cuando la sesión ya esté en `Sessions/`:

```bash
pm2 start index.js --name painbot
pm2 save
```

| Comando | Acción |
|---------|--------|
| `pm2 status` | Estado del proceso |
| `pm2 logs painbot` | Logs en vivo |
| `pm2 restart painbot` | Reiniciar |
| `pm2 stop painbot` | Detener |
| `pm2 delete painbot` | Eliminar de PM2 |

Recuperar PM2 al reabrir Termux:

```bash
pm2 startup
pm2 save
```

Desactiva la optimización de batería para Termux en Android; si no, el sistema puede matar el proceso.

---

## Configuración

Edita `config.js` (mejor con el bot detenido al cambiar owners):

| Variable | Descripción |
|----------|-------------|
| `global.owner` | Owners: `['codigoPaisNumero', 'Nombre', true]` |
| `global.namebot` | Nombre del bot |
| `global.packname` | Nombre en stickers |
| `global.author` | Autor |
| `global.moneda` | Moneda del RPG |
| `global.APIs` | APIs externas |

```js
global.owner = [
  ['51999999999', 'TuNombre', true],
]
```

Sin `+`, espacios ni guiones en el número.

---

## Uso

Prefijo por defecto: `.`

```text
.menu
.menu2
.play nombre de canción
.video búsqueda o enlace
.ia mensaje
.s
```

Más comandos en `.menu` / `.menu2` dentro del chat.

---

## Estructura

```text
pain-bot/
├── config.js         Configuración global
├── index.js          Entrada
├── main.js           Conexión y ciclo
├── handler.js        Mensajes y comandos
├── plugins/          Comandos (hot reload)
├── lib/              Utilidades y modos
├── node_modules/     Dependencias instaladas para esta plataforma
├── storage/          Datos persistentes
├── Sessions/         Sesión de WhatsApp (no versionar)
└── package.json
```

Los plugins suelen recargarse al guardar. Si no aparece uno nuevo, reinicia con `npm start` o `pm2 restart painbot`.

Solo existe `/pri 1`: el bot principal tiene su proceso y todos los sub-bots
comparten un único worker. `/pri 2` fue retirado y cualquier modo antiguo
guardado se ignora. El procesamiento de imágenes usa un hilo libvips por
operación por defecto; puedes ajustar ese límite con `PAIN_SHARP_CONCURRENCY`.

---

## Actualizar

```bash
cd pain-bot
git pull origin main
npm install
npm start
# o: pm2 restart painbot
```

Ejecuta `npm install` también después de actualizar: el módulo nativo de SQLite
debe coincidir con la plataforma del servidor.

Haz backup de `Sessions/` y de tu `config.js` antes de un `git pull` si tocaste owners o APIs.

---

## Problemas frecuentes

**No sale el código de vinculación**  
Escribe `code` (no `qr`) cuando pregunte el método. Cierra otras instancias del bot y vuelve a `npm start`.

**El código expira o no se acepta**  
Pide uno nuevo reiniciando. En WhatsApp usa *Vincular con número de teléfono*, no el escáner de cámara.

**Error de módulos / “Cannot find module”**  
Instala las dependencias para la plataforma actual:

```bash
# PC
npm install

# Termux
npm install --no-bin-links
```
**Sesión cerrada / logged out**

```bash
rm -rf Sessions
npm start
```

Vuelve a vincular con el código de 8 dígitos.

**El bot no responde en un grupo**  
Revisa si está desactivado, silenciado o si faltan permisos de admin para comandos de grupo.

**Termux se cierra solo**  
Ajustes de Android → sin optimización de batería para Termux.

---

## Aviso y créditos

Uso personal o educativo. Respeta las [políticas de WhatsApp](https://www.whatsapp.com/legal) y la ley de tu país. El uso indebido de automatización puede banear la cuenta vinculada; conviene un número secundario.

| | |
|---|---|
| **Proyecto** | Pain Bot |
| **By** | Sunkovv |
| **Núcleo** | [Baileys](https://github.com/WhiskeySockets/Baileys) (WhiskeySockets) |
| **Repositorio** | https://github.com/nexusday/pain-bot.git |

---

*Pain Bot — By Sunkovv*
# Sub-bot process layout

The main bot runs in its own process. Sub-bots are split across several
supervised workers (5 by default, `PAIN_SUBBOT_WORKERS`).
`/pri 2` and per-sub-bot worker mode have been removed to keep process count and
CPU overhead predictable.

**Los sub-bots esperan al principal.** Si el bot principal no tiene sesión
registrada (estás emparejando con un código de 8 dígitos), los workers de
sub-bots no arrancan: no se conecta nada hasta que termines el emparejamiento.
En cuanto el principal queda vinculado, los sub-bots arrancan solos. Después de
eso la compuerta ya no interviene: si el principal se desvincula más tarde, los
sub-bots **siguen conectados y funcionando**.

**`/subme <mensaje>`** no lo manda el principal a los sub-bots: **cada sub-bot
abre su propio chat privado con quien ejecutó el comando y le escribe ahí**. El
owner recibe un mensaje por sub-bot en su privado, y el bot le confirma cuántos
escribieron y cuántos fallaron.

---

# Memoria con muchos sub-bots

Con 150+ sub-bots la RAM la consuma el proceso, no el bot. Por eso ahora:

- Se podan por proceso los chats inactivos (150 por socket), la metadata de
  grupos (60 por socket) y el caché de mensajes (4 000 por proceso, 50 por chat).
- Se quitan las miniaturas (jpeg/png) de los mensajes cacheados: eran el bloque
  más pesado y ningún comando las usaba.
- Se libera el modelo de voz (Whisper) tras 5 min sin audio y se ejecuta GC
  cuando el heap supera 350 MB.
- Se limita el heap de cada proceso: 896 MB por worker y 1 GB para el principal.
  Si un worker se pasa, el supervisor lo reinicia solo.

Diagnóstico: `/mem` y `/mem limpiar` (fuerza poda y GC en el proceso actual).

| Variable | Por defecto | Para qué |
|---|---|---|
| `PAIN_SUBBOT_WORKERS` | `5` | Cuántos workers reparten los sub-bots |
| `PAIN_WORKER_HEAP_MB` | `896` | Tope de heap por worker |
| `PAIN_PRIMARY_HEAP_MB` | `1024` | Tope de heap del proceso principal |
| `PAIN_MAX_CHATS_SOCKET` | `150` | Chats guardados por socket |
| `PAIN_MAX_GROUP_META` | `400` | Metadata de grupos en caché por proceso |
| `PAIN_MAX_MSG_CACHE` | `4000` | Mensajes cacheados por proceso |
| `PAIN_MAX_MSG_CHAT` | `50` | Mensajes cacheados por chat |
| `PAIN_GROUP_META_TTL_MS` | `1800000` | Antigüedad máxima de la metadata de un grupo |
| `PAIN_GC_MIN_MB` | `350` | Heap a partir del cual se fuerza GC |
| `PAIN_RSS_ALERT_MB` | `1200` | RSS del proceso que activa la poda agresiva |
| `PAIN_STT_IDLE_MS` | `300000` | Tiempo sin audio para descargar el modelo de voz |
| `PAIN_MAX_IA_CHATS` | `300` | Chats con memoria de IA por proceso |
