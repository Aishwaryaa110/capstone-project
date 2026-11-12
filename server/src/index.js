import "dotenv/config";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import nodemailer from "nodemailer";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User, Doubt, Notification, Report } from "./models.js";
import { auth, adminOnly } from "./middleware.js";

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_URL?.split(",") || true } });
const redisConnection = process.env.REDIS_URL ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true }) : null;
const notificationQueue = redisConnection ? new Queue("peerly-notifications", { connection: redisConnection }) : null;
io.use((socket, next) => {
  try { const payload = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET); socket.userId = payload.id; next(); }
  catch { next(new Error("Unauthorized socket connection")); }
});
io.on("connection", socket => { socket.join(`user:${socket.userId}`); });
const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined }) : null;
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL?.split(",") || true }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
const PORT = process.env.PORT || 5000;

const tokenFor = user => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
const safeUser = user => ({ id: user._id, name: user.name, email: user.email, role: user.role, subjects: user.subjects, topics: user.topics, reputation: user.reputation });
async function notify(recipient, actor, type, title, message, doubt) {
 if (!recipient || String(recipient)===String(actor)) return;
 const payload = { recipient: String(recipient), actor: actor ? String(actor) : null, type, title, message, doubt: doubt ? String(doubt) : null };
 if (notificationQueue) {
   await notificationQueue.add("deliver-notification", payload, { attempts: 5, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 500, removeOnFail: 1000 });
 } else {
   const item = await Notification.create(payload);
   io.to(`user:${recipient}`).emit("notification", item);
   await sendEmailNotification(recipient, title, message);
 }
}
async function sendEmailNotification(recipient, title, message) {
 if (!mailer) return;
 const user = await User.findById(recipient).select("email name");
 if (!user?.email) return;
 await mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: user.email, subject: title, text: `${message}\n\nSign in to Peerly to view the discussion.` });
}

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "Peer Learning API" }));

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, subjects = [], topics = [] } = req.body;
    if (!name || !email || !password || password.length < 8) return res.status(400).json({ message: "Name, email and a password of at least 8 characters are required." });
    if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: "Email is already registered." });
    const role = email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase() ? "admin" : "student";
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), subjects, topics, role });
    res.status(201).json({ token: tokenFor(user), user: safeUser(user) });
  } catch (e) { res.status(500).json({ message: "Registration failed." }); }
});

app.post("/api/auth/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email?.toLowerCase() });
  if (!user || !await bcrypt.compare(req.body.password || "", user.password)) return res.status(401).json({ message: "Incorrect email or password." });
  res.json({ token: tokenFor(user), user: safeUser(user) });
});

app.get("/api/auth/me", auth, (req, res) => res.json({ user: safeUser(req.user) }));

// Match by subject expertise, overlapping tags, reputation and open workload.
async function findBestHelper(subject, tags, excludeId) {
  const helpers = await User.find({ _id: { $ne: excludeId }, subjects: { $in: [subject] }, role: { $in: ["student", "mentor"] } }).select("name role reputation subjects topics").limit(150);
  if (!helpers.length) return null;
  const openCounts = await Doubt.aggregate([
    { $match: { status: { $in: ["Open", "Answered"] }, assignedHelper: { $ne: null } } },
    { $group: { _id: "$assignedHelper", count: { $sum: 1 } } }
  ]);
  const workload = new Map(openCounts.map(x => [String(x._id), x.count]));
  const acceptedCounts = await Doubt.aggregate([
    { $unwind: "$answers" }, { $match: { subject, "answers.accepted": true } },
    { $group: { _id: "$answers.author", count: { $sum: 1 } } }
  ]);
  const accepted = new Map(acceptedCounts.map(x => [String(x._id), x.count]));
  const wanted = new Set((tags || []).map(x => x.toLowerCase()));
  return helpers.map(h => {
    const expertise = new Set([...(h.topics || []), ...(h.subjects || []).map(x => x.toLowerCase())]);
    const overlap = [...wanted].filter(t => expertise.has(t)).length;
    const reputationScore = Math.min(h.reputation || 0, 100) * 0.15;
    const acceptedScore = Math.min(accepted.get(String(h._id)) || 0, 20) * 2;
    const mentorBonus = h.role === "mentor" ? 20 : 0;
    const workloadPenalty = (workload.get(String(h._id)) || 0) * 8;
    const score = 25 + overlap * 12 + reputationScore + acceptedScore + mentorBonus - workloadPenalty;
    return { helper: h, score };
  }).sort((a, b) => b.score - a.score)[0]?.helper || null;
}

