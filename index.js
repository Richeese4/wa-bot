const P = require("pino")
const qrcode = require("qrcode-terminal")
const fs = require("fs")
const express = require("express")

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
// DATABASE
// =========================
const users = {}
const keys = {}
const premium = {}
const groupState = {}
const warning = {}

// =========================
// SERVER KEEP ALIVE
// =========================
const app = express()
app.get("/", (_, res) => res.send("Bot aktif 🚀"))
app.listen(3000)

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

  const getNum = (jid) => jid.split("@")[0]

  // =========================
  // CONNECTION
  // =========================
  sock.ev.on("connection.update", (u) => {
    if (u.qr) qrcode.generate(u.qr, { small: true })
    if (u.connection === "open") console.log("BOT READY")
    if (u.connection === "close") startBot()
  })

  // =========================
  // MESSAGE HANDLER
  // =========================
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    const sender = msg.key.participant || from
    const jid = getNum(sender)

    const text =
      (msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "").toLowerCase().trim()

    const isGroup = from.endsWith("@g.us")

    // =========================
    // LOGIN SYSTEM
    // =========================
    if (text.startsWith(".login")) {
      const parts = text.split(" ")
      const input = parts[1]

      // OWNER LOGIN
      if (input === OWNER_KEY) {
        users[jid] = {
          role: "owner",
          login: true
        }

        return sock.sendMessage(from, {
          text: "👑 OWNER LOGIN BERHASIL"
        })
      }

      // USER LOGIN
      if (!keys[input]) {
        return sock.sendMessage(from, { text: "❌ Key tidak valid" })
      }

      if (keys[input].used) {
        return sock.sendMessage(from, { text: "❌ Key sudah dipakai" })
      }

      const exp = Date.now() + keys[input].duration

      users[jid] = {
        role: "user",
        login: true,
        expire: exp,
        key: input
      }

      keys[input].used = true

      return sock.sendMessage(from, {
        text:
`✅ LOGIN BERHASIL
⏳ Expired: ${new Date(exp).toLocaleString()}`
      })
    }

    // =========================
    // GENERATE KEY OWNER
    // =========================
    if (text.startsWith(".genkey")) {
      if (users[jid]?.role !== "owner") return

      const dur = parseInt(text.split(" ")[1]) || 24
      const key = Math.random().toString(36).slice(2, 10)

      keys[key] = {
        used: false,
        duration: dur * 60 * 60 * 1000
      }

      return sock.sendMessage(from, {
        text: `🔑 KEY: ${key}\n⏳ ${dur} jam`
      })
    }

    // =========================
    // PREMIUM GENERATE
    // =========================
    if (text.startsWith(".genkeyp")) {
      if (users[jid]?.role !== "owner") return

      const key = Math.random().toString(36).slice(2, 10)
      premium[key] = true

      return sock.sendMessage(from, {
        text: `⭐ PREMIUM KEY: ${key}`
      })
    }

    // =========================
    // BLOCK BEFORE LOGIN
    // =========================
    if (!users[jid]?.login && text.startsWith(".")) {
      return sock.sendMessage(from, {
        text: "❌ Harus login dulu"
      })
    }

    // =========================
    // MASA AKTIF EXTEND
    // =========================
    if (text.startsWith(".masaaktif")) {
      const key = text.split(" ")[1]

      if (!keys[key]) return

      keys[key].duration += 24 * 60 * 60 * 1000

      return sock.sendMessage(from, {
        text: "⏳ Masa aktif ditambah 1 hari"
      })
    }

    // =========================
    // MENU USER
    // =========================
    if (text === ".menu") {
      return sock.sendMessage(from, {
        text: `📌 MENU USER\n.antilink\n.kick\n.sticker`
      })
    }

    // =========================
    // STICKER
    // =========================
    if (text === ".sticker" && msg.message.imageMessage) {
      return sock.sendMessage(from, {
        text: "📌 (sticker dibuat)"
      })
    }

    // =========================
    // LINK GROUP
    // =========================
    if (text === ".linkgroup" && isGroup) {
      const code = await sock.groupInviteCode(from)
      return sock.sendMessage(from, {
        text: "https://chat.whatsapp.com/" + code
      })
    }

    // =========================
    // ANTI LINK PREMIUM
    // =========================
    if (text.startsWith(".antilink")) {
      if (!premium[users[jid]?.key]) return

      groupState[from] = { antilink: text.includes("on") }

      return sock.sendMessage(from, {
        text: "AntiLink updated"
      })
    }

    // =========================
    // KICK
    // =========================
    if (text.startsWith(".kick")) {
      if (!isGroup) return

      const target = msg.message.extendedTextMessage?.contextInfo?.participant

      if (!target) return

      await sock.groupParticipantsUpdate(from, [target], "remove")
    }

    // =========================
    // FILTER CHAT PREMIUM
    // =========================
    if (text.startsWith(".filterchat")) {
      if (!premium[users[jid]?.key]) return

      const words = text.split(" ").slice(1)

      groupState[from] = { filter: words }

      return sock.sendMessage(from, {
        text: "Filter aktif"
      })
    }

    // =========================
    // AUTO WARNING KICK
    // =========================
    if (groupState[from]?.antilink && text.includes("http")) {
      warning[sender] = (warning[sender] || 0) + 1

      if (warning[sender] >= 3) {
        await sock.groupParticipantsUpdate(from, [sender], "remove")
      }
    }
  })
}

startBot()
