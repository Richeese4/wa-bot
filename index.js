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

      // 🔥 FIX BESAR DI SINI (WAJIB)
      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        ""
      ).trim().toLowerCase()

      // DEBUG (hapus nanti kalau sudah normal)
      console.log("📩 TEXT:", text)

      await sock.readMessages([msg.key])

      // =========================
      // MENU
      // =========================
      if (text === ".menu") {
        const username = sender.split("@")[0]

        await sock.sendMessage(from, {
          text: `👋 Hallo Kak @${username}

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
-1k level   =18k (sea 3) 

JOKI MASTERY
-100 mastery (3k) (sea 3&2) 
-100 mastery (4k) (sea 1) 
-500 mastery (12k) (sea 3&2)

Joki Sword

-CDK (20k) 
-Dragon heart (20k) 
-shark anchor (15k) 
-yama (10k)
-tushita (12k)
-rengoku (5k)
-saber (3k) 
-spikey trident (10k)
-dragon trident (6k) 
-gravity sword (5k) 
-pole v1 (7k) 
-pole v2 (10k) 
-shizu (10k) 
-saishi (10k) 
-oroshi (10k) 

JOKI FIGHTING STYLE
-Sanguine Art (30K)
-God Human (20k) (semua fs masterynya udah cukup) 
-God Human (25k) (belum cukup mastery semua fs) 
-Super Human (10k) (udah full mastery semua fs) 
-Super Human (15k) (belum full mastery semua fs) 
-Dragon Talon (14k) 
-Sharkman Karate (12k) 
-Death Step (12k) 
-Eletric Claw (12k) 

Joki Raid dan Fragment

-raid normal (2k)
-raid advanced (4k)
-1k frag (1k)
-5k frag (4k)
-dough king (15k)
-rip indra (15k)

Joki race

-Get Ghoul (15k)
-Get Draco (20k) belum termasuk belt
-Get Cyborg(20k) harus siap kan fragman

Joki Aksesoris

-Pale Scraf (8k)
-Mahkota Suci (5k)
-Pilot helmet (10k)
-hunter cape (7k) /bebas warna apa aja
-bandana (7k) /bebas warna apa aja
-DarkCoat (70K)

Joki Belly / Uang

-500k belly (4k)
-1jt belly  (7k) 

Joki V Race

-Race
V2:Shark,Human,Mink,Angel,ghoul (3k) 
V3:Shark,Human,Mink,Angel (5k) 
V3:Ghoul (10k) 
V2:Draco (10k)
V3:Draco (15k) 

Joki Gun

-Skull guitar (12k) kalo udah lengkap material
-Skull guitar (15k) kalo belum ada material
-Dragon Storm (25k) 
-Venom bow (8k) 
-Acidum riffle (5k)

Joki Quest
-All belt (25k)
(bisa req belt apa aja) 
-Rainbow Haki (10k)
-Legendary Haki (15K)
-Citizen Quest (10k)
-bartilo (5k)
-Spawn rip_indra (6k)


JOKI V4 RECE
1 GEAR (5K)
2 GEAR (10K)
3 GEAR (15K)
FULL GEAR (25K)

Joki Crafting
Beast Hunter (60K)
Leviathan Shield (80K)
Leviathan Crown (30K)
Shark Anchor (10K) Have Magnet
Shark Anchor (15K) No Magnet
DragonStorm (15K)
DragonHeart (20K)

📩 Minat? Chat Worker Kami!`
        })
        return
      }

      // =========================
      // MENU 2 - REKBER
      // =========================
      if (text === "2") {
        await sock.sendMessage(from, {
          text: `📌 *LIST FEE REKBER BY ZNOIDFAMZ*

1.000 - 20.000 = 2.000
21.000 - 99.000 = 3.000
100.000 - 299.000 = 5.000
300.000 - 499.000 = 7.000
500.000 - 999.000 = 10.000
1.000.000 - 1.499.000 = 15.000
1.500.000 - 1.900.000 = 20.000
2.000.000 - Seterusnya = 25.000

📩 Lanjut transaksi?
Ketik *.qris* Untuk Pembayaran AllPayment Atau Pilih Menu Payment!`
        })
        return
      }

      // =========================
      // MENU 3 - PAYMENT
      // =========================
      if (text === "3") {
        await sock.sendMessage(from, {
          text: `💳 *PAYMENT/PEMBAYARAN*

1. QRIS AllPayment (ketik .qris)
2. DANA: 081290783833 A/N HA*** PRA***
3. GOPAY: 081290783833 A/N HA*** PRA***
4. BCA: 3780620578 A/N HA*** PRA***

⚠️ PASTIKAN CEK KEMBALI SEBELUM MELAKUKAN TRANSAKSI/PENGIRIMAN. SALAH KIRIM BUKAN TANGGUNG JAWAB ADMIN`
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
