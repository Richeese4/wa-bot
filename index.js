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
  browseWAWeb
} = require("@whiskeysockets/baileys")

// =========================
// CONFIG
// =========================
const OWNER_KEY = "freewilly123"
const OWNER_NUMBER = "6282162625200@s.whatsapp.net" // Format lengkap

// =========================
// MONGO CONNECT
// =========================
const MONGO_URI = "mongodb+srv://znoidfamz_db_user:hHoRUaiak5EuQAft@znoidfamz.svbkerf.mongodb.net/bot?retryWrites=true&w=majority"

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB CONNECTED"))
  .catch(err => console.log("MongoDB ERROR:", err.message))

// =========================
// DATABASE MODELS
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
  warns: { type: Map, of: Number, default: {} } // Menggunakan Map agar lebih stabil
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
  const regex = /(https?:\/\/|chat\.whatsapp\.com|wa\.me|whatsapp\.com\/[a-zA-Z0-9]+)/gi
  return regex.test(text)
}

// =========================
// START BOT
// =========================
async function startBot() {
  // Gunakan 'session' folder untuk auth
  const { state, saveCreds } = await useMultiFileAuthState("session")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state,
    printQRInTerminal: true, // Pastikan ini true
    browser: ["ZnoidBot", "Chrome", "1.0.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  // FIX QR CODE & RECONNECT
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log("--------------------------------------------------")
      console.log("SCAN QR CODE BERIKUT:")
      qrcode.generate(qr, { small: true })
      console.log("--------------------------------------------------")
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode
      console.log("Koneksi terputus, alasan:", reason)

      if (reason === DisconnectReason.loggedOut) {
        console.log("Sesi keluar, hapus folder 'session' dan scan ulang.")
        if (fs.existsSync("session")) fs.rmSync("session", { recursive: true })
      }
      
      // Reconnect otomatis jika bukan karena logout
      startBot()
    } else if (connection === "open") {
      console.log("✅ BOT BERHASIL TERHUBUNG")
    }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0]
      if (!msg.message || msg.key.remoteJid === "status@broadcast") return

      const from = msg.key.remoteJid
      const isGroup = from.endsWith("@g.us")
      const sender = isGroup ? msg.key.participant : from
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
      
      const cmd = text.trim()
      const command = cmd.split(" ")[0].toLowerCase()

      // FIX ADMIN DETECTION
      let isAdmin = false
      let botAdmin = false

      if (isGroup) {
        const groupMetadata = await sock.groupMetadata(from)
        const participants = groupMetadata.participants
        
        const senderData = participants.find(p => p.id === sender)
        isAdmin = senderData?.admin === 'admin' || senderData?.admin === 'superadmin' || false
        
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net'
        const botData = participants.find(p => p.id === botId)
        botAdmin = botData?.admin === 'admin' || botData?.admin === 'superadmin' || false
      }

      // Settings Load
      let settings = isGroup ? await GroupSettings.findOne({ group: from }) : null
      if (isGroup && !settings) settings = await GroupSettings.create({ group: from })

      // =========================
      // ANTILINK (FIXED LOGIC)
      // =========================
      if (isGroup && settings?.antilink && isLink(text)) {
        const isOwner = sender === OWNER_NUMBER
        if (!isAdmin && !isOwner && !msg.key.fromMe) {
          if (botAdmin) {
            await sock.sendMessage(from, { delete: msg.key })
            
            // Manage Warning via Map
            let warns = settings.warns || new Map()
            let userWarn = (warns.get(sender) || 0) + 1
            warns.set(sender, userWarn)
            
            settings.warns = warns
            await settings.save()

            if (userWarn >= settings.maxwarn) {
              await sock.sendMessage(from, { text: `🚫 Kick @${sender.split("@")[0]} (Max Warning)`, mentions: [sender] })
              await sock.groupParticipantsUpdate(from, [sender], "remove")
              warns.delete(sender)
              settings.warns = warns
              await settings.save()
            } else {
              await sock.sendMessage(from, { 
                text: `⚠️ Link Terdeteksi!\nWarning: ${userWarn}/${settings.maxwarn}`, 
                mentions: [sender] 
              })
            }
            return
          }
        }
      }

      // =========================
      // COMMAND LOGIN
      // =========================
      if (command === ".login") {
        if (!isGroup) return
        const inputKey = cmd.split(" ")[1]
        if (!inputKey) return sock.sendMessage(from, { text: "Format: .login [key]" })

        const isOwner = inputKey === OWNER_KEY
        if (!isAdmin && !isOwner) return sock.sendMessage(from, { text: "❌ Hanya Admin yang bisa login bot." })

        if (isOwner) {
          await Session.findOneAndUpdate({ group: from }, {
            group: from, admin: sender, role: "owner", key: inputKey, expired: 9999999999999, loginAt: Date.now()
          }, { upsert: true })
          return sock.sendMessage(from, { text: "👑 Owner Login Berhasil!" })
        }

        const userKey = await User.findOne({ key: inputKey.toUpperCase() })
        if (!userKey || Date.now() > userKey.expired) return sock.sendMessage(from, { text: "❌ Key salah atau expired." })

        await Session.findOneAndUpdate({ group: from }, {
          group: from, admin: sender, role: userKey.role, key: userKey.key, expired: userKey.expired, loginAt: Date.now()
        }, { upsert: true })

        return sock.sendMessage(from, { text: `✅ Login Berhasil sebagai ${userKey.role}!` })
      }

      // Session Check untuk Command lain
      const session = isGroup ? await Session.findOne({ group: from }) : null
      if (command.startsWith(".") && !session && command !== ".login") {
        return sock.sendMessage(from, { text: "❌ Bot belum login di grup ini. Ketik .login [key]" })
      }

      // =========================
      // ADMIN COMMANDS (ANTILINK ON/OFF)
      // =========================
      if (command === ".antilink") {
        if (!isAdmin && sender !== OWNER_NUMBER) return
        const args = cmd.split(" ")[1]
        if (!args) return sock.sendMessage(from, { text: ".antilink on/off" })

        settings.antilink = args === "on"
        await settings.save()
        return sock.sendMessage(from, { text: `✅ Antilink berhasil diubah ke: ${args}` })
      }

      if (command === ".menu") {
        return sock.sendMessage(from, { text: "📌 MENU AKTIF\n\n.antilink on/off\n.kick\n.linkgroup\n.masaaktif" })
      }

      // Perintah lainnya silakan diteruskan...

    } catch (err) {
      console.log("Error upsert:", err)
    }
  })
}

startBot()
