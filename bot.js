import * as baileys from '@adiwajshing/baileys'
import { Client, Utils } from '@neoxr/wb'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─────────────────────────────────────────
//  CONFIG — edit before running
// ─────────────────────────────────────────
const MY_NUMBER = '60197588090' // e.g. '60123456789' with country code, no +
const PREFIXES  = ['/', '!', '.']    // add or remove prefixes here
const TIMEZONE  = 'Asia/Kuching' // for timestamps in logs and TX IDs

// Commission message templates
const PROCESS_MSG = (txid, note) =>
  `🎨 *Commission Update!*\n\nHey! Just letting you know that your commission is now *in progress*.\nI'll update you once it's done!\n\nThank you for your patience 🙏` +
  (note ? `\n\n📝 _${note}_` : '')

const DONE_MSG = (txid, note) =>
  `✅ *Commission Done!*\n\nYour commission is *complete*! Please check the files I've sent.\n\nThank you so much for commissioning me! 💖` +
  (note ? `\n\n📝 _${note}_` : '')

// ─────────────────────────────────────────
//  PATHS
// ─────────────────────────────────────────
const IMAGES_DIR   = path.join(__dirname, 'images')
const BUILTIN_PATH = path.join(__dirname, 'commands', 'builtin.json')
const CUSTOM_PATH  = path.join(__dirname, 'commands', 'custom.json')
const CONFIG_PATH  = path.join(__dirname, 'config.json')
const QUEUE_PATH   = path.join(__dirname, 'queue.json')

for (const dir of [IMAGES_DIR, path.join(__dirname, 'commands'), path.join(__dirname, 'plugins'), path.join(__dirname, 'session')]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// ─────────────────────────────────────────
//  STORES
// ─────────────────────────────────────────
const loadConfig  = () => fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH)) : {}
const saveConfig  = d  => fs.writeFileSync(CONFIG_PATH, JSON.stringify(d, null, 2))
const loadQueue   = () => fs.existsSync(QUEUE_PATH)  ? JSON.parse(fs.readFileSync(QUEUE_PATH))  : {}
const saveQueue   = d  => fs.writeFileSync(QUEUE_PATH,  JSON.stringify(d, null, 2))
const loadBuiltin = () => JSON.parse(fs.readFileSync(BUILTIN_PATH))
const loadCustom  = () => JSON.parse(fs.readFileSync(CUSTOM_PATH))
const loadAll     = () => ({ ...loadBuiltin(), ...loadCustom() })
const saveCustom  = d  => fs.writeFileSync(CUSTOM_PATH, JSON.stringify(d, null, 2))

// ─────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────
function myJid() { return `${MY_NUMBER}@s.whatsapp.net` }

