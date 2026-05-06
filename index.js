const require("dotenv").config()
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

// MIDTRANS (PAKAI FILE TERPISAH)
const snap = require("./midtrans")

// =========================
// DATABASE (ANTI CRASH)
// =========================
const dbFile = "./db.json"

function loadDB() {
  if (!fs.existsSync(dbFile)) {
    return { orders: {}, users: {}, withdraw: [] }
  }
  return JSON.parse(fs.readFileSync(dbFile))
}

function saveDB(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2))
}

// =========================
// EXPRESS (WEBHOOK)
// =========================
const app = express()
app.use(express.json())

app.get("/", (req, res) => res.send("Bot aktif 🚀"))

let sockGlobal = null

app.post("/callback", async (req, res) => {
  try {
    if (!sockGlobal) return res.send("Bot belum siap")

    const data = req.body
    console.log("🔥 Webhook:", data)

    const orderId = data.order_id
    const status = data.transaction_status

    const db = loadDB()
    if (!db.orders[orderId]) return res.sendStatus(404)

    if (status === "settlement" || status === "capture") {
      db.orders[orderId].status = "PAID"
      saveDB(db)

      const order = db.orders[orderId]

      await sockGlobal.sendMessage(order.buyer, {
        text: `✅ Pembayaran terdeteksi!\nID: ${orderId}`
      })

      await sockGlobal.sendMessage(order.seller, {
        text: `📦 Buyer sudah bayar\nID: ${orderId}\nSilakan kirim barang`
      })
    }

    res.send("OK")
  } catch (err) {
    console.log("WEBHOOK ERROR:", err)
    res.sendStatus(500)
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log("🌐 Web aktif di port", PORT))

// =========================
// START BOT
// =========================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state,
    browser: ["Windows", "Chrome", "120.0.0"]
  })

  sockGlobal = sock
  sock.ev.on("creds.update", saveCreds)

  // =========================
  // CONNECTION (ANTI DC PRO)
  // =========================
  let retry = 0

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log("📱 Scan QR:")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log("✅ BOT AKTIF")
      retry = 0
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      if (shouldReconnect) {
        retry++
        const delay = Math.min(3000 * retry, 15000)

        console.log(`🔁 Reconnect dalam ${delay}ms`)
        setTimeout(startBot, delay)
      } else {
        console.log("🚫 Logout, scan ulang QR")
      }
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
  // WELCOME MEMBER
  // =========================
  sock.ev.on("group-participants.update", async (anu) => {
    try {
      if (anu.action === "add") {
        for (let user of anu.participants) {
          if (fs.existsSync(__dirname + "/welcome.jpg")) {
            await sock.sendMessage(anu.id, {
              image: fs.readFileSync(__dirname + "/welcome.jpg"),
              caption: `👋 Selamat datang @${user.split("@")[0]}\nSemoga betah ya ✨`,
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

      await sock.readMessages([msg.key])

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      // =========================
      // QRIS
      // =========================
      if (text === ".qris") {
        if (fs.existsSync(__dirname + "/qris.jpg")) {
          await sock.sendMessage(from, {
            image: fs.readFileSync(__dirname + "/qris.jpg"),
            caption: "💸 Scan QRIS"
          })
        }
        return
      }

      // =========================
      // REKBER
      // =========================
      if (text.startsWith(".rekber")) {
        const [cmd, nomor, harga] = text.split(" ")

        if (!nomor || !harga) {
          return sock.sendMessage(from, {
            text: "Format:\n.rekber 628xxx 10000"
          })
        }

        const fee = 2000
        const total = parseInt(harga) + fee
        const orderId = "ORD-" + Date.now()

        const trx = await snap.createTransaction({
          transaction_details: {
            order_id: orderId,
            gross_amount: total
          }
        })

        const db = loadDB()

        db.orders[orderId] = {
          buyer: sender,
          seller: nomor + "@s.whatsapp.net",
          amount: parseInt(harga),
          fee,
          total,
          status: "WAITING"
        }

        saveDB(db)

        await sock.sendMessage(from, {
          text: `💳 PEMBAYARAN

ID: ${orderId}
Total: ${total}

Bayar:
${trx.redirect_url}`
        })
      }

      // =========================
      // SELESAI
      // =========================
      if (text.startsWith(".selesai")) {
        const orderId = text.split(" ")[1]
        const db = loadDB()
        const order = db.orders[orderId]

        if (!order) return
        if (order.buyer !== sender) return

        if (order.status !== "PAID") {
          return sock.sendMessage(from, { text: "❌ Belum dibayar" })
        }

        order.status = "DONE"

        if (!db.users[order.seller]) {
          db.users[order.seller] = { balance: 0 }
        }

        db.users[order.seller].balance += order.amount

        saveDB(db)

        await sock.sendMessage(from, {
          text: "✅ Dana dikirim ke seller"
        })
      }

      // =========================
      // SALDO
      // =========================
      if (text === ".saldo") {
        const db = loadDB()
        const user = db.users[sender] || { balance: 0 }

        await sock.sendMessage(from, {
          text: `💰 Saldo: ${user.balance}`
        })
      }

      // =========================
      // WITHDRAW
      // =========================
      if (text.startsWith(".withdraw")) {
        const amount = parseInt(text.split(" ")[1])
        const db = loadDB()

        const user = db.users[sender]

        if (!user || user.balance < amount) {
          return sock.sendMessage(from, {
            text: "❌ Saldo tidak cukup"
          })
        }

        user.balance -= amount

        db.withdraw.push({
          user: sender,
          amount,
          status: "PENDING"
        })

        saveDB(db)

        await sock.sendMessage(from, {
          text: "📤 Withdraw diproses"
        })
      }

      // =========================
      // FILTER GRUP
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
            return
          }
        }
      }

    } catch (err) {
      console.log("ERROR:", err)
    }
  })
}

// =========================
// GLOBAL ANTI CRASH
// =========================
process.on("uncaughtException", console.log)
process.on("unhandledRejection", console.log)

// =========================
// KEEP ALIVE LOG
// =========================
setInterval(() => {
  console.log("🟢 Bot hidup:", new Date().toLocaleTimeString())
}, 60000)

// =========================
// RUN
// =========================
startBot()
