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

app.listen(3000, () => {
  console.log("Express Running")
})

// =========================
// FORMAT WAKTU
// =========================
function format(ms) {

  if (!ms || ms === 9999999999999) {
    return "Permanent"
  }

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
    logger: P({
      level: "silent"
    }),
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

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut

      console.log("Connection Closed")

      if (shouldReconnect) {
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
            caption: `👋 Welcome @${p.split("@")[0]}`,
            mentions: [p]
          })
        }
      }

      // MEMBER KELUAR
      if (m.action === "remove") {

        for (let p of m.participants) {

          await sock.sendMessage(m.id, {
            image: fs.readFileSync("./keluar.jpg"),
            caption: `👋 @${p.split("@")[0]} keluar`,
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

      // skip status
      if (msg.key.remoteJid === "status@broadcast") return

      const from = msg.key.remoteJid

      const sender =
        (msg.key.participant || from)
        .split(":")[0]

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      if (!text) return

      const cmd = text.trim()
      const command =
        cmd.split(" ")[0].toLowerCase()

      const isGroup =
        from.endsWith("@g.us")

      // =========================
      // SESSION
      // =========================
      let session = isGroup
        ? await Session.findOne({
            group: from
          })
        : null

      // =========================
      // BLOCK BELUM LOGIN
      // =========================
      if (
        !session &&
        command.startsWith(".") &&
        command !== ".login"
      ) {

        return sock.sendMessage(from, {
          text:
`❌ Admin group belum login

Silahkan login:
.login key`
        })
      }

      // =========================
      // LOGIN
      // =========================
      if (command === ".login") {

        if (!isGroup) {

          return sock.sendMessage(from, {
            text:
              "❌ Login hanya di group"
          })
        }

        const inputKey =
          cmd.split(" ")[1]

        if (!inputKey) {

          return sock.sendMessage(from, {
            text:
`Contoh:
.login KEY-XXXX`
          })
        }

        const meta =
          await sock.groupMetadata(from)

        const member =
          meta.participants.find(
            x => x.id === sender
          )

        const isAdmin =
          !!member?.admin

        const isOwner =
          inputKey === OWNER_KEY

        if (!isAdmin && !isOwner) {

          return sock.sendMessage(from, {
            text:
              "❌ Hanya admin group"
          })
        }

        // OWNER LOGIN
        if (isOwner) {

          await Session.findOneAndUpdate(
            { group: from },
            {
              group: from,
              admin: sender,
              role: "owner",
              key: inputKey,
              expired: 9999999999999,
              loginAt: Date.now()
            },
            { upsert: true }
          )

          return sock.sendMessage(from, {
            text:
`👑 OWNER LOGIN SUCCESS

✅ Bot aktif`
          })
        }

        // USER LOGIN
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
${format(data.expired)}`,
          mentions: [sender]
        })
      }

      // =========================
      // REFRESH SESSION
      // =========================
      session = await Session.findOne({
        group: from
      })

      if (!session) return

      const currentRole =
        session.role || "user"

      // =========================
      // EXPIRED
      // =========================
      if (
        session.expired !== 9999999999999 &&
        Date.now() > session.expired
      ) {

        await Session.deleteOne({
          group: from
        })

        return sock.sendMessage(from, {
          text:
            "❌ Session expired"
        })
      }

      // =========================
      // MENU
      // =========================
      if (command === ".menu") {

        // OWNER
        if (currentRole === "owner") {

          return sock.sendMessage(from, {
            text:
`👑 OWNER MENU

.genkey <hari>
.genprem <hari>
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
.sticker`
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
        command.startsWith(".") &&
        !userLimit.includes(command)
      ) {

        return sock.sendMessage(from, {
          text:
            "❌ Akses user terbatas"
        })
      }

      // =========================
      // LINK GROUP
      // =========================
      if (command === ".linkgroup") {

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
      if (command === ".sticker") {

        return sock.sendMessage(from, {
          text:
            "✅ Sticker system aktif"
        })
      }

      // =========================
      // MASAAKTIF
      // =========================
      if (command === ".masaaktif") {

        return sock.sendMessage(from, {
          text:
`📅 MASA AKTIF BOT

Expired:
${format(session.expired)}`
        })
      }

      // =========================
      // GENKEY USER
      // =========================
      if (command === ".genkey") {

        if (currentRole !== "owner")
          return

        const hari =
          parseInt(cmd.split(" ")[1])

        if (!hari) {

          return sock.sendMessage(from, {
            text:
`Contoh:
.genkey 7`
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
            86400000
          )

        await User.create({
          key,
          role: "user",
          expired: exp,
          createdAt: Date.now()
        })

        return sock.sendMessage(from, {
          text:
`✅ USER KEY

🔑 ${key}

⏳ ${hari} Hari
📅 ${format(exp)}`
        })
      }

      // =========================
      // GENKEY PREMIUM
      // =========================
      if (command === ".genprem") {

        if (currentRole !== "owner")
          return

        const hari =
          parseInt(cmd.split(" ")[1])

        if (!hari) {

          return sock.sendMessage(from, {
            text:
`Contoh:
.genprem 30`
          })
        }

        const key =
          "PREM-" +
          Math.random()
          .toString(36)
          .slice(2, 10)
          .toUpperCase()

        const exp =
          Date.now() +
          (
            hari *
            86400000
          )

        await User.create({
          key,
          role: "premium",
          expired: exp,
          createdAt: Date.now()
        })

        return sock.sendMessage(from, {
          text:
`⭐ PREMIUM KEY

🔑 ${key}

⏳ ${hari} Hari
📅 ${format(exp)}`
        })
      }

      // =========================
      // PANEL
      // =========================
      if (command === ".panel") {

        if (currentRole !== "owner")
          return

        const all =
          await User.find()

        let txt =
          "📌 ACTIVE KEYS\n\n"

        all.forEach((x, i) => {

          txt +=
`${i + 1}. ${x.key}
Role: ${x.role}
Expired: ${format(x.expired)}

`
        })

        return sock.sendMessage(from, {
          text: txt
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
