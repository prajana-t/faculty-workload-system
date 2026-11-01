const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", default: null },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
  entryType: { type: String, enum: ["class", "break"], default: "class" },
  classType: { type: String, enum: ["theory", "lab"], default: "theory" },
  label: { type: String, default: "" },
  day: { type: String, enum: ["Monday","Tuesday","Wednesday","Thursday","Friday"], required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  semester: { type: String, required: true, trim: true },
  weekNumber: { type: Number, required: true, min: 1, max: 24 },
  date: { type: Date, required: true }
}, { timestamps: true });
module.exports = mongoose.model("Timetable", schema);