app.post("/api/doubts", auth, async (req, res) => {
  try {
    const { title, description, subject, tags = [], difficulty = "Intermediate", anonymous = true } = req.body;
    if (!title?.trim() || !description?.trim() || !subject?.trim()) return res.status(400).json({ message: "Title, description and subject are required." });
    const helper = await findBestHelper(subject, tags, req.user._id);
    const aliases = ["Curious Owl", "Quiet Fox", "Bright Panda", "Swift Falcon", "Clever Otter"];
    const alias = `${aliases[Math.floor(Math.random()*aliases.length)]} #${Math.floor(100+Math.random()*900)}`;
    const doubt = await Doubt.create({ title, description, subject, tags, difficulty, anonymous, anonymousAlias: alias, author: req.user._id, assignedHelper: helper?._id || null });
    if (helper) await notify(helper._id, req.user._id, "doubt_assigned", "A doubt matches your expertise", `${subject}: ${title}`, doubt._id);
    res.status(201).json({ doubt: await publicDoubt(doubt._id), matchedHelper: helper ? helper.name : null });
  } catch { res.status(500).json({ message: "Could not create doubt." }); }
});

async function publicDoubt(id) {
  const d = await Doubt.findById(id).populate("assignedHelper", "name role reputation").populate("answers.author", "name role reputation");
  if (!d) return null;
  return {
    id: d._id, title: d.title, description: d.description, subject: d.subject, tags: d.tags,
    difficulty: d.difficulty, anonymous: d.anonymous, authorLabel: d.anonymous ? d.anonymousAlias : "Student",
    assignedHelper: d.assignedHelper, status: d.status, createdAt: d.createdAt,
    answers: d.answers.map(a => ({ id: a._id, body: a.body, author: a.author ? { name: a.author.name, role: a.author.role } : null, accepted: a.accepted, createdAt: a.createdAt }))
  };
}

app.get("/api/doubts", auth, async (req, res) => {
  const filter = {};
  if (req.query.subject) filter.subject = req.query.subject;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.$text = { $search: req.query.q };
  const docs = await Doubt.find(filter).sort({ createdAt: -1 }).select("_id");
  res.json({ doubts: (await Promise.all(docs.map(d => publicDoubt(d._id))).then(a => a.filter(Boolean))) });
});

app.get("/api/doubts/:id", auth, async (req, res) => {
  const doubt = await publicDoubt(req.params.id);
  if (!doubt) return res.status(404).json({ message: "Doubt not found." });
  res.json({ doubt });
});

app.post("/api/doubts/:id/answers", auth, async (req, res) => {
  const body = req.body.body?.trim();
  if (!body) return res.status(400).json({ message: "Answer cannot be empty." });
  const d = await Doubt.findById(req.params.id);
  if (!d) return res.status(404).json({ message: "Doubt not found." });
  if (String(d.author) === String(req.user._id)) return res.status(403).json({ message: "You cannot answer your own doubt." });
  d.answers.push({ author: req.user._id, body });
  d.status = "Answered";
  await d.save();
  await notify(d.author, req.user._id, "new_answer", "Your doubt received an answer", `${req.user.name} answered: ${d.title}`, d._id);
  res.status(201).json({ doubt: await publicDoubt(d._id) });
});

app.post("/api/doubts/:id/accept/:answerId", auth, async (req, res) => {
  const d = await Doubt.findById(req.params.id).select("+author");
  if (!d) return res.status(404).json({ message: "Doubt not found." });
  if (String(d.author) !== String(req.user._id) && req.user.role !== "admin") return res.status(403).json({ message: "Only the doubt author can accept an answer." });
  const answer = d.answers.id(req.params.answerId);
  if (!answer) return res.status(404).json({ message: "Answer not found." });
  d.answers.forEach(a => a.accepted = String(a._id) === String(answer._id));
  d.status = "Resolved";
  await d.save();
  await User.findByIdAndUpdate(answer.author, { $inc: { reputation: 10 } });
  await notify(answer.author, req.user._id, "answer_accepted", "Your answer was accepted", `You earned 10 reputation points for: ${d.title}`, d._id);
  res.json({ doubt: await publicDoubt(d._id), message: "Answer accepted. Helper earned 10 points." });
});

