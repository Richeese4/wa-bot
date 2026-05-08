const P = require("pino")
const qrcode = require("qrcode-terminal")
const fs = require("fs")
const express = require("express")
const mongoose = require("mongoose")

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser // Ditambahkan untuk normalisasi ID
} = require("@whiskeysockets/baileys")

// =========================
// CONFIG
// =========================
const OWNER_KEY = "freewilly123"
const OWNER_NUMBER = "6282162625200"

// =========================
// MONGO CONNECT
// =========================
const MONGO_URI = "mongodb+srv://znoidfamz_db_user:hHoRUaiak5EuQAft@znoidfamz.svbkerf.mongodb.net/bot?retryWrites=true&w=majority"
mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 })
  .then(() => console.log("MongoDB CONNECTED"))
  .catch(err => console.log("MongoDB ERROR:", err.message))

// =========================
// DATABASE SCHEMAS
// =========================
const User = mongoose.model("User", new mongoose.Schema({
  key: String,
  role: { type: String, default: "user" },
  expired: Number,
  createdAt: Number
}))

const Session = mongoose.model("Session", new mongoose.Schema({
  group: String,
  admin: String,
  role: String,
  key: String,
  expired: Number,
  loginAt: Number
}))

const GroupSettings = mongoose.model("GroupSettings", new mongoose.Schema({
  group: String,
  antilink: { type: Boolean, default: false },
  maxwarn: { type: Number, default: 3 },
  filterchat: { type: [String], default: [] },
  warns: { type: Object, default: {} }
}))

// =========================
// EXPRESS
// =========================
const app = express()
app.get("/", (_, res) => res.send("BOT ACTIVE"))
app.listen(3000, () => console.log("Express Running"))

// =========================
// UTILS
// =========================
function format(ms) {
  if (!ms || ms === 9999999999999) return "Permanent"
  return new Date(ms).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
}

function isLink(text) {
  const regex = /(https?:\/\/|chat\.whatsapp\.com|wa\.me)/gi
  return regex.test(text)
}

