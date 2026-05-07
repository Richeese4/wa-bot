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
// MONGO (FIX + SAFE)
// =========================
const MONGO_URI = "mongodb+srv://znoidfamz_db_user:hHoRUaiak5EuQAft@znoidfamz.svbkerf.mongodb.net/bot?retryWrites=true&w=majority"

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 15000
}).then(() => console.log("MongoDB CONNECTED"))
.catch(err => console.log("MongoDB ERROR:", err.message))

// =========================
// MODEL
// =========================
const User = mongoose.model("User", new mongoose.Schema({
  key: String,
  role: { type: String, default: "user" },
  expired: Number,
  createdAt: Number
}))

const Session = mongoose.model("Session", new mongoose.Schema({
  jid: String,
  role: String,
  key: String,
  expired: Number,
  loginAt: Number
}))

// =========================
// EXPRESS
// =========================
const app = express()
app.get("/", (_, res) => res.send("BOT ACTIVE"))
app.listen(3000)

// =========================
// FORMAT TIME
// =========================
function format(ms) {
  return new Date(ms).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta"
  })
}

// =========================
// ROLE CHECK HELPER
// =========================
function isExpired(session) {
  return session.expired !== Infinity && Date.now() > session.expired
}

// =========================
// BOT
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

  // =========================
  // CONNECTION
  // =========================
  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {

    if (qr) qrcode.generate(qr, { small: true })

    if (connection === "open") {
      console.log("BOT ONLINE")
    }

    if (connection === "close") {
      const reconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      if (reconnect) startBot()
    }
  })

  // =========================
  // GROUP WELCOME (NO LOGIN)
  // =========================
  sock.ev.on("group-participants.update", async (m) => {
    try {
      if (m.action === "add") {
        for (let p of m.participants) {
          await sock.sendMessage(m.id, {
            image: fs.readFileSync("./welcome.jpg"),
            caption: `👋 Welcome @${p.split("@")[0]}`,
            mentions: [p]
          })
        }
      }

      if (m.action === "remove") {
        for (let p of m.participants) {
          await sock.sendMessage(m.id, {
            image: fs.readFileSync("./keluar.jpg"),
            caption: `👋 @${p.split("@")[0]} keluar`,
            mentions: [p]
          })
        }
      }
    } catch {}
  })

  // =========================
  // MESSAGE HANDLER
  // =========================
  sock.ev.on("messages.upsert", async ({ messages }) => {

    const msg = messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    const sender = (msg.key.participant || from).split(":")[0]

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""

    const cmd = text.toLowerCase().trim()
    const isGroup = from.endsWith("@g.us")

    // =========================
    // LOAD SESSION
    // =========================
    let session = await Session.findOne({ jid: sender })

    // =========================
    // BLOCK IF NOT LOGIN
    // =========================
    if (!session && cmd.startsWith(".") && !cmd.startsWith(".login")) {
      return sock.sendMessage(from, {
        text: "❌ Login dulu (.login key)"
      })
    }

    // =========================
    // LOGIN
    // =========================
    if (cmd.startsWith(".login")) {

      const key = cmd.split(" ")[1]

      if (key === OWNER_KEY) {

        await Session.findOneAndUpdate(
          { jid: sender },
          {
            jid: sender,
            role: "owner",
            key,
            expired: Infinity,
            loginAt: Date.now()
          },
          { upsert: true }
        )

        return sock.sendMessage(from, {
          text: `👑 OWNER LOGIN SUCCESS\nWelcome back owner`
        })
      }

      const data = await User.findOne({ key })

      if (!data || Date.now() > data.expired) {
        return sock.sendMessage(from, {
          text: "❌ Key invalid / expired"
        })
      }

      await Session.findOneAndUpdate(
        { jid: sender },
        {
          jid: sender,
          role: data.role,
          key,
          expired: data.expired,
          loginAt: Date.now()
        },
        { upsert: true }
      )

      return sock.sendMessage(from, {
        text: `✅ LOGIN SUCCESS\nExpired: ${format(data.expired)}`
      })
    }

    session = await Session.findOne({ jid: sender })
    if (!session) return

    // =========================
    // AUTO EXPIRED
    // =========================
    if (isExpired(session)) {
      await Session.deleteOne({ jid: sender })
      return sock.sendMessage(from, {
        text: "❌ Session expired"
      })
    }

    const role = session.role

    // =========================
    // ADMIN CHECK GROUP
    // =========================
    let isAdmin = false
    if (isGroup) {
      const meta = await sock.groupMetadata(from)
      const admin = meta.participants.find(p =>
        p.id === sender && (p.admin === "admin" || p.admin === "superadmin")
      )
      isAdmin = !!admin
    }

    // =========================
    // USER LIMIT COMMAND
    // =========================
    const userOnly = [".linkgroup", ".sticker"]

    if (role === "user" && cmd.startsWith(".") && !userOnly.includes(cmd.split(" ")[0])) {
      return sock.sendMessage(from, {
        text: "❌ User terbatas"
      })
    }

    // =========================
    // MENU
    // =========================
    if (cmd === ".menu") {
      return sock.sendMessage(from, {
        text:
`📌 MENU
.linkgroup
.sticker
.owner
.premium
.masaaktif`
      })
    }

    // =========================
    // LINK GROUP
    // =========================
    if (cmd === ".linkgroup") {
      if (!isGroup) return
      const code = await sock.groupInviteCode(from)

      return sock.sendMessage(from, {
        text: "https://chat.whatsapp.com/" + code
      })
    }

    // =========================
    // STICKER (placeholder)
    // =========================
    if (cmd === ".sticker") {
      return sock.sendMessage(from, {
        text: "Sticker butuh ffmpeg"
      })
    }

    // =========================
    // OWNER GENKEY
    // =========================
    if (cmd.startsWith(".genkey")) {
      if (role !== "owner") return

      const jam = parseInt(cmd.split(" ")[1]) || 1
      const key = "KEY-" + Math.random().toString(36).slice(2, 10)
      const exp = Date.now() + jam * 86400000

      await User.create({
        key,
        role: "user",
        expired: exp,
        createdAt: Date.now()
      })

      return sock.sendMessage(from, {
        text: `KEY CREATED:\n${key}\nExpired: ${format(exp)}`
      })
    }

  })
}

startBot()
