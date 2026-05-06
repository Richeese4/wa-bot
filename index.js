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
// KEEP ALIVE
// =========================
const app = express()
app.get("/", (req, res) => res.send("Bot aktif 🚀"))
app.listen(3000, () => console.log("🌐 Web aktif di port 3000"))

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
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log("📱 Scan QR:")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log("✅ BOT AKTIF")
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      if (shouldReconnect) startBot()
    }
  })

  // =========================
  // AUTO REJECT CALL
  // =========================
  sock.ev.on("call", async (calls) => {
    for (let call of calls) {
      if (call.status === "offer") {
        await sock.rejectCall(call.id, call.from)
      }
    }
  })

  // =========================
  // WELCOME
  // =========================
  sock.ev.on("group-participants.update", async (anu) => {
    try {
      if (anu.action === "add") {
        for (let user of anu.participants) {
          if (fs.existsSync("./welcome.jpg")) {
            await sock.sendMessage(anu.id, {
              image: fs.readFileSync("./welcome.jpg"),
              caption: `👋 Selamat datang @${user.split("@")[0]} di group!`,
              mentions: [user]
            })
          }
        }
      }
    } catch {}
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

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      await sock.readMessages([msg.key])

      // =========================
      // MENU
      // =========================
      if (text === ".menu") {
        await sock.sendMessage(from, {
          text: `👋 Hallo Kak @${sender.split("@")[0]}

Ada yang bisa aku bantu?

📌 *PILIH MENU*
1. Jasa Joki
2. Rekber / Midman
3. Payment

Ketik angka (contoh: 1)`,
          mentions: [sender]
        })
        return
      }

      // =========================
      // MENU 1 - JOKI
      // =========================
      if (text === "1") {
        await sock.sendMessage(from, {
          text: `📌 *LIST JOKI BY ZNOIDFAMZ*

Joki Level
-100 level = 2k (sea 3) 
-100 level = 3k (sea 2) 
-100 level = 4k (sea 1) 
-500 level =10k (sea 3) 
-1k level =18k (sea 3)

JOKI MASTERY
-100 mastery (3k) (sea 3&2) 
-100 mastery (4k) (sea 1)

Joki Sword
-CDK (20k)
-Yama (10k)
-Tushita (12k)

Joki Fighting Style
-God Human (20k)
-Dragon Talon (14k)

Dan masih banyak lagi...

📩 Minat? Chat admin!`
        })
        return
      }

      // =========================
      // MENU 2 - REKBER
      // =========================
      if (text === "2") {
        await sock.sendMessage(from, {
          text: `📌 *LIST FEE REKBER*

1.000 - 20.000 = 2.000
21.000 - 99.000 = 3.000
100.000 - 299.000 = 5.000
300.000 - 499.000 = 7.000
500.000 - 999.000 = 10.000

📩 Lanjut transaksi?
Ketik *.qris* untuk pembayaran`
        })
        return
      }

      // =========================
      // MENU 3 - PAYMENT
      // =========================
      if (text === "3") {
        await sock.sendMessage(from, {
          text: `💳 *PAYMENT*

1. QRIS (ketik .qris)
2. DANA: 081290783833
3. GOPAY: 081290783833
4. BCA: 3780620578

⚠️ Pastikan cek ulang sebelum transfer`
        })
        return
      }

      // =========================
      // QRIS
      // =========================
      if (text === ".qris") {
        if (fs.existsSync("./qris.jpg")) {
          await sock.sendMessage(from, {
            image: fs.readFileSync("./qris.jpg"),
            caption: "💸 Scan QRIS"
          })
        }
        return
      }

      // =========================
      // ANTI LINK (GROUP ONLY)
      // =========================
      if (isGroup) {
        let isAdmin = false
        try {
          const meta = await sock.groupMetadata(from)
          isAdmin = meta.participants.some(
            (p) => p.id === sender && p.admin !== null
          )
        } catch {}

        if (!isAdmin) {
          const isInvite =
            /chat\.whatsapp\.com/i.test(text) ||
            /whatsapp\.com\/invite/i.test(text)

          if (isInvite) {
            await sock.sendMessage(from, { delete: msg.key })
          }
        }
      }

    } catch (err) {
      console.log("ERROR:", err)
    }
  })
}

// =========================
// RUN
// =========================
startBot()
