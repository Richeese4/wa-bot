const P = require("pino")
const qrcode = require("qrcode-terminal")
const fs = require("fs")
const express = require("express")
const mongoose = require("mongoose")

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
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
// EXPRESS SERVER
// =========================
const app = express()
app.get("/", (_, res) => res.send("BOT ACTIVE"))
app.listen(3000, () => console.log("Express Running on Port 3000"))

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
    auth: state,
    printQRInTerminal: false
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
    if (qr) qrcode.generate(qr, { small: true })
    if (connection === "open") console.log("✅ BOT ONLINE")
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
    }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0]
      if (!msg.message || msg.key.remoteJid === "status@broadcast") return
      if (msg.key.fromMe) return // Hindari bot memproses pesannya sendiri

      const from = msg.key.remoteJid
      const sender = (msg.key.participant || from).split(":")[0] + "@s.whatsapp.net"
      const isGroup = from.endsWith("@g.us")
      const botNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net"

      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
      const command = text.trim().split(" ")[0].toLowerCase()

      // =========================
      // SETTINGS & REALTIME ADMIN CHECK
      // =========================
      let settings = await GroupSettings.findOne({ group: from })
      if (!settings && isGroup) settings = await GroupSettings.create({ group: from })

      let isAdmin = false
      let botAdmin = false

      if (isGroup) {
        // Ambil metadata grup (Jika gagal deteksi admin, Baileys butuh fetch ulang)
        const groupMetadata = await sock.groupMetadata(from).catch(() => null)
        if (groupMetadata) {
          const participants = groupMetadata.participants
          isAdmin = participants.find(p => p.id === sender)?.admin !== null && participants.find(p => p.id === sender)?.admin !== undefined
          botAdmin = participants.find(p => p.id === botNumber)?.admin !== null && participants.find(p => p.id === botNumber)?.admin !== undefined
        }
      }

      // =========================
      // LOGIKA FILTER CHAT (ANTI-SELF-DELETE)
      // =========================
      if (isGroup && settings?.filterchat?.length > 0 && !isAdmin && !command.startsWith(".filterchat")) {
        const lowerText = text.toLowerCase()
        const hasBadWord = settings.filterchat.some(word => lowerText.includes(word.toLowerCase()))
        if (hasBadWord) {
          return await sock.sendMessage(from, { delete: msg.key })
        }
      }

      // =========================
      // LOGIKA ANTILINK (STRICT ADMIN)
      // =========================
      if (isGroup && settings?.antilink && isLink(text) && !isAdmin && sender !== OWNER_NUMBER + "@s.whatsapp.net") {
        if (botAdmin) {
          await sock.sendMessage(from, { delete: msg.key })
          
          let warns = settings.warns || {}
          warns[sender] = (warns[sender] || 0) + 1
          settings.warns = warns
          settings.markModified('warns')
          await settings.save()

          if (warns[sender] >= settings.maxwarn) {
            await sock.sendMessage(from, {
              text: `🚫 @${sender.split("@")[0]} dikeluarkan karena limit link tercapai!`,
              mentions: [sender]
            })
            await sock.groupParticipantsUpdate(from, [sender], "remove")
            delete warns[sender]
            settings.markModified('warns')
            await settings.save()
          } else {
            return sock.sendMessage(from, {
              text: `⚠️ Warning ${warns[sender]}/${settings.maxwarn}\nJangan kirim link!\nSisa kesempatan: ${settings.maxwarn - warns[sender]}`,
              mentions: [sender]
            })
          }
          return
        }
      }

      // =========================
      // COMMANDS HANDLER
      // =========================
      let session = isGroup ? await Session.findOne({ group: from }) : null

      if (command === ".login") {
        if (!isGroup) return sock.sendMessage(from, { text: "❌ Gunakan di grup!" })
        const inputKey = text.split(" ")[1]
        if (!inputKey) return sock.sendMessage(from, { text: "Format: .login KEY-XXXX" })

        const isOwner = (inputKey === OWNER_KEY)
        if (!isAdmin && !isOwner) return sock.sendMessage(from, { text: "❌ Khusus Admin grup!" })

        if (isOwner) {
          await Session.findOneAndUpdate({ group: from }, {
            group: from, admin: sender, role: "owner", key: inputKey, expired: 9999999999999, loginAt: Date.now()
          }, { upsert: true })
          return sock.sendMessage(from, { text: "👑 OWNER LOGIN SUCCESS" })
        }

        const data = await User.findOne({ key: inputKey.trim().toUpperCase() })
        if (!data || Date.now() > data.expired) return sock.sendMessage(from, { text: "❌ Key salah atau expired!" })

        await Session.findOneAndUpdate({ group: from }, {
          group: from, admin: sender, role: data.role, key: data.key, expired: data.expired, loginAt: Date.now()
        }, { upsert: true })

        return sock.sendMessage(from, {
          text: `✅ LOGIN BERHASIL\n👮 Role: ${data.role}\n📅 Exp: ${format(data.expired)}`,
          mentions: [sender]
        })
      }

      // Cegah akses fitur jika belum login (kecuali .menu & .owner)
      if (!session && command.startsWith(".") && ![".menu", ".owner", ".login"].includes(command)) {
        if (!isGroup) return
        return sock.sendMessage(from, { text: "❌ Grup ini belum login. Ketik .login <key>" })
      }

      if (!session) return
      const currentRole = session.role || "user"

      // --- MENU ---
      if (command === ".menu") {
        let menuTxt = `--- *MENU BOT* ---\nRole Anda: *${currentRole.toUpperCase()}*\n\n`
        if (currentRole === "owner") {
          menuTxt += `👑 *OWNER*\n.genkey, .genprem, .antilink, .filterchat, .kick\n\n`
        } else if (currentRole === "premium") {
          menuTxt += `⭐ *PREMIUM*\n.antilink, .filterchat, .kick\n\n`
        }
        menuTxt += `👤 *USER*\n.sticker, .owner, .masaaktif, .linkgroup`
        return sock.sendMessage(from, { text: menuTxt })
      }

      // --- ADMIN FEATURES ---
      if (command === ".antilink") {
        if (currentRole === "user") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus Admin grup!" })
        const val = text.split(" ")[1]
        if (!val) return sock.sendMessage(from, { text: ".antilink on/off" })
        settings.antilink = (val === "on")
        await settings.save()
        return sock.sendMessage(from, { text: `✅ Antilink: ${val.toUpperCase()}` })
      }

      if (command === ".filterchat") {
        if (currentRole === "user") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus Admin grup!" })
        const action = text.split(" ")[1]
        const word = text.split(" ").slice(2).join(" ")
        if (action === "add" && word) {
          if (!settings.filterchat.includes(word)) settings.filterchat.push(word)
          await settings.save()
          return sock.sendMessage(from, { text: `✅ Berhasil menambah filter: ${word}` })
        }
        if (action === "del" && word) {
          settings.filterchat = settings.filterchat.filter(x => x !== word)
          await settings.save()
          return sock.sendMessage(from, { text: `✅ Berhasil menghapus filter: ${word}` })
        }
      }

      if (command === ".kick") {
        if (currentRole === "user") return
        if (!isAdmin || !botAdmin) return sock.sendMessage(from, { text: "❌ Pastikan bot & anda adalah Admin!" })
        let target = msg.message.extendedTextMessage?.contextInfo?.participant || (text.split(" ")[1]?.replace(/[^0-9]/g, "") + "@s.whatsapp.net")
        if (!target || target.length < 10) return sock.sendMessage(from, { text: "Tag orangnya!" })
        await sock.groupParticipantsUpdate(from, [target], "remove")
        return sock.sendMessage(from, { text: "✅ Target dikeluarkan." })
      }

      if (command === ".masaaktif") {
        return sock.sendMessage(from, { text: `📅 Sisa Masa Aktif:\n${format(session.expired)}` })
      }

      if (command === ".genkey" && currentRole === "owner") {
        const hari = parseInt(text.split(" ")[1]) || 7
        const key = "KEY-" + Math.random().toString(36).slice(2, 8).toUpperCase()
        const exp = Date.now() + (hari * 86400000)
        await User.create({ key, role: "user", expired: exp, createdAt: Date.now() })
        return sock.sendMessage(from, { text: `✅ USER KEY: ${key}\nDurasi: ${hari} Hari` })
      }

    } catch (e) {
      console.log("Error logic:", e)
    }
  })
}

startBot()