app.put("/api/users/profile", auth, async (req, res) => {
  try {
    const { name, subjects, topics, role } = req.body;
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ message: "Name cannot be empty." });
    const updates = {};
    if (name !== undefined) updates.name = String(name).trim().slice(0, 80);
    if (Array.isArray(subjects)) updates.subjects = [...new Set(subjects.map(x => String(x).trim()).filter(Boolean))].slice(0, 12);
    if (Array.isArray(topics)) updates.topics = [...new Set(topics.map(x => String(x).trim().toLowerCase()).filter(Boolean))].slice(0, 30);
    if (role === "student" || role === "mentor") updates.role = role;
    const updated = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true }).select("-password");
    res.json({ user: safeUser(updated) });
  } catch { res.status(500).json({ message: "Could not update profile." }); }
});

app.get("/api/leaderboard", auth, async (_req, res) => {
  const users = await User.find().sort({ reputation: -1 }).limit(20).select("name role reputation subjects");
  res.json({ leaderboard: users });
});

app.get("/api/users/helpers", auth, async (req, res) => {
  const users = await User.find({ subjects: { $in: req.query.subject ? [req.query.subject] : req.user.subjects }, _id: { $ne: req.user._id } }).sort({ reputation: -1 }).limit(10).select("name role reputation subjects");
  res.json({ helpers: users });
});

app.get("/api/notifications",auth,async(req,res)=>{
 const items=await Notification.find({recipient:req.user._id}).sort({createdAt:-1}).limit(30).populate("actor","name").populate("doubt","title");
 const unread=await Notification.countDocuments({recipient:req.user._id,read:false});res.json({notifications:items,unread});
});
app.patch("/api/notifications/read-all",auth,async(req,res)=>{await Notification.updateMany({recipient:req.user._id,read:false},{$set:{read:true}});res.json({message:"Notifications marked as read."});});
app.patch("/api/notifications/:id/read",auth,async(req,res)=>{const item=await Notification.findOneAndUpdate({_id:req.params.id,recipient:req.user._id},{$set:{read:true}},{new:true});if(!item)return res.status(404).json({message:"Notification not found."});res.json({notification:item});});

app.post("/api/reports", auth, async (req, res) => {
  const { targetType, doubtId, answerId, reason } = req.body;
  if (!['doubt','answer'].includes(targetType) || !doubtId || !reason?.trim()) return res.status(400).json({ message: "A target, type and reason are required." });
  const doubt = await Doubt.findById(doubtId);
  if (!doubt) return res.status(404).json({ message: "Reported content not found." });
  if (targetType === 'answer' && (!answerId || !doubt.answers.id(answerId))) return res.status(404).json({ message: "Answer not found." });
  const report = await Report.create({ reporter: req.user._id, targetType, doubt: doubtId, answerId: answerId || null, reason: reason.trim() });
  res.status(201).json({ report: { id: report._id, status: report.status } });
});
app.get("/api/admin/reports", auth, adminOnly, async (_req, res) => {
  const reports = await Report.find().sort({ createdAt: -1 }).limit(100).populate("reporter", "name email").populate("doubt", "title description status");
  res.json({ reports });
});
app.patch("/api/admin/reports/:id", auth, adminOnly, async (req, res) => {
  const { status, action } = req.body;
  if (!['reviewed','dismissed'].includes(status)) return res.status(400).json({ message: "Status must be reviewed or dismissed." });
  const report = await Report.findByIdAndUpdate(req.params.id, { status, action: String(action || '').slice(0,500), moderator: req.user._id }, { new: true });
  if (!report) return res.status(404).json({ message: "Report not found." });
  if (status === 'reviewed' && action === 'hide_doubt') await Doubt.findByIdAndUpdate(report.doubt, { status: 'Resolved' });
  res.json({ report });
});

app.get("/api/admin/stats", auth, adminOnly, async (_req, res) => {
  const [users, doubts, resolved, answers] = await Promise.all([
    User.countDocuments(), Doubt.countDocuments(), Doubt.countDocuments({ status: "Resolved" }),
    Doubt.aggregate([{ $project: { n: { $size: "$answers" } } }, { $group: { _id: null, n: { $sum: "$n" } } }])
  ]);
  res.json({ users, doubts, resolved, answers: answers[0]?.n || 0, resolutionRate: doubts ? Math.round(resolved/doubts*100) : 0 });
});

httpServer.listen(PORT, async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`API running on ${PORT}; MongoDB connected`);
  } catch (e) {
    console.error("MongoDB connection failed. Check MONGO_URI in server/.env", e.message);
    process.exit(1);
  }
});
