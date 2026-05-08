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

const GroupSettings = mongoose.model("GroupSettings", new mongoose.Schema({
  group: String,

  antilink: {
    type: Boolean,
    default: false
  },

  maxwarn: {
    type: Number,
    default: 3
  },

  filterchat: {
    type: [String],
    default: []
  },

  warns: {
    type: Object,
    default: {}
  }
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
// FORMAT
// =========================
function format(ms) {

  if (!ms || ms === 9999999999999) {
    return "Permanent"
  }

  return new Date(ms).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta"
  })
}

function isLink(text) {

  const regex =
    /(https?:\/\/|chat\.whatsapp\.com|wa\.me)/gi

  return regex.test(text)
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

    } catch (e) {
      console.log(e)
    }
  })

  // =========================
  // MESSAGE
  // =========================
  sock.ev.on("messages.upsert", async ({ messages }) => {

    try {

      const msg = messages[0]

      if (!msg.message) return

      if (msg.key.remoteJid === "status@broadcast")
        return

      const from = msg.key.remoteJid

      if (!from) return

      const isGroup =
        from.endsWith("@g.us")

      // =========================
      // SENDER
      // =========================
      const sender =
        (msg.key.participant || from)
          .replace(/:\d+/g, "")
          .replace("@s.whatsapp.net", "")

      // =========================
      // TEXT
      // =========================
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        ""

      if (!text) return

      const cmd = text.trim()

      const command =
        cmd.split(" ")[0].toLowerCase()

      // =========================
      // SETTINGS
      // =========================
      let settings =
        await GroupSettings.findOne({
          group: from
        })

      if (!settings) {

        settings =
          await GroupSettings.create({
            group: from
          })
      }

      // =========================
      // SESSION
      // =========================
      let session = null

      if (isGroup) {

        session =
          await Session.findOne({
            group: from
          })
      }

      // =========================
      // ADMIN CHECK
      // =========================
      let isAdmin = false
      let botAdmin = false

      if (isGroup) {

        const meta =
          await sock.groupMetadata(from)

        const botId =
          sock.user.id
            .replace(/:\d+/g, "")
            .replace("@s.whatsapp.net", "")

        const member =
          meta.participants.find(x => {

            const id =
              x.id
                .replace(/:\d+/g, "")
                .replace("@s.whatsapp.net", "")

            return id === sender
          })

        const bot =
          meta.participants.find(x => {

            const id =
              x.id
                .replace(/:\d+/g, "")
                .replace("@s.whatsapp.net", "")

            return id === botId
          })

        isAdmin =
          member?.admin === "admin" ||
          member?.admin === "superadmin"

        botAdmin =
          bot?.admin === "admin" ||
          bot?.admin === "superadmin"

        console.log({
          sender,
          bot: botId,
          memberFound: !!member,
          botFound: !!bot,
          isAdmin,
          botAdmin
        })
      }

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
`.login KEY-XXXX`
          })
        }

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
@${sender}

📅 Expired:
${format(data.expired)}`,
          mentions: [`${sender}@s.whatsapp.net`]
        })
      }

      // =========================
      // REFRESH SESSION
      // =========================
      if (isGroup) {

        session =
          await Session.findOne({
            group: from
          })
      }

      if (!session) return

      // =========================
      // ROLE
      // =========================
      const currentRole =
        session?.role || "user"

      // =========================
      // EXPIRED
      // =========================
      if (
        session?.expired !== 9999999999999 &&
        Date.now() > session?.expired
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
      // USER LIMIT
      // =========================
      const userLimit = [
        ".menu",
        ".linkgroup",
        ".sticker",
        ".masaaktif",
        ".owner",
        ".contact",
        ".sewabot"
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
      // MENU
      // =========================
      if (command === ".menu") {

        return sock.sendMessage(from, {
          text:
`📌 MENU BOT

Role:
${currentRole}

.linkgroup
.masaaktif
.owner`
        })
      }

      // =========================
      // OWNER
      // =========================
      if (command === ".owner") {

        return sock.sendMessage(from, {
          text:
`👑 OWNER

wa.me/${OWNER_NUMBER}`
        })
      }

      // =========================
      // LINK GROUP
      // =========================
      if (command === ".linkgroup") {

        if (!isGroup) {

          return sock.sendMessage(from, {
            text:
              "❌ Khusus group"
          })
        }

        const code =
          await sock.groupInviteCode(from)

        return sock.sendMessage(from, {
          text:
            "https://chat.whatsapp.com/" + code
        })
      }

      // =========================
      // MASA AKTIF
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
      // ANTILINK
      // =========================
      if (command === ".antilink") {

        if (
          currentRole !== "premium" &&
          currentRole !== "owner"
        ) return

        if (!isAdmin) {

          return sock.sendMessage(from, {
            text:
              "❌ Khusus admin"
          })
        }

        const value =
          cmd.split(" ")[1]

        if (
          !["on", "off"].includes(value)
        ) {

          return sock.sendMessage(from, {
            text:
`.antilink on
.antilink off`
          })
        }

        settings.antilink =
          value === "on"

        await settings.save()

        return sock.sendMessage(from, {
          text:
`✅ Antilink ${value}`
        })
      }

      // =========================
      // GENKEY
      // =========================
      if (command === ".genkey") {

        if (currentRole !== "owner")
          return

        const hari =
          parseInt(cmd.split(" ")[1])

        if (!hari) {

          return sock.sendMessage(from, {
            text:
`.genkey 7`
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
          (hari * 86400000)

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
        e
      )
    }
  })
}

startBot()
