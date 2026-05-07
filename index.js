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

// =========================
// MONGO FIX
// =========================
mongoose.connect("mongodb+srv://USER:PASS@cluster0.mongodb.net/bot?retryWrites=true&w=majority")
  .then(() => console.log("MongoDB Connected"))
  .catch(console.error)

// USER DATABASE
const User = mongoose.model("User", new mongoose.Schema({
  key: String,
  role: { type: String, default: "user" },
  expired: Number,
  createdAt: Number
}))

// SESSION DATABASE (LOGIN PERMANEN)
const Session = mongoose.model("Session", new mongoose.Schema({
  jid: String,
  key: String,
  role: String,
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
const format = (ms) =>
  new Date(ms).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta"
  })

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

  // =========================
  // CONNECTION FIX
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
  // MESSAGE HANDLER
  // =========================
  sock.ev.on("messages.upsert", async ({ messages }) => {

    const msg = messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid

    // FIX SENDER (INI YANG BIKIN LOGIN BUG SEBELUMNYA)
    const sender = msg.key.participant || msg.key.remoteJid

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""

    const cmd = text.toLowerCase().trim()
    const isGroup = from.endsWith("@g.us")

    // =========================
    // LOAD SESSION (IMPORTANT FIX)
    // =========================
    let session = await Session.findOne({ jid: sender })

    // =========================
    // BLOCK BEFORE LOGIN
    // =========================
    if (!session && cmd.startsWith(".") && !cmd.startsWith(".login")) {
      return sock.sendMessage(from, {
        text: "❌ Harus login dulu (.login key)"
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
            key,
            role: "owner",
            expired: Infinity,
            loginAt: Date.now()
          },
          { upsert: true }
        )

        return sock.sendMessage(from, {
          text: "✅ OWNER LOGIN BERHASIL"
        })
      }

      // USER LOGIN
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
          key,
          role: data.role,
          expired: data.expired,
          loginAt: Date.now()
        },
        { upsert: true }
      )

      return sock.sendMessage(from, {
        text: `✅ LOGIN SUCCESS\nExpired: ${format(data.expired)}`
      })
    }

    // reload session
    session = await Session.findOne({ jid: sender })

    // =========================
    // AUTO EXPIRED CHECK
    // =========================
    if (session && session.expired !== Infinity && Date.now() > session.expired) {
      await Session.deleteOne({ jid: sender })

      return sock.sendMessage(from, {
        text: "❌ Session expired"
      })
    }

    // =========================
    // MENU
    // =========================
    if (cmd === ".menu") {

      if (session.role === "owner") {
        return sock.sendMessage(from, {
          text: ".genkey 24\n.panel"
        })
      }

      return sock.sendMessage(from, {
        text: ".linkgroup\n.sticker\n.premium"
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
    // GENKEY OWNER
    // =========================
    if (cmd.startsWith(".genkey")) {

      if (session.role !== "owner") return

      const jam = parseInt(cmd.split(" ")[1]) || 1
      const key = "KEY-" + Math.random().toString(36).substring(2, 10)

      const exp = Date.now() + jam * 86400000

      await User.create({
        key,
        role: "user",
        expired: exp,
        createdAt: Date.now()
      })

      return sock.sendMessage(from, {
        text: `KEY CREATED\n${key}\nExpired: ${format(exp)}`
      })
    }

    // =========================
    // PANEL
    // =========================
    if (cmd === ".panel") {

      if (session.role !== "owner") return

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
