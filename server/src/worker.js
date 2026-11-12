import "dotenv/config";
import mongoose from "mongoose";
import IORedis from "ioredis";
import { Worker } from "bullmq";
import nodemailer from "nodemailer";
import { Notification, User } from "./models.js";

if (!process.env.REDIS_URL) { console.error("REDIS_URL is required to run the BullMQ worker."); process.exit(1); }
await mongoose.connect(process.env.MONGO_URI);
const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined }) : null;
const worker = new Worker("peerly-notifications", async job => {
  const item = await Notification.create(job.data);
  if (mailer) { const user = await User.findById(job.data.recipient).select("email"); if (user?.email) await mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: user.email, subject: job.data.title, text: `${job.data.message}\n\nSign in to Peerly to view the discussion.` }); }
  console.log(`Delivered notification ${item._id}`);
}, { connection, concurrency: 5 });
worker.on("failed", (job, err) => console.error(`Notification job ${job?.id} failed:`, err.message));
console.log("Peerly notification worker is running.");
