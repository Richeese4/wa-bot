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
// MONGODB CONNECT
// =========================
mongoose.connect("mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/bot")
  .then(() => console.log("MongoDB Connected"))
  .catch(console.error)

// =========================
// USER DB (KEY SYSTEM)
// =========================
const User = mongoose.model("User", new mongoose.Schema({
  key: String,
  expired: Number,
  createdAt: Number
}))

// =========================
// LOGIN SESSION PERMANENT (IMPORTANT FIX)
// =========================
const Session = mongoose.model("Session", new mongoose.Schema({
  jid: String,
  role: String,
  expired: Number,
  loginAt: Number
}))

// =========================
// EXPRESS
// =========================
const app = express()
app.get("/", (_, res) => res.send("Bot aktif 🚀"))
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
// NORMALIZE JID (FIX BUG LOGIN)
// =========================
function normalizeJid(jid) {
  if (!jid) return jid
  return jid.split(":")[0].split("@")[0]
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

  // =========================
  // CONNECTION
  // =========================
  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {

    if (qr) qrcode.generate(qr, { small: true })

    if (connection === "open") {
      console.log("BOT ONLINE")
    }

    if (connection === "close") {
      const r = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (r) startBot()
    }
  })

  // =========================
  // WELCOME / LEAVE (NO LOGIN REQUIRED)
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
            caption: `👋 @${p.split("@")[0]} keluar dari group`,
            mentions: [p]
          })
        }
      }

    } catch (e) {
      console.log(e)
    }
  })

  // =========================
  // MESSAGE HANDLER
  // =========================
  sock.ev.on("messages.upsert", async ({ messages }) => {

    const msg = messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    const sender = normalizeJid(msg.key.participant || msg.key.remoteJid)

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""

    const cmd = text.toLowerCase().trim()
    const isGroup = from.endsWith("@g.us")

    // =========================
    // GET SESSION (PERMANENT LOGIN)
    // =========================
    let session = await Session.findOne({ jid: sender })

    // =========================
    // AUTO EXPIRED CHECK
    // =========================
    if (session && Date.now() > session.expired) {
      await Session.deleteOne({ jid: sender })
      session = null

      return sock.sendMessage(from, {
        text: "❌ Session expired, silakan login ulang"
      })
    }

    // =========================
    // BLOCK IF NOT LOGIN
    // =========================
    if (!session && cmd.startsWith(".") && !cmd.startsWith(".login")) {
      return sock.sendMessage(from, {
        text: "❌ Kamu belum login. Gunakan .login <key>"
      })
    }

    // =========================
    // LOGIN SYSTEM (PERMANENT)
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
            loginAt: Date.now()
          },
          { upsert: true }
        )

        return sock.sendMessage(from, {
          text: "✅ OWNER LOGIN SUCCESS (PERMANENT)"
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
          role: "user",
          expired: data.expired,
          loginAt: Date.now()
        },
        { upsert: true }
      )

      return sock.sendMessage(from, {
        text: "✅ LOGIN SUCCESS\nExpired: " + format(data.expired)
      })
    }

    // =========================
    // REFRESH SESSION
    // =========================
    session = await Session.findOne({ jid: sender })

    // =========================
    // MENU
    // =========================
    if (cmd === ".menu") {

      if (session.role === "owner") {
        return sock.sendMessage(from, {
          text: ".genkey 24\n.genkeyp 24\n.panel"
        })
      }

      return sock.sendMessage(from, {
        text: ".linkgroup\n.sticker\n.premium\n.masaaktif"
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
    // STICKER (PLACEHOLDER)
    // =========================
    if (cmd === ".sticker") {
      return sock.sendMessage(from, {
        text: "Kirim gambar + .sticker (butuh ffmpeg)"
      })
    }

    // =========================
    // PREMIUM INFO
    // =========================
    if (cmd === ".premium") {
      return sock.sendMessage(from, {
        text: "FITUR PREMIUM:\n.antilink\n.autokick\n.kick\n.openclose\n\nHubungi owner: 082162625200"
      })
    }

    // =========================
    // GENKEY OWNER
    // =========================
    if (cmd.startsWith(".genkey")) {

      if (session.role !== "owner") return

      const jam = parseInt(cmd.split(" ")[1]) || 1
      const key = "KEY-" + Math.random().toString(36).slice(2, 10)

      const exp = Date.now() + jam * 86400000

      await User.create({
        key,
        expired: exp,
        createdAt: Date.now()
      })

      return sock.sendMessage(from, {
        text: `KEY GENERATED:\n${key}\nExpired: ${format(exp)}`
      })
    }

    // =========================
    // PANEL OWNER
    // =========================
    if (cmd === ".panel") {

      if (session.role !== "owner") return

      const all = await User.find()

      let t = "ACTIVE KEY:\n\n"

      all.forEach((x, i) => {
        t += `${i + 1}. ${x.key}\n${format(x.expired)}\n\n`
      })

      return sock.sendMessage(from, { text: t })
    }

  })
}

startBot()
