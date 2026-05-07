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
// MONGO CONNECT (FIXED URI)
// =========================
const MONGO_URI =
  "mongodb+srv://znoidfamz_db_user:hHoRUaiak5EuQAft@znoidfamz.svbkerf.mongodb.net/bot?retryWrites=true&w=majority"

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 10000
}).then(() => {
  console.log("MongoDB CONNECTED")
}).catch(err => {
  console.log("MongoDB ERROR:", err.message)
})

// =========================
// SCHEMA
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
// EXPRESS KEEP ALIVE
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

    try {

      const msg = messages[0]
      if (!msg.message) return

      const from = msg.key.remoteJid

      // FIX SENDER (IMPORTANT)
      const sender = (msg.key.participant || msg.key.remoteJid).split(":")[0]

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      const cmd = text.toLowerCase().trim()
      const isGroup = from.endsWith("@g.us")

      // =========================
      // LOAD SESSION (PERSIST LOGIN)
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
              key,
              expired: Infinity,
              loginAt: Date.now()
            },
            { upsert: true }
          )

          return sock.sendMessage(from, {
            text: "👑 OWNER LOGIN SUCCESS"
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
            role: data.role || "user",
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

      // reload session
      session = await Session.findOne({ jid: sender })

      if (!session) return

      // =========================
      // AUTO EXPIRED
      // =========================
      if (session.expired !== Infinity && Date.now() > session.expired) {
        await Session.deleteOne({ jid: sender })

        return sock.sendMessage(from, {
          text: "❌ Session expired"
        })
      }

      const role = session.role || "user"

      // =========================
      // LIMIT USER COMMAND
      // =========================
      const allowedUser = [".linkgroup", ".sticker"]

      if (role === "user" && cmd.startsWith(".") && !allowedUser.includes(cmd.split(" ")[0])) {
        return sock.sendMessage(from, {
          text: "❌ Akses user terbatas"
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
          text: "Sticker butuh ffmpeg"
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

    } catch (e) {
      console.log("ERROR:", e.message)
    }
  })
}

startBot()
