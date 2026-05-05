const P = require("pino")
const qrcode = require("qrcode-terminal")
const fs = require("fs")

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys")

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state,
    browser: ["Windows", "Chrome", "120.0.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  // =========================
  // CONNECTION
  // =========================
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log("📱 Scan QR:")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      if (shouldReconnect) startBot()
    }

    if (connection === "open") {
      console.log("✅ BOT AKTIF")
    }
  })

  // =========================
  // AUTO TOLAK TELEPON
  // =========================
  sock.ev.on("call", async (calls) => {
    for (let call of calls) {
      if (call.status === "offer") {
        await sock.rejectCall(call.id, call.from)
      }
    }
  })

  // =========================
  // WELCOME MEMBER (PAKAI JPG SENDIRI)
  // =========================
  sock.ev.on("group-participants.update", async (anu) => {
    try {
      if (anu.action === "add") {
        for (let user of anu.participants) {
          if (fs.existsSync("./welcome.jpg")) {
            await sock.sendMessage(anu.id, {
              image: fs.readFileSync("./welcome.jpg"),
              caption: `👋 Selamat datang @${user.split("@")[0]} di group!\nSemoga betah ya ✨`,
              mentions: [user]
            })
          }
        }
      }
    } catch (err) {
      console.log("WELCOME ERROR:", err)
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
      const isGroup = from.endsWith("@g.us")
      const sender = msg.key.participant || from

      // auto read
      await sock.readMessages([msg.key])

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      // =========================
      // QRIS
      // =========================
      if (text.toLowerCase() === ".qris") {
        if (fs.existsSync("./qris.jpg")) {
          await sock.sendMessage(from, {
            image: fs.readFileSync("./qris.jpg"),
            caption: "💸 Scan QRIS untuk pembayaran"
          })
        }
        return
      }

      if (!isGroup) return

      // =========================
      // CEK ADMIN
      // =========================
      let isAdmin = false
      try {
        const meta = await sock.groupMetadata(from)
        isAdmin = meta.participants.some(
          (p) => p.id === sender && p.admin !== null
        )
      } catch {}

      if (isAdmin) return

      // =========================
      // 🚫 LINK UNDANGAN WHATSAPP SAJA
      // =========================
      const isInvite =
        /chat\.whatsapp\.com/i.test(text) ||
        /whatsapp\.com\/invite/i.test(text)

      if (isInvite) {
        await sock.sendMessage(from, { delete: msg.key })
        return
      }

      // =========================
      // 🚫 STATUS TAG GROUP SAJA (FIX)
      // =========================
      const context = msg.message?.extendedTextMessage?.contextInfo || {}

      const isStatusGroupTag =
        msg.message?.protocolMessage?.type === 25 // ini biasanya dari status mention

      if (isStatusGroupTag) {
        await sock.sendMessage(from, { delete: msg.key })
        return
      }

      // ❗ group mention biasa DIIZINKAN
      // ❗ tag member DIIZINKAN

    } catch (err) {
      console.log("ERROR:", err)
    }
  })
}

startBot()