// =========================
// START BOT
// =========================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
    if (qr) qrcode.generate(qr, { small: true })
    if (connection === "open") console.log("BOT ONLINE")
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
    }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0]
      if (!msg.message || msg.key.remoteJid === "status@broadcast") return

      const from = msg.key.remoteJid
      const isGroup = from.endsWith("@g.us")
      
      // FIX: Normalisasi ID Pengirim
      const sender = isGroup ? jidNormalizedUser(msg.key.participant) : jidNormalizedUser(from)
      const botId = jidNormalizedUser(sock.user.id)

      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
      if (!text && !msg.message.stickerMessage) return

      const cmd = text.trim()
      const command = cmd.split(" ")[0].toLowerCase()

      // =========================
      // GET SETTINGS
      // =========================
      let settings = isGroup ? await GroupSettings.findOne({ group: from }) : null
      if (isGroup && !settings) settings = await GroupSettings.create({ group: from })

      // =========================
      // ADMIN CHECK (FIXED)
      // =========================
      let isAdmin = false
      let botAdmin = false

      if (isGroup) {
        const meta = await sock.groupMetadata(from)
        const member = meta.participants.find(x => jidNormalizedUser(x.id) === sender)
        const botObj = meta.participants.find(x => jidNormalizedUser(x.id) === botId)

        isAdmin = member?.admin === "admin" || member?.admin === "superadmin"
        botAdmin = botObj?.admin === "admin" || botObj?.admin === "superadmin"
      }

      // =========================
      // SECURITY & FILTER (RUN BEFORE COMMANDS)
      // =========================
      if (isGroup && !msg.key.fromMe) { // Jangan filter pesan bot sendiri
        
        // 1. FILTER KATA (Hanya untuk non-admin)
        if (settings.filterchat.length > 0 && !isAdmin) {
          const isBadWord = settings.filterchat.some(word => text.toLowerCase().includes(word.toLowerCase()))
          if (isBadWord) {
            return await sock.sendMessage(from, { delete: msg.key })
          }
        }

        // 2. ANTILINK (Hanya untuk non-admin & non-owner)
        if (settings.antilink && isLink(text) && !isAdmin && !sender.includes(OWNER_NUMBER)) {
          if (botAdmin) {
            await sock.sendMessage(from, { delete: msg.key })
            
            let warns = settings.warns || {}
            warns[sender] = (warns[sender] || 0) + 1
            settings.warns = warns
            settings.markModified('warns')
            await settings.save()

            if (warns[sender] >= settings.maxwarn) {
              await sock.sendMessage(from, { text: `🚫 @${sender.split("@")[0]} terdepak karena spam link`, mentions: [sender] })
              await sock.groupParticipantsUpdate(from, [sender], "remove")
              delete warns[sender]; settings.markModified('warns'); await settings.save()
            } else {
              return sock.sendMessage(from, { text: `⚠️ Warning ${warns[sender]}/${settings.maxwarn}\nJangan kirim link!`, mentions: [sender] })
            }
            return
          }
        }
      }

      // =========================
      // SESSION SYSTEM
      // =========================
      let session = isGroup ? await Session.findOne({ group: from }) : null
      if (!session && command.startsWith(".") && command !== ".login") {
        if (!isGroup) return
        return sock.sendMessage(from, { text: "❌ Admin group belum login\n\nSilahkan login:\n.login key" })
      }

      // =========================
      // COMMANDS
      // =========================
      if (command === ".login") {
        if (!isGroup) return sock.sendMessage(from, { text: "❌ Gunakan di grup" })
        const inputKey = cmd.split(" ")[1]
        if (!inputKey) return sock.sendMessage(from, { text: ".login KEY-XXXX" })

        const isOwner = inputKey === OWNER_KEY
        if (!isAdmin && !isOwner) return sock.sendMessage(from, { text: "❌ Hanya admin grup" })

        if (isOwner) {
          await Session.findOneAndUpdate({ group: from }, { group: from, admin: sender, role: "owner", key: inputKey, expired: 9999999999999, loginAt: Date.now() }, { upsert: true })
          return sock.sendMessage(from, { text: "👑 OWNER LOGIN SUCCESS\n✅ Bot aktif" })
        }

        const data = await User.findOne({ key: inputKey.trim().toUpperCase() })
        if (!data || Date.now() > data.expired) return sock.sendMessage(from, { text: "❌ Key invalid/expired" })

        await Session.findOneAndUpdate({ group: from }, { group: from, admin: sender, role: data.role, key: data.key, expired: data.expired, loginAt: Date.now() }, { upsert: true })
        return sock.sendMessage(from, { text: `✅ LOGIN SUCCESS\n👮 Admin: @${sender.split("@")[0]}`, mentions: [sender] })
      }

      // Re-fetch session
      session = isGroup ? await Session.findOne({ group: from }) : null
      if (!session) return
      const currentRole = session.role || "user"

      if (command === ".menu") {
        let menuTxt = `📌 MENU (${currentRole.toUpperCase()})\n\n.antilink on/off\n.filterchat add/del\n.kick\n.sticker\n.masaaktif`
        return sock.sendMessage(from, { text: menuTxt })
      }

      if (command === ".filterchat") {
        if (currentRole === "user" || !isAdmin) return
        const action = cmd.split(" ")[1]
        const word = cmd.split(" ").slice(2).join(" ")
        if (!action || !word) return sock.sendMessage(from, { text: ".filterchat add/del kata" })

        if (action === "add") {
          if (!settings.filterchat.includes(word)) {
            settings.filterchat.push(word)
            await settings.save()
          }
          return sock.sendMessage(from, { text: `✅ Kata "${word}" ditambahkan ke filter.` })
        }
        if (action === "del") {
          settings.filterchat = settings.filterchat.filter(x => x !== word)
          await settings.save()
          return sock.sendMessage(from, { text: `✅ Kata "${word}" dihapus dari filter.` })
        }
      }

      if (command === ".antilink") {
        if (currentRole === "user" || !isAdmin) return
        const val = cmd.split(" ")[1]
        if (!["on", "off"].includes(val)) return sock.sendMessage(from, { text: ".antilink on/off" })
        settings.antilink = val === "on"
        await settings.save()
        return sock.sendMessage(from, { text: `✅ Antilink berhasil di ${val}` })
      }

      // Tambahkan handler command lain di sini...

    } catch (e) { console.log("ERROR:", e) }
  })
}

startBot()
