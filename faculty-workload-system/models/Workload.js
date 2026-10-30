const mongoose = require("mongoose");

const workloadSchema = new mongoose.Schema(
  {
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true
    },
    semester: {
      type: String,
      required: true,
      trim: true
    },
    weeklyHours: {
      type: Number,
      required: true,
      min: 1,
      max: 60
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Workload", workloadSchema);