function genTxId() {
  const date = new Date().toLocaleDateString('en-MY', { timeZone: TIMEZONE, year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\//g, '')
  return `TX-${date}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
}

function nowGMT8() {
  return new Date().toLocaleString('en-MY', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function mentionText(jid) {
  return `@${jid.replace(/@.+/, '')}`
}

function msgText(m) {
  return (
    m?.message?.conversation ||
    m?.message?.extendedTextMessage?.text ||
    m?.message?.imageMessage?.caption ||
    ''
  ).trim()
}

function isImageMsg(m) { return !!m?.message?.imageMessage }

function quotedCtx(m) { return m?.message?.extendedTextMessage?.contextInfo || null }

function quotedMsg(m) {
  const ctx = quotedCtx(m)
  if (!ctx?.quotedMessage) return null
  return { key: { id: ctx.stanzaId, remoteJid: m.key.remoteJid, fromMe: ctx.participant === myJid() }, message: ctx.quotedMessage }
}

function quotedSenderJid(m) {
  const ctx = quotedCtx(m)
  if (!ctx) return null
  return ctx.participant || ctx.remoteJid || null
}

// ─────────────────────────────────────────
//  SEND HELPERS
// ─────────────────────────────────────────
async function sendText(client, jid, text, mentions = []) {
  await client.sendMessage(jid, { text, mentions })
}

async function editMsg(client, jid, key, newText) {
  try { await client.sendMessage(jid, { text: newText, edit: key }); return true }
  catch { return false }
}

async function sendCmd(client, jid, cmd) {
  const hasImage = cmd.image && fs.existsSync(path.join(IMAGES_DIR, cmd.image))
  if (hasImage) {
    const buf = fs.readFileSync(path.join(IMAGES_DIR, cmd.image))
    await client.sendMessage(jid, { image: buf, caption: cmd.caption || undefined })
    if (cmd.response?.trim()) await client.sendMessage(jid, { text: cmd.response })
  } else if (cmd.response?.trim()) {
    await client.sendMessage(jid, { text: cmd.response })
  } else if (cmd.caption?.trim()) {
    await client.sendMessage(jid, { text: cmd.caption })
  }
}

// ─────────────────────────────────────────
//  /ping
// ─────────────────────────────────────────
const BOT_START = Date.now()

async function handlePing(client, m) {
  const jid  = m.key.remoteJid
  const t0   = Date.now()
  const sent = await client.sendMessage(jid, { text: '🏓 pinging...' })
  const ping = Date.now() - t0

  const ms     = Date.now() - BOT_START
  const uptime = `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m ${Math.floor((ms%60000)/1000)}s`

  let neo = ''
  try { neo = execSync('neofetch --off 2>/dev/null', { timeout: 5000 }).toString().trim() }
  catch {
    try {
      const os   = execSync('uname -sr').toString().trim()
      const host = execSync('hostname').toString().trim()
      const cpu  = execSync("grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2").toString().trim()
      const mem  = execSync("free -h | awk '/^Mem:/{print $3\"/\"$2}'").toString().trim()
      neo = `OS: ${os}\nHost: ${host}\nCPU:${cpu}\nMemory: ${mem}`
    } catch { neo = '(system info unavailable)' }
  }

  await editMsg(client, jid, sent.key,
    `🏓 *Pong!*\n📶 Ping: *${ping}ms*\n⏱️ Uptime: *${uptime}*\n\n\`\`\`${neo}\`\`\``
  )
}

// ─────────────────────────────────────────
//  /process (/p) and /done (/d)
// ─────────────────────────────────────────
async function handleCommissionStatus(client, m, isDone) {
  const jid    = m.key.remoteJid
  const config = loadConfig()
  const logJid = config.logGroupJid
  const queue  = loadQueue()

  const fullText = msgText(m)
  const afterCmd = fullText.slice(fullText.indexOf(' ') + 1).trim()
  const cmdWord  = fullText.trim().split(/\s+/)[0].replace(/^[\/!.]/, '').toLowerCase()
  let txidArg = null, note = afterCmd
  if (isDone && /^TX-\d{6}-[A-Z0-9]{4}$/i.test(afterCmd.split(/\s+/)[0])) {
    txidArg = afterCmd.split(/\s+/)[0].toUpperCase()
    note    = afterCmd.slice(txidArg.length).trim()
  }
  const hasNote = !!note && note !== cmdWord

  const isGroup      = jid.endsWith('@g.us')
  const quoted       = quotedMsg(m)
  const quotedSender = quotedSenderJid(m)
  let targetJid = null, targetNum = null

  if (quoted && quotedSender) {
    targetJid = quotedSender.includes('@') ? quotedSender : `${quotedSender}@s.whatsapp.net`
    targetNum = targetJid.replace(/@.+/, '')
  } else if (!isGroup) {
    targetJid = jid
    targetNum = jid.replace(/@.+/, '')
  } else {
    return sendText(client, jid, `⚠️ Reply to a customer's message with */${isDone ? 'd' : 'p'}* to send them the update.`)
  }

  const timestamp = nowGMT8()

  if (!isDone) {
    const txid    = genTxId()
    const template = PROCESS_MSG(txid, hasNote ? note : null)
    await client.sendMessage(targetJid, { text: template })
    queue[txid] = { targetJid, targetNum, note: hasNote ? note : null, startedAt: timestamp }
    saveQueue(queue)

    if (logJid) {
      await client.sendMessage(logJid, {
        text: `🎨 *Commission Started*\n🔖 TX ID: *${txid}*\n👤 Customer: ${mentionText(targetJid)}\n🕐 Time: ${timestamp}\n` + (hasNote ? `📝 Note: ${note}` : ''),
        mentions: [targetJid]
      })
    }

    const confirm = `🎨 Sent *in-progress* to +${targetNum}\n🔖 TX ID: *${txid}*\n` +
      (hasNote ? `📝 Note: ${note}\n` : '') +
      (logJid ? `📋 Logged to GC.` : `⚠️ No log GC set — use /setgc in your group.`)
    await editMsg(client, jid, m.key, confirm) || await sendText(client, jid, confirm)

  } else {
    const openEntries = Object.entries(queue).filter(([, v]) => v.targetNum === targetNum)
    if (!openEntries.length) return sendText(client, jid, `⚠️ No open commissions for +${targetNum}.\n\nCheck */queuestatus*.`)

    let txid, entry
    if (openEntries.length === 1) {
      [txid, entry] = openEntries[0]
    } else if (txidArg) {
      const found = openEntries.find(([id]) => id === txidArg)
      if (!found) {
        const list = openEntries.map(([id, v]) => `  🔖 ${id}${v.note ? ` — ${v.note}` : ''}`).join('\n')
        return sendText(client, jid, `⚠️ TX *${txidArg}* not found for +${targetNum}.\n\nOpen TXs:\n${list}`)
      }
      [txid, entry] = found
    } else {
      const list = openEntries.map(([id, v]) => `  🔖 ${id}${v.note ? ` — ${v.note}` : ''}`).join('\n')
      return sendText(client, jid, `⚠️ +${targetNum} has *${openEntries.length}* open TXs. Specify one:\n\n${list}\n\nUsage: */d TX-XXXXXX-XXXX note*`)
    }

    await client.sendMessage(targetJid, { text: DONE_MSG(txid, hasNote ? note : null) })
    delete queue[txid]
    saveQueue(queue)

    if (logJid) {
      await client.sendMessage(logJid, {
        text: `✅ *Commission Done*\n🔖 TX ID: *${txid}*\n👤 Customer: ${mentionText(targetJid)}\n🕐 Completed: ${timestamp}\n🕐 Started: ${entry.startedAt}\n` +
          (entry.note ? `📝 Original note: ${entry.note}\n` : '') +
          (hasNote ? `📝 Closing note: ${note}` : ''),
        mentions: [targetJid]
      })
    }

    const confirm = `✅ Sent *done* to +${targetNum}\n🔖 TX ID: *${txid}*\n` +
      (hasNote ? `📝 Note: ${note}\n` : '') +
      (logJid ? `📋 Logged to GC.` : `⚠️ No log GC set — use /setgc in your group.`)
    await editMsg(client, jid, m.key, confirm) || await sendText(client, jid, confirm)
  }
}

// ─────────────────────────────────────────
//  /queuestatus
// ─────────────────────────────────────────
async function handleQueueStatus(client, m) {
  const jid     = m.key.remoteJid
  const entries = Object.entries(loadQueue())
  if (!entries.length) return sendText(client, jid, `📋 *Commission Queue*\n\n✨ All clear! No commissions in progress.`)
  let text = `📋 *Commission Queue* (${entries.length} in progress)\n`
  for (const [txid, e] of entries) {
    text += `━━━━━━━━━━━━━━━━━━━━\n🔖 *${txid}*\n👤 +${e.targetNum}\n🕐 ${e.startedAt}\n`
    if (e.note) text += `📝 ${e.note}\n`
  }
  text += `━━━━━━━━━━━━━━━━━━━━`
  await sendText(client, jid, text)
}

// ─────────────────────────────────────────
//  /setgc
// ─────────────────────────────────────────
async function handleSetGc(client, m) {
  const jid = m.key.remoteJid
  if (!jid.endsWith('@g.us')) return sendText(client, jid, '⚠️ Send */setgc* from inside the group you want as the log group.')
  const config = loadConfig()
  config.logGroupJid = jid
  saveConfig(config)
  let name = jid
  try { const meta = await client.groupMetadata(jid); name = meta.subject } catch {}
  await sendText(client, jid, `✅ Log group set to *${name}*!`)
}

// ─────────────────────────────────────────
//  STANDARD COMMAND HANDLER
// ─────────────────────────────────────────
async function handleUserCommand(client, m, cmdName) {
  const jid = m.key.remoteJid
  const cmd = loadAll()[cmdName]
  if (!cmd) return sendText(client, jid, `❓ Unknown command: */${cmdName}*\n\nSend */listcmds* to see all.`)
  const textContent = cmd.response || cmd.caption
  if (textContent) {
    const edited = await editMsg(client, jid, m.key, textContent)
    if (!edited || cmd.image) await sendCmd(client, jid, cmd)
  } else {
    await sendCmd(client, jid, cmd)
  }
}

// ─────────────────────────────────────────
//  MANAGEMENT HANDLERS
// ─────────────────────────────────────────
async function handleAddCmd(client, m, args) {
  const jid   = m.key.remoteJid
  const parts = args.join(' ').split('|').map(s => s.trim())
  if (parts.length < 3) return sendText(client, jid, '⚠️ Usage:\n*/addcmd <n> | <description> | <response>*')
  const [name, description, ...rest] = parts
  const cmdName = name.toLowerCase().replace(/^[\/!.]/, '')
  if (loadBuiltin()[cmdName]) return sendText(client, jid, `⚠️ */${cmdName}* is built-in and cannot be overwritten.`)
  const custom = loadCustom()
  custom[cmdName] = { description, response: rest.join('|').trim(), image: null, caption: null }
  saveCustom(custom)
  await sendText(client, jid, `✅ */${cmdName}* saved!`)
}

async function handleDelCmd(client, m, args) {
  const jid     = m.key.remoteJid
  const cmdName = (args[0] || '').toLowerCase().replace(/^[\/!.]/, '')
  if (!cmdName) return sendText(client, jid, '⚠️ Usage: `/delcmd <n>`')
  const custom = loadCustom()
  if (!custom[cmdName]) return sendText(client, jid, `⚠️ */${cmdName}* not found.`)
  delete custom[cmdName]
  saveCustom(custom)
  await sendText(client, jid, `🗑️ */${cmdName}* deleted.`)
}

async function handleListCmds(client, m) {
  const jid     = m.key.remoteJid
  const builtin = loadBuiltin()
  const custom  = loadCustom()
  const config  = loadConfig()
  const qCount  = Object.keys(loadQueue()).length
  let text = '📋 *Commands*\n\n*Built-in:*\n'
  for (const [n, d] of Object.entries(builtin)) text += `  /${n}${d.image ? ' 🖼️' : ''} — ${d.description}\n`
  text += '\n*Commission:*\n'
  text += '  /p [note] — Mark in progress\n'
  text += '  /d [txid] [note] — Mark done\n'
  text += `  /queuestatus — In-progress list (${qCount} now)\n`
  text += `  /setgc — Set log group${config.logGroupJid ? ' ✅' : ''}\n`
  text += '\n*Custom:*\n'
  const entries = Object.entries(custom)
  if (!entries.length) text += '  _(none yet)_\n'
  else for (const [n, d] of entries) text += `  /${n}${d.image ? ' 🖼️' : ''} — ${d.description}\n`
  text += '\n*Management:*\n'
  text += '  /addcmd <n> | <desc> | <response>\n'
  text += '  /delcmd <n>\n'
  text += '  /setimage <n> | <caption>  ← reply to image\n'
  text += '  /removeimage <n>\n'
  text += '  /listcmds\n'
  text += '\n_(🖼️ = has image)_'
  await sendText(client, jid, text)
}

async function handleSetImage(client, m, args) {
  const jid     = m.key.remoteJid
  const parts   = args.join(' ').split('|').map(s => s.trim())
  const cmdName = (parts[0] || '').toLowerCase().replace(/^[\/!.]/, '')
  const caption = parts[1] || null
  if (!cmdName) return sendText(client, jid, '⚠️ Reply to an image then send:\n*/setimage <n> | <caption (optional)>*')

  const quoted        = quotedMsg(m)
  const quotedIsImage = quoted?.message?.imageMessage
  const currentIsImg  = isImageMsg(m)
  let buf = null

  if (quotedIsImage) buf = await baileys.downloadMediaMessage({ key: quoted.key, message: quoted.message }, 'buffer', {})
  else if (currentIsImg) buf = await baileys.downloadMediaMessage(m, 'buffer', {})
  else return sendText(client, jid, '⚠️ No image found. Reply to an image with:\n*/setimage <n> | <caption>*')

  if (!loadAll()[cmdName]) return sendText(client, jid, `⚠️ */${cmdName}* doesn't exist. Create it with */addcmd*.`)

  const filename = `${cmdName}.jpg`
  fs.writeFileSync(path.join(IMAGES_DIR, filename), buf)
  const custom  = loadCustom()
  const builtin = loadBuiltin()
  if (custom[cmdName]) { custom[cmdName].image = filename; custom[cmdName].caption = caption }
  else custom[cmdName] = { ...builtin[cmdName], image: filename, caption }
  saveCustom(custom)
  await sendText(client, jid, `✅ Image saved for */${cmdName}*!${caption ? `\n💬 ${caption}` : ''}\n\nTest with */${cmdName}*`)
}

async function handleRemoveImage(client, m, args) {
  const jid     = m.key.remoteJid
  const cmdName = (args[0] || '').toLowerCase().replace(/^[\/!.]/, '')
  if (!cmdName) return sendText(client, jid, '⚠️ Usage: `/removeimage <n>`')
  const custom = loadCustom()
  if (!custom[cmdName]) return sendText(client, jid, `⚠️ */${cmdName}* not found.`)
  custom[cmdName].image = null; custom[cmdName].caption = null
  saveCustom(custom)
  await sendText(client, jid, `🗑️ Image removed from */${cmdName}*.`)
}

// ─────────────────────────────────────────
//  ROUTER
// ─────────────────────────────────────────
async function route(client, m) {
  // Only handle own messages
  if (!m.key.fromMe) return
  const text = msgText(m)
  const matchedPrefix = PREFIXES.find(p => text.startsWith(p))
  if (!matchedPrefix) return

  const [rawCmd, ...args] = text.slice(matchedPrefix.length).trim().split(/\s+/)
  const cmd = rawCmd.toLowerCase()
  console.log(`[${new Date().toISOString()}] ${matchedPrefix}${cmd}`, args.length ? args : '')

  switch (cmd) {
    case 'ping':              return handlePing(client, m)
    case 'process': case 'p': return handleCommissionStatus(client, m, false)
    case 'done':    case 'd': return handleCommissionStatus(client, m, true)
    case 'queuestatus':       return handleQueueStatus(client, m)
    case 'setgc':             return handleSetGc(client, m)
    case 'addcmd':            return handleAddCmd(client, m, args)
    case 'delcmd':            return handleDelCmd(client, m, args)
    case 'listcmds':          return handleListCmds(client, m)
    case 'setimage':          return handleSetImage(client, m, args)
    case 'removeimage':       return handleRemoveImage(client, m, args)
    default:                  return handleUserCommand(client, m, cmd)
  }
}

// ─────────────────────────────────────────
//  INIT — @neoxr/wb Client
// ─────────────────────────────────────────
const waSocket = new Client({
  plugsdir: 'plugins',
  presence: true,
  online: true,
  bypass_disappearing: true,
  pairing: {
    state: true,
    number: MY_NUMBER,
    code: 'COMBOT01'
  },
  create_session: {
    type: 'local',
    session: 'session',
  },
  custom_id: 'commission-bot',
  bot: (id) => {
    return (id.startsWith('3EB0') && id.length === 40) || id.startsWith('BAE') || /[-]/.test(id)
  },
  engines: [baileys],
  debug: false
}, {
  browser: ['Ubuntu', 'Firefox', '20.0.00'],
  shouldIgnoreJid: jid => /(newsletter|bot)/.test(jid)
})

// @neoxr/wb emits events on the Client instance directly
waSocket.on('open', ({ client }) => {
  console.log(`\n✅ Bot connected! Listening on ${MY_NUMBER}\n`)
})

waSocket.on('close', () => {
  console.log('⚠️  Disconnected.')
})

waSocket.on('messages', async ({ client, messages }) => {
  for (const m of messages) {
    try {
      await route(client, m)
    } catch (err) {
      console.error('Handler error:', err)
    }
  }
})
