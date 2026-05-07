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
mongoose.connect("mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/bot")
  .then(() => console.log("MongoDB Connected"))
  .catch(console.error)

// USER DB
const User = mongoose.model("User", new mongoose.Schema({
  key: String,
  expired: Number,
  createdAt: Number,
  role: { type: String, default: "user" }
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

  // SESSION SAFE MAP
  const session = new Map()

  // =========================
  // CONNECTION
  // =========================
  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {

    if (qr) qrcode.generate(qr, { small: true })

    if (connection === "open") console.log("BOT ONLINE")

    if (connection === "close") {
      const r = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (r) startBot()
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
            caption: `👋 @${p.split("@")[0]} keluar dari group`,
            mentions: [p]
          })
        }
      }
    } catch (e) {
      console.log("WELCOME ERROR", e)
    }
  })

  // =========================
  // MESSAGE HANDLER
  // =========================
  sock.ev.on("messages.upsert", async ({ messages }) => {

    try {

      const msg = messages[0]
      if (!msg.message) return

      const from = msg.key.remoteJid

      // FIX SENDER FORMAT
      const sender = (msg.key.participant || from).split(":")[0]

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      const cmd = text.toLowerCase().trim()
      const isGroup = from.endsWith("@g.us")

      const user = session.get(sender) || null

      // =========================
      // BLOCK BEFORE LOGIN (SAFE)
      // =========================
      if (!user && cmd.startsWith(".") && !cmd.startsWith(".login")) {
        return sock.sendMessage(from, {
          text: "❌ Login dulu pakai .login <key>"
        })
      }

      // =========================
      // LOGIN SYSTEM
      // =========================
      if (cmd.startsWith(".login")) {

        const key = cmd.split(" ")[1]

        // OWNER LOGIN
        if (key === OWNER_KEY) {
          session.set(sender, {
            role: "owner",
            expired: Infinity,
            loginAt: Date.now()
          })

          console.log("OWNER LOGIN:", sender)

          return sock.sendMessage(from, {
            text: "✅ OWNER LOGIN SUCCESS\nAkses penuh aktif"
          })
        }

        // USER LOGIN
        const data = await User.findOne({ key })

        if (!data || Date.now() > data.expired) {
          return sock.sendMessage(from, {
            text: "❌ Key invalid / expired"
          })
        }

        session.set(sender, {
          role: "user",
          expired: data.expired
        })

        return sock.sendMessage(from, {
          text: "✅ LOGIN SUCCESS\nExpired: " + format(data.expired)
        })
      }

      // =========================
      // AUTO EXPIRED CHECK
      // =========================
      if (user && Date.now() > user.expired) {
        session.delete(sender)

        return sock.sendMessage(from, {
          text: "❌ Session expired"
        })
      }

      // =========================
      // MENU SAFE
      // =========================
      if (cmd === ".menu") {

        if (user && user.role === "owner") {
          return sock.sendMessage(from, {
            text: ".genkey 24\n.genkeyp 24\n.panel"
          })
        }

        return sock.sendMessage(from, {
          text: ".linkgroup\n.sticker\n.owner\n.premium\n.masaaktif"
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
      // STICKER PLACEHOLDER
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
      // GENKEY OWNER SAFE
      // =========================
      if (cmd.startsWith(".genkey")) {

        if (!user || user.role !== "owner") return

        const jam = parseInt(cmd.split(" ")[1]) || 1
        const key = "KEY-" + Math.random().toString(36).substring(2, 10)

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
      // PANEL OWNER SAFE
      // =========================
      if (cmd === ".panel") {

        if (!user || user.role !== "owner") return

        const all = await User.find()

        let t = "ACTIVE KEY:\n\n"

        all.forEach((x, i) => {
          t += `${i + 1}. ${x.key}\n${format(x.expired)}\n\n`
        })

        return sock.sendMessage(from, { text: t })
      }

    } catch (e) {
      console.log("ERROR:", e)
    }
  })
}

startBot()
