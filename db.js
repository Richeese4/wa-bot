const mongoose = require("mongoose")

const MONGO_URL = "mongodb+srv://USERNAME:PASSWORD@cluster0.mongodb.net/botdb?retryWrites=true&w=majority"

// =========================
// CONNECT DATABASE
// =========================
mongoose.connect(MONGO_URL)
  .then(() => console.log("📦 MongoDB Connected"))
  .catch(err => console.log("❌ MongoDB Error:", err))

// =========================
// USER SCHEMA (LOGIN SYSTEM)
// =========================
const userSchema = new mongoose.Schema({
  number: { type: String, unique: true },
  key: String,
  role: { type: String, default: "user" }, // user / admin / owner / premium
  expired: Date,
  login: { type: Boolean, default: false },
  menuData: Object
})

// =========================
// KEY SCHEMA (ANTI RESET KEY)
// =========================
const keySchema = new mongoose.Schema({
  key: { type: String, unique: true },
  used: { type: Boolean, default: false },
  durationHours: Number,
  createdBy: String,
  usedBy: String,
  createdAt: { type: Date, default: Date.now },
  expiredAt: Date
})

// =========================
// MODEL
// =========================
const User = mongoose.model("User", userSchema)
const Key = mongoose.model("Key", keySchema)

module.exports = { User, Key }