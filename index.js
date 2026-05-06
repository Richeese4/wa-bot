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

// OWNER NOMER (hanya untuk notifikasi, bukan login)
const OWNER_NUMBER = "6282162625200"

// =========================
// MONGODB CONNECT
// =========================
mongoose.connect("mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/bot", {
  useNewUrlParser: true,
  useUnifiedTopology: true
})

// USER SCHEMA
const userSchema = new mongoose.Schema({
  key: String,
  expired: Number,
  active: Boolean,
  createdAt: Number
})

const User = mongoose.model("User", userSchema)

// =========================
// EXPRESS KEEP ALIVE
// =========================
const app = express()
app.get("/", (req, res) => res.send("Bot aktif 🚀"))
app.listen(3000, () => console.log("WEB RUN"))

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

  // SESSION USER
  const session = {}

  // =========================
  // CONNECTION FIX RECONNECT
  // =========================
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) qrcode.generate(qr, { small: true })

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      if (shouldReconnect) startBot()
    }

    if (connection === "open") {
      console.log("BOT ONLINE")
    }
  })

  // =========================
  // MESSAGE HANDLER
  // =========================
  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0]
      if (!msg.message) return

      const from = msg.key.remoteJid
      const sender = msg.key.participant || from

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      const cmd = text.trim().toLowerCase()

      // =========================
      // LOGIN SYSTEM
      // =========================
      if (cmd.startsWith(".login")) {
        const key = cmd.split(" ")[1]
        if (!key) return

        // OWNER LOGIN (NO LIMIT)
        if (key === OWNER_KEY) {
          session[sender] = {
            role: "owner",
            expired: Date.now() + 365 * 999999999
          }

          return sock.sendMessage(from, {
            text: "✅ OWNER LOGIN BERHASIL\nAkses penuh aktif"
          })
        }

        // USER LOGIN
        const data = await User.findOne({ key })

        if (!data) {
          return sock.sendMessage(from, {
            text: "❌ Key salah atau tidak ditemukan"
          })
        }

        if (data.active === false || Date.now() > data.expired) {
          return sock.sendMessage(from, {
            text: "❌ Key expired"
          })
        }

        session[sender] = {
          role: "user",
          expired: data.expired
        }

        return sock.sendMessage(from, {
          text:
            "✅ LOGIN BERHASIL\nExpired: " +
            new Date(data.expired).toLocaleString()
        })
      }

      // =========================
      // BLOCK IF NOT LOGIN
      // =========================
      if (!session[sender]) {
        if (cmd.startsWith(".")) {
          return sock.sendMessage(from, {
            text: "❌ Kamu belum login. Gunakan .login <key>"
          })
        }
        return
      }

      // =========================
      // AUTO EXPIRED CHECK
      // =========================
      if (Date.now() > session[sender].expired) {
        delete session[sender]
        return sock.sendMessage(from, {
          text: "❌ Session expired. Login ulang"
        })
      }

      // =========================
      // MENU
      // =========================
      if (cmd === ".menu") {
        const role = session[sender].role

        if (role === "owner") {
          return sock.sendMessage(from, {
            text: "OWNER MENU:\n.genkey 24\n.panel"
          })
        }

        return sock.sendMessage(from, {
          text: "USER MENU:\n.linkgroup\n.sticker\n.premium"
        })
      }

      // =========================
      // OWNER GENKEY
      // =========================
      if (cmd.startsWith(".genkey")) {
        if (session[sender].role !== "owner") return

        const jam = parseInt(cmd.split(" ")[1]) || 1
        const key = "KEY-" + Math.random().toString(36).substring(2, 10)

        const expired = Date.now() + jam * 24 * 60 * 60 * 1000

        await User.create({
          key,
          expired,
          active: true,
          createdAt: Date.now()
        })

        return sock.sendMessage(from, {
          text:
            "KEY GENERATED:\n" +
            key +
            "\nExpired: " +
            new Date(expired).toLocaleString()
        })
      }

      // =========================
      // LINK GROUP
      // =========================
      if (cmd === ".linkgroup") {
        if (!from.endsWith("@g.us")) return

        const link = await sock.groupInviteCode(from)

        return sock.sendMessage(from, {
          text: "https://chat.whatsapp.com/" + link
        })
      }

      // =========================
      // STICKER SIMPLE
      // =========================
      if (cmd === ".sticker") {
        const media = msg.message.imageMessage

        if (!media) {
          return sock.sendMessage(from, {
            text: "Kirim gambar + .sticker"
          })
        }

        return sock.sendMessage(from, {
          text: "Sticker feature placeholder (butuh sharp & ffmpeg)"
        })
      }

      // =========================
      // PREMIUM INFO
      // =========================
      if (cmd === ".premium") {
        return sock.sendMessage(from, {
          text:
            "FITUR PREMIUM:\n.filterchat\n.autokick\n.antilink\n.kick\n\nHubungi owner: 082162625200"
        })
      }

      // =========================
      // PANEL OWNER
      // =========================
      if (cmd === ".panel") {
        if (session[sender].role !== "owner") return

        const all = await User.find({})

        let text = "ACTIVE KEYS:\n"
        all.forEach((u, i) => {
          text += `${i + 1}. ${u.key} - ${new Date(u.expired).toLocaleString()}\n`
        })

        return sock.sendMessage(from, { text })
      }

    } catch (e) {
      console.log(e)
    }
  })
}

startBot()
