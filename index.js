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
// MONGO
// =========================
mongoose.connect("mongodb+srv://znoidfamz_db_user:hHoRUaiak5EuQAft@znoidfamz.svbkerf.mongodb.net/bot?retryWrites=true&w=majority")

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
  loginAt: Number,
  isAdmin: { type: Boolean, default: false }
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
// BOT START
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

    if (connection === "open") console.log("BOT ONLINE")

    if (connection === "close") {
      const reconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      if (reconnect) startBot()
    }
  })

  // =========================
  // WELCOME / LEAVE
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
  // MESSAGE
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
    // SESSION LOAD
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
    // LOGIN SYSTEM
    // =========================
    if (cmd.startsWith(".login")) {

      const key = cmd.split(" ")[1]

      // OWNER LOGIN
      if (key === OWNER_KEY) {

        await Session.findOneAndUpdate(
          { jid: sender },
          {
            jid: sender,
            role: "owner",
            expired: Infinity,
            loginAt: Date.now(),
            isAdmin: true
          },
          { upsert: true }
        )

        return sock.sendMessage(from, {
          text: "👑 OWNER LOGIN SUCCESS"
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
          expired: data.expired,
          key,
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

    const role = session.role

    // =========================
    // ADMIN CHECK GROUP
    // =========================
    let isAdmin = false

    if (isGroup) {
      const meta = await sock.groupMetadata(from)
      const p = meta.participants.find(x => x.id === sender)
      isAdmin = p?.admin ? true : false
    }

    // OWNER BYPASS ADMIN
    const bypassAdmin = role === "owner"

    // =========================
    // EXPIRY CHECK
    // =========================
    if (session.expired !== Infinity && Date.now() > session.expired) {
      await Session.deleteOne({ jid: sender })
      return sock.sendMessage(from, {
        text: "❌ Session expired"
      })
    }

    // =========================
    // USER LIMIT
    // =========================
    const userOnly = [".linkgroup", ".sticker"]

    if (role === "user" && cmd.startsWith(".") && !userOnly.includes(cmd.split(" ")[0])) {
      return sock.sendMessage(from, {
        text: "❌ Akses terbatas user"
      })
    }

    // =========================
    // MENU MASAAKTIF
    // =========================
    if (cmd === ".masaaktif") {
      return sock.sendMessage(from, {
        text:
`📌 MASA AKTIF
.perpanjang
.premium`
      })
    }

    // =========================
    // MASA AKTIF EXTEND
    // =========================
    if (cmd === ".perpanjang") {
      return sock.sendMessage(from, {
        text: `Hubungi owner:\n${OWNER_NUMBER}`
      })
    }

    if (cmd === ".premium") {
      return sock.sendMessage(from, {
        text: `Premium info:\nHubungi: ${OWNER_NUMBER}`
      })
    }

    if (cmd === ".qris") {
      return sock.sendMessage(from, {
        text: "QRIS ALL PAYMENT OWNER"
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
    // STICKER
    // =========================
    if (cmd === ".sticker") {
      return sock.sendMessage(from, {
        text: "Sticker system aktif"
      })
    }

    // =========================
    // GENKEY OWNER
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
        text: `KEY:\n${key}\nExpired: ${format(exp)}`
      })
    }

    // =========================
    // PANEL
    // =========================
    if (cmd === ".panel") {
      if (role !== "owner") return

      const all = await User.find()
      let t = "ACTIVE KEYS:\n\n"

      all.forEach((x, i) => {
        t += `${i+1}. ${x.key}\n${format(x.expired)}\n\n`
      })

      return sock.sendMessage(from, { text: t })
    }

  })
}

startBot()
