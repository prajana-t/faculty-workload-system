const mongoose = require("mongoose");
const lettersAndSpaces = /^[\p{L}]+(?:[\s'-][\p{L}]+)*$/u;

const courseSchema = new mongoose.Schema(
  {
    // MongoDB automatically creates the unique _id primary key.
    courseCode: { type: String, required: true, unique: true, trim: true, validate: { validator: v => /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]+$/.test(v), message: "Course code must contain letters and numbers (for example CS301)." } },
    courseName: { type: String, required: true, trim: true, validate: { validator: v => lettersAndSpaces.test(v), message: "Course name must contain letters only." } },
    department: { type: String, required: true, trim: true, validate: { validator: v => lettersAndSpaces.test(v), message: "Department must contain letters only." } },
    credits: { type: Number, required: true, min: 1, max: 10 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);
