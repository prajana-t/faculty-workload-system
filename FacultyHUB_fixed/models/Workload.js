const mongoose = require("mongoose");
const MIN_WEEKLY_HOURS = 1;
const MAX_WEEKLY_HOURS = 5;

const workloadSchema = new mongoose.Schema(
  {
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    semester: { type: Number, required: true, trim: true ,min: 1, max: 10 },
    weeklyHours: { type: Number, required: true, min: [MIN_WEEKLY_HOURS, `Theory classes must be at least ${MIN_WEEKLY_HOURS}.`], max: [MAX_WEEKLY_HOURS, `Theory classes cannot exceed ${MAX_WEEKLY_HOURS}.`] },
    // One lab session is a continuous two-hour block. Zero means no lab for this course.
    labSessions: { type: Number, default: 0, min: 0, max: 5 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Workload", workloadSchema);
