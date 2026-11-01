
const mongoose = require("mongoose");

const lettersAndSpaces = /^[\p{L}]+(?:[\s'-][\p{L}]+)*$/u;

// Course Name: Letters, numbers and common academic symbols
const courseNamePattern = /^[A-Za-z0-9][A-Za-z0-9\s.&+#()/-]*$/;

// Department: Letters, spaces, dots, ampersands, parentheses and hyphens
const departmentPattern = /^[\p{L}][\p{L}\s.&()'-]*$/u;

const courseSchema = new mongoose.Schema(
  {
    // MongoDB automatically creates the unique _id primary key.

    courseCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      validate: {
        validator: v => /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]+$/.test(v),
        message: "Course code must contain letters and numbers (for example CS301)."
      }
    },

    courseName: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: v => courseNamePattern.test(v),
        message: "Course name can contain letters, numbers, spaces and valid academic symbols only."
      }
    },

    department: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: v => departmentPattern.test(v),
        message: "Department can contain letters, spaces, dots, ampersands, parentheses and hyphens only."
      }
    },

    credits: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);
