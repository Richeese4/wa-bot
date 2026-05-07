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
// LINK DETECTOR
// =========================
function isLink(text = "") {

  const regex =
    /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|t\.me|discord\.gg)/gi

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

      if (msg.key.remoteJid === "status@broadcast")
        return

      const from = msg.key.remoteJid

      const sender =
        (msg.key.participant || from)
        .split(":")[0]

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
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

        const meta =
          await sock.groupMetadata(from)

        const participants =
          meta.participants || []

        // user admin
        const member =
          participants.find(
            v =>
              v.id === sender ||
              v.id === sender + "@s.whatsapp.net"
          )

        // bot admin
        const botNumber =
          sock.user.id.split(":")[0] +
          "@s.whatsapp.net"

        const botData =
          participants.find(
            v => v.id === botNumber
          )

        isAdmin =
          member?.admin
          ? true
          : false

        botAdmin =
          botData?.admin
          ? true
          : false
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
      // FILTER CHAT FIX
      // =========================
      if (
        settings.filterchat.length > 0 &&
        !command.startsWith(".")
      ) {

        const bad =
          settings.filterchat.find(
            x =>
              text.toLowerCase()
              .includes(x.toLowerCase())
          )

        if (bad) {

          try {

            await sock.sendMessage(from, {
              delete: msg.key
            })

          } catch {}
          
          return
        }
      }

      // =========================
      // ANTILINK FIX
      // =========================
      if (
        settings.antilink &&
        isGroup &&
        isLink(text) &&
        !command.startsWith(".")
      ) {

        // admin bypass
        if (
          isAdmin ||
          sender.includes(OWNER_NUMBER)
        ) return

        if (!botAdmin) return

        const warns =
          settings.warns || {}

        if (!warns[sender]) {
          warns[sender] = 0
        }

        warns[sender] += 1

        settings.warns = warns

        await settings.save()

        // hapus pesan
        try {

          await sock.sendMessage(from, {
            delete: msg.key
          })

        } catch {}

        // autokick
        if (
          warns[sender] >=
          settings.maxwarn
        ) {

          await sock.sendMessage(from, {
            text:
`🚫 @${sender.split("@")[0]}
dikeluarkan karena spam link`,
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

        const left =
          settings.maxwarn -
          warns[sender]

        return sock.sendMessage(from, {
          text:
`⚠️ Warning ${warns[sender]}/${settings.maxwarn}

Jangan kirim link lagi
Sisa warning: ${left}`,
          mentions: [sender]
        })
      }

      // =========================
      // FILTERCHAT
      // =========================
      if (command === ".filterchat") {

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

        const action =
          cmd.split(" ")[1]

        const word =
          cmd.split(" ")
          .slice(2)
          .join(" ")

        // LIST
        if (action === "list") {

          if (
            settings.filterchat.length < 1
          ) {

            return sock.sendMessage(from, {
              text:
                "❌ Filter kosong"
            })
          }

          let txt =
            "📌 FILTER CHAT\n\n"

          settings.filterchat.forEach(
            (x, i) => {

              txt +=
`${i + 1}. ${x}\n`
            }
          )

          return sock.sendMessage(from, {
            text: txt
          })
        }

        // ADD
        if (action === "add") {

          if (!word) {

            return sock.sendMessage(from, {
              text:
`.filterchat add kata`
            })
          }

          if (
            !settings.filterchat
            .includes(word)
          ) {

            settings.filterchat.push(word)

            await settings.save()
          }

          return sock.sendMessage(from, {
            text:
`✅ Ditambahkan:
${word}`
          })
        }

        // DELETE FIX
        if (action === "del") {

          if (!word) {

            return sock.sendMessage(from, {
              text:
`.filterchat del kata`
            })
          }

          settings.filterchat =
            settings.filterchat.filter(
              x =>
                x.toLowerCase() !==
                word.toLowerCase()
            )

          await settings.save()

          return sock.sendMessage(from, {
            text:
`✅ Dihapus:
${word}`
          })
        }

        return sock.sendMessage(from, {
          text:
`.filterchat add kata
.filterchat del kata
.filterchat list`
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
`.autokick 1
.autokick 2
.autokick 3`
          })
        }

        settings.maxwarn =
          jumlah

        await settings.save()

        return sock.sendMessage(from, {
          text:
`✅ AutoKick diset:
${jumlah} warning`
        })
      }

      // =========================
      // KICK FIX
      // =========================
      if (command === ".kick") {

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

        if (!botAdmin) {

          return sock.sendMessage(from, {
            text:
              "❌ Bot belum admin"
          })
        }

        let target = null

        // reply target
        const quoted =
          msg.message
          ?.extendedTextMessage
          ?.contextInfo
          ?.participant

        if (quoted) {

          target = quoted
        }

        // nomor target
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

        await sock.groupParticipantsUpdate(
          from,
          [target],
          "remove"
        )

        return sock.sendMessage(from, {
          text:
`✅ Berhasil kick:
@${target.split("@")[0]}`,
          mentions: [target]
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
