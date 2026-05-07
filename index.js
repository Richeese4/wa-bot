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
// DETECT LINK
// =========================
function isLink(text) {

  const regex =
    /(https?:\/\/\S+|chat\.whatsapp\.com\/\S+|wa\.me\/\S+)/gi

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

      if (msg.key.remoteJid === "status@broadcast")
        return

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
      // ADMIN CHECK
      // =========================
      let isAdmin = false
      let botAdmin = false

      if (isGroup) {

        const meta =
          await sock.groupMetadata(from)

        const member =
          meta.participants.find(
            x => x.id === sender
          )

        const botNumber =
          sock.user.id.split(":")[0] +
          "@s.whatsapp.net"

        const bot =
          meta.participants.find(
            x => x.id === botNumber
          )

        isAdmin =
          !!member?.admin

        botAdmin =
          !!bot?.admin
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
      // FILTER CHAT
      // =========================
      if (
        settings.filterchat.length > 0 &&
        !command.startsWith(".filterchat")
      ) {

        const bad =
          settings.filterchat.find(x =>
            text.toLowerCase()
            .includes(x.toLowerCase())
          )

        if (bad) {

          try {

            await sock.sendMessage(from, {
              delete: {
                remoteJid: from,
                fromMe: false,
                id: msg.key.id,
                participant: sender
              }
            })

          } catch (e) {
            console.log(
              "DELETE FILTER ERROR:",
              e.message
            )
          }

          return
        }
      }

      // =========================
      // ANTILINK
      // =========================
      if (
        settings.antilink &&
        isGroup
      ) {

        const detectLink =
          isLink(text)

        if (detectLink) {

          if (
            isAdmin ||
            sender.includes(OWNER_NUMBER)
          ) return

          if (!botAdmin) {

            return sock.sendMessage(from, {
              text:
                "❌ Bot harus admin agar antilink bekerja"
            })
          }

          const warns =
            settings.warns || {}

          if (!warns[sender]) {
            warns[sender] = 0
          }

          warns[sender] += 1

          settings.warns = warns

          await settings.save()

          const left =
            settings.maxwarn -
            warns[sender]

          // DELETE PESAN
          try {

            await sock.sendMessage(from, {
              delete: {
                remoteJid: from,
                fromMe: false,
                id: msg.key.id,
                participant: sender
              }
            })

          } catch (e) {
            console.log(
              "DELETE LINK ERROR:",
              e.message
            )
          }

          // AUTO KICK
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

            try {

              await sock.groupParticipantsUpdate(
                from,
                [sender],
                "remove"
              )

            } catch (e) {
              console.log(
                "KICK ERROR:",
                e.message
              )
            }

            delete warns[sender]

            settings.warns = warns

            await settings.save()

            return
          }

          return sock.sendMessage(from, {
            text:
`⚠️ Warning ${warns[sender]}/${settings.maxwarn}

Jangan kirim link lagi
Sisa warning: ${left}`,
            mentions: [sender]
          })
        }
      }

      // =========================
      // MENU
      // =========================
      if (command === ".menu") {

        return sock.sendMessage(from, {
          text:
`✅ BOT ACTIVE`
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
      // FILTER CHAT
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

        if (!action) {

          return sock.sendMessage(from, {
            text:
`.filterchat add kata
.filterchat del kata`
          })
        }

        // ADD
        if (action === "add") {

          if (!word) {

            return sock.sendMessage(from, {
              text:
                "❌ Masukkan kata"
            })
          }

          if (
            !settings.filterchat
            .includes(word)
          ) {

            settings.filterchat
            .push(word)

            await settings.save()
          }

          return sock.sendMessage(from, {
            text:
`✅ Ditambahkan:
${word}`
          })
        }

        // DELETE
        if (action === "del") {

          settings.filterchat =
            settings.filterchat.filter(
              x => x !== word
            )

          await settings.save()

          return sock.sendMessage(from, {
            text:
`✅ Dihapus:
${word}`
          })
        }
      }

      // =========================
      // KICK
      // =========================
      if (command === ".kick") {

        if (
          currentRole !== "premium" &&
          currentRole !== "owner"
        ) return

        if (!isGroup) {

          return sock.sendMessage(from, {
            text:
              "❌ Command hanya untuk group"
          })
        }

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

        // VIA REPLY
        if (
          msg.message?.extendedTextMessage
            ?.contextInfo?.participant
        ) {

          target =
            msg.message
            .extendedTextMessage
            .contextInfo
            .participant
        }

        // VIA NOMOR
        else {

          const nomor =
            cmd.split(" ")[1]

          if (!nomor) {

            return sock.sendMessage(from, {
              text:
`.kick 628xxxx`
            })
          }

          target =
            nomor.replace(/[^0-9]/g, "") +
            "@s.whatsapp.net"
        }

        const meta =
          await sock.groupMetadata(from)

        const targetData =
          meta.participants.find(
            x => x.id === target
          )

        if (!targetData) {

          return sock.sendMessage(from, {
            text:
              "❌ User tidak ditemukan"
          })
        }

        if (targetData.admin) {

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
`✅ Berhasil kick
@${target.split("@")[0]}`,
            mentions: [target]
          })

        } catch (e) {

          console.log(
            "KICK ERROR:",
            e.message
          )

          return sock.sendMessage(from, {
            text:
              "❌ Gagal kick member"
          })
        }
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
