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

// =========================
// LINK DETECTOR FIX
// =========================
function isLink(text) {

  const regex =
    /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(chat\.whatsapp\.com\/[A-Za-z0-9]+)/gi

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
  // MESSAGE
  // =========================
  sock.ev.on("messages.upsert", async ({ messages }) => {

    try {

      const msg = messages[0]
      if (!msg.message) return

      // skip status
      if (msg.key.remoteJid === "status@broadcast")
        return

      // skip bot sendiri
      if (msg.key.fromMe)
        return

      const from = msg.key.remoteJid

      const sender =
        (msg.key.participant || from)
        .split(":")[0]

      // =========================
      // TEXT DETECTOR FIX
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

      const isGroup =
        from.endsWith("@g.us")

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
      // ADMIN CHECK FIX
      // =========================
      let isAdmin = false
      let botAdmin = false

      if (isGroup) {

        const metadata =
          await sock.groupMetadata(from)

        const participants =
          metadata.participants || []

        // user admin
        const member =
          participants.find(
            v =>
              v.id.split(":")[0] === sender
          )

        // bot admin
        const botId =
          sock.user.id.split(":")[0]

        const bot =
          participants.find(
            v =>
              v.id.split(":")[0] === botId
          )

        isAdmin =
          member?.admin === "admin" ||
          member?.admin === "superadmin"

        botAdmin =
          bot?.admin === "admin" ||
          bot?.admin === "superadmin"
      }

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
@${sender.split("@")[0]}

📅 Expired:
${format(data.expired)}`,
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
      // ANTILINK FIX
      // =========================
      if (
        settings.antilink &&
        isGroup &&
        isLink(text)
      ) {

        // admin bebas
        if (isAdmin)
          return

        // owner bebas
        if (
          sender.includes(OWNER_NUMBER)
        ) return

        // bot harus admin
        if (!botAdmin) {

          return sock.sendMessage(from, {
            text:
              "❌ Bot harus admin agar antilink bekerja"
          })
        }

        // DELETE PESAN
        try {

          await sock.sendMessage(from, {
            delete: {
              remoteJid: from,
              fromMe: false,
              id: msg.key.id,
              participant: msg.key.participant || sender
            }
          })

        } catch (err) {

          console.log(
            "DELETE ERROR:",
            err.message
          )
        }

        // WARNING
        const warns =
          settings.warns || {}

        if (!warns[sender]) {
          warns[sender] = 0
        }

        warns[sender] += 1

        settings.warns = warns

        await settings.save()

        const totalWarn =
          warns[sender]

        const maxWarn =
          settings.maxwarn

        // AUTOKICK
        if (totalWarn >= maxWarn) {

          await sock.sendMessage(from, {
            text:
`🚫 @${sender.split("@")[0]}
dikeluarkan karena mengirim link`,
            mentions: [sender]
          })

          await sock.groupParticipantsUpdate(
            from,
            [sender],
            "remove"
          )

          delete warns[sender]

          settings.warns = warns

          await settings.save()

          return
        }

        return sock.sendMessage(from, {
          text:
`⚠️ WARNING ${totalWarn}/${maxWarn}

Jangan kirim link di group.`,
          mentions: [sender]
        })
      }

      // =========================
      // MENU
      // =========================
      if (command === ".menu") {

        return sock.sendMessage(from, {
          text:
`📌 MENU BOT

.antilink on/off
.autokick 3
.kick
.linkgroup
.owner
.masaaktif`
        })
      }

      // =========================
      // ANTILINK
      // =========================
      if (command === ".antilink") {

        if (!isAdmin) {

          return sock.sendMessage(from, {
            text:
              "❌ Khusus admin"
          })
        }

        const value =
          cmd.split(" ")[1]

        if (
          !["on", "off"]
          .includes(value)
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
      // AUTOKICK
      // =========================
      if (command === ".autokick") {

        if (!isAdmin) {

          return sock.sendMessage(from, {
            text:
              "❌ Khusus admin"
          })
        }

        const jumlah =
          parseInt(
            cmd.split(" ")[1]
          )

        if (
          !jumlah ||
          jumlah < 1
        ) {

          return sock.sendMessage(from, {
            text:
`.autokick 3`
          })
        }

        settings.maxwarn =
          jumlah

        await settings.save()

        return sock.sendMessage(from, {
          text:
`✅ AutoKick:
${jumlah} warning`
        })
      }

      // =========================
      // KICK FIX
      // =========================
      if (command === ".kick") {

        if (!isGroup)
          return

        if (!isAdmin) {

          return sock.sendMessage(from, {
            text:
              "❌ Khusus admin"
          })
        }

        if (!botAdmin) {

          return sock.sendMessage(from, {
            text:
              "❌ Bot bukan admin"
          })
        }

        let target = null

        // reply
        const quoted =
          msg.message?.extendedTextMessage
            ?.contextInfo?.participant

        if (quoted) {

          target =
            quoted.split(":")[0] +
            "@s.whatsapp.net"
        }

        // nomor manual
        else {

          const nomor =
            cmd.split(" ")[1]

          if (!nomor) {

            return sock.sendMessage(from, {
              text:
`.kick 628xxxx

atau reply pesan target`
            })
          }

          target =
            nomor.replace(/[^0-9]/g, "") +
            "@s.whatsapp.net"
        }

        // tidak bisa kick admin
        const metadata =
          await sock.groupMetadata(from)

        const participants =
          metadata.participants || []

        const targetUser =
          participants.find(
            v =>
              v.id.split(":")[0] ===
              target.split("@")[0]
          )

        if (
          targetUser?.admin === "admin" ||
          targetUser?.admin === "superadmin"
        ) {

          return sock.sendMessage(from, {
            text:
              "❌ Tidak bisa kick admin"
          })
        }

        try {

          await sock.groupParticipantsUpdate(
            from,
            [target],
            "remove"
          )

          return sock.sendMessage(from, {
            text:
              "✅ Berhasil kick member"
          })

        } catch (err) {

          return sock.sendMessage(from, {
            text:
`❌ Gagal kick

${err.message}`
          })
        }
      }

      // =========================
      // LINK GROUP
      // =========================
      if (command === ".linkgroup") {

        if (!isGroup)
          return

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
      // OWNER
      // =========================
      if (command === ".owner") {

        return sock.sendMessage(from, {
          text:
`📞 OWNER

wa.me/${OWNER_NUMBER}`
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
