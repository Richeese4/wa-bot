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
// MONGO CONNECT
// =========================
const MONGO_URI =
  "mongodb+srv://znoidfamz_db_user:hHoRUaiak5EuQAft@znoidfamz.svbkerf.mongodb.net/bot?retryWrites=true&w=majority"

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 15000
})
.then(() => console.log("MongoDB CONNECTED"))
.catch(err => console.log("MongoDB ERROR:", err.message))

// =========================
// DATABASE
// =========================
const User = mongoose.model("User", new mongoose.Schema({
  key: String,
  role: {
    type: String,
    default: "user"
  },
  expired: Number,
  createdAt: Number
}))

// LOGIN PER GROUP
const Session = mongoose.model("Session", new mongoose.Schema({
  group: String,
  admin: String,
  role: String,
  key: String,
  expired: Number,
  loginAt: Number
}))

// =========================
// EXPRESS
// =========================
const app = express()

app.get("/", (_, res) => {
  res.send("BOT ACTIVE")
})

app.listen(3000)

// =========================
// FORMAT WAKTU
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

  const { state, saveCreds } =
    await useMultiFileAuthState("session")

  const { version } =
    await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state
  })

  sock.ev.on("creds.update", saveCreds)

  // =========================
  // CONNECTION
  // =========================
  sock.ev.on("connection.update", ({
    connection,
    qr,
    lastDisconnect
  }) => {

    if (qr) {
      qrcode.generate(qr, {
        small: true
      })
    }

    if (connection === "open") {
      console.log("BOT ONLINE")
    }

    if (connection === "close") {

      const reconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut

      if (reconnect) {
        startBot()
      }
    }
  })

  // =========================
  // WELCOME / LEAVE
  // =========================
  sock.ev.on("group-participants.update", async (m) => {

    try {

      // MEMBER MASUK
      if (m.action === "add") {

        for (let p of m.participants) {

          await sock.sendMessage(m.id, {
            image: fs.readFileSync("./welcome.jpg"),
            caption: 👋 Welcome @${p.split("@")[0]},
            mentions: [p]
          })
        }
      }

      // MEMBER KELUAR
      if (m.action === "remove") {

        for (let p of m.participants) {

          await sock.sendMessage(m.id, {
            image: fs.readFileSync("./keluar.jpg"),
            caption: 👋 @${p.split("@")[0]} keluar,
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

    try {

      const msg = messages[0]
      if (!msg.message) return

      const from = msg.key.remoteJid

      const sender =
        (msg.key.participant || from).split(":")[0]

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      const cmd = text.toLowerCase().trim()

      const isGroup = from.endsWith("@g.us")

      // =========================
      // SESSION GROUP
      // =========================
      let session = isGroup
        ? await Session.findOne({ group: from })
        : null

      // =========================
      // BLOCK BELUM LOGIN
      // =========================
      if (
        !session &&
        cmd.startsWith(".") &&
        !cmd.startsWith(".login")
      ) {

        return sock.sendMessage(from, {
          text:
`❌ Admin group belum login

Silahkan admin group login:
.login key`
        })
      }

      // =========================
      // LOGIN SYSTEM
      // =========================
      if (cmd.startsWith(".login")) {

        // wajib group
        if (!isGroup) {
          return sock.sendMessage(from, {
            text: "❌ Login hanya bisa di group"
          })
        }

        // cek admin
        const meta =
          await sock.groupMetadata(from)

        const member =
          meta.participants.find(
            x => x.id === sender
          )

        const isAdmin =
          member?.admin ? true : false

        // owner bypass
        const inputKey =
          cmd.split(" ")[1]

        const isOwner =
          inputKey === OWNER_KEY

        if (!isAdmin && !isOwner) {

          return sock.sendMessage(from, {
            text:
              "❌ Hanya admin group yang bisa login"
          })
        }

        // =========================
        // OWNER LOGIN
        // =========================
        if (inputKey === OWNER_KEY) {

          await Session.findOneAndUpdate(
            { group: from },
            {
              group: from,
              admin: sender,
              role: "owner",
              key: inputKey,
              expired: Infinity,
              loginAt: Date.now()
            },
            { upsert: true }
          )

          return sock.sendMessage(from, {
            text:
`👑 OWNER LOGIN SUCCESS

✅ Bot aktif untuk group ini`
          })
        }

        // =========================
        // USER LOGIN
        // =========================
        const data =
          await User.findOne({
            key: inputKey
              .trim()
              .toUpperCase()
          })

        if (
          !data ||
          Date.now() > data.expired
        ) {

          return sock.sendMessage(from, {
            text:
              "❌ Key invalid / expired"
          })
        }

        await Session.findOneAndUpdate(
          { group: from },
          {
            group: from,
            admin: sender,
            role: data.role,
            key: data.key,
            expired: data.expired,
            loginAt: Date.now()
          },
          { upsert: true }
        )

        return sock.sendMessage(from, {
          text:
`✅ LOGIN SUCCESS

👮 Admin:
@${sender.split("@")[0]}

📅 Expired:
${format(data.expired)}

✅ Bot aktif untuk group ini`,
          mentions: [sender]
        })
      }

      // =========================
      // REFRESH SESSION
      // =========================
      session =
        await Session.findOne({
          group: from
        })

      if (!session) return

      // =========================
      // ROLE
      // =========================
      const currentRole =
        session.role || "user"

      // =========================
      // EXPIRED CHECK
      // =========================
      if (
        session.expired !== Infinity &&
        Date.now() > session.expired
      ) {

        await Session.deleteOne({
          group: from
        })

        return sock.sendMessage(from, {
          text: "❌ Session expired"
        })
      }

      // =========================
      // MENU
      // =========================
      if (cmd === ".menu") {

        // OWNER
        if (currentRole === "owner") {

          return sock.sendMessage(from, {
            text:
`👑 OWNER MENU

.genkey <hari>
.genkeyp <hari>
.panel

.linkgroup
.sticker`
          })
        }

        // PREMIUM
        if (currentRole === "premium") {

          return sock.sendMessage(from, {
            text:
`⭐ PREMIUM MENU

.linkgroup
.sticker
.filterchat
.autokick`
          })
        }

        // USER
        return sock.sendMessage(from, {
          text:
`📌 USER MENU

.linkgroup
.sticker
.masaaktif`
        })
      }

      // =========================
      // USER LIMIT
      // =========================
      const userLimit = [
        ".menu",
        ".linkgroup",
        ".sticker",
        ".masaaktif"
      ]

      if (
        currentRole === "user" &&
        cmd.startsWith(".") &&
        !userLimit.includes(
          cmd.split(" ")[0]
        )
      ) {

        return sock.sendMessage(from, {
          text:
            "❌ Akses user terbatas"
        })
      }

      // =========================
      // LINK GROUP
      // =========================
      if (cmd === ".linkgroup") {

        if (!isGroup) return

        const code =
          await sock.groupInviteCode(from)

        return sock.sendMessage(from, {
          text:
            "https://chat.whatsapp.com/" + code
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
      // MASAAKTIF
      // =========================
      if (cmd === ".masaaktif") {

        return sock.sendMessage(from, {
          text:
`📅 MASA AKTIF BOT

Expired:
${format(session.expired)}

Menu:
.perpanjang
.premium`
        })
      }

      // =========================
      // GENKEY OWNER
      // =========================
      if (cmd.startsWith(".genkey")) {

        if (currentRole !== "owner")
          return

        const hari =
          parseInt(cmd.split(" ")[1])

        if (!hari || hari < 1) {

          return sock.sendMessage(from, {
            text:
`Contoh:
.genkey 1
.genkey 7
.genkey 30`
          })
        }

        const key =
          "KEY-" +
          Math.random()
            .toString(36)
            .slice(2, 10)
            .toUpperCase()

        const exp =
          Date.now() +
          (
            hari *
            24 *
            60 *
            60 *
            1000
          )

        await User.create({
          key: key,
          role: "user",
          expired: exp,
          createdAt: Date.now()
        })

        return sock.sendMessage(from, {
          text:
`✅ KEY BERHASIL DIGENERATE

🔑 Key:
${key}

⏳ Masa Aktif:
${hari} Hari

📅 Expired:
${format(exp)}`
        })
      }

      // =========================
      // PANEL
      // =========================
      if (cmd === ".panel") {

        if (currentRole !== "owner")
          return

        const all =
          await User.find()

        let t =
          "📌 ACTIVE KEYS\n\n"

        all.forEach((x, i) => {

          t +=
`${i + 1}. ${x.key}
Role: ${x.role}
Expired: ${format(x.expired)}

`
        })

        return sock.sendMessage(from, {
          text: t
        })
      }

    } catch (e) {

      console.log(
        "ERROR:",
        e.message
      )
    }
  })
}

startBot()
