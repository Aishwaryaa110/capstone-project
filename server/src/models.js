import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["student", "mentor", "admin"], default: "student" },
  subjects: [{ type: String, trim: true }],
  topics: [{ type: String, trim: true, lowercase: true }],
  reputation: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const answerSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  body: { type: String, required: true, maxlength: 5000 },
  createdAt: { type: Date, default: Date.now },
  accepted: { type: Boolean, default: false }
});

const doubtSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 140 },
  description: { type: String, required: true, maxlength: 8000 },
  subject: { type: String, required: true },
  tags: [{ type: String }],
  difficulty: { type: String, enum: ["Beginner", "Intermediate", "Advanced"], default: "Intermediate" },
  anonymous: { type: Boolean, default: true },
  anonymousAlias: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, select: false },
  assignedHelper: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  status: { type: String, enum: ["Open", "Answered", "Resolved"], default: "Open" },
  answers: [answerSchema],
  createdAt: { type: Date, default: Date.now }
});

doubtSchema.index({ title: "text", description: "text", subject: "text", tags: "text" });
export const User = mongoose.model("User", userSchema);
export const Doubt = mongoose.model("Doubt", doubtSchema);

const notificationSchema = new mongoose.Schema({
 recipient:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
 actor:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
 type:{type:String,enum:["doubt_assigned","new_answer","answer_accepted"],required:true},
 title:{type:String,required:true}, message:{type:String,required:true},
 doubt:{type:mongoose.Schema.Types.ObjectId,ref:"Doubt",default:null},
 read:{type:Boolean,default:false}, createdAt:{type:Date,default:Date.now}
});
notificationSchema.index({recipient:1,createdAt:-1});
export const Notification=mongoose.model("Notification",notificationSchema);


const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  targetType: { type: String, enum: ["doubt", "answer"], required: true },
  doubt: { type: mongoose.Schema.Types.ObjectId, ref: "Doubt", required: true },
  answerId: { type: mongoose.Schema.Types.ObjectId, default: null },
  reason: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ["pending", "reviewed", "dismissed"], default: "pending" },
  moderator: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  action: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
reportSchema.index({ status: 1, createdAt: -1 });
export const Report = mongoose.model("Report", reportSchema);
