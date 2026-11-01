
const mongoose = require("mongoose");

// Faculty name: Letters, spaces, hyphens and apostrophes
const lettersAndSpaces = /^[\p{L}]+(?:[\s'-][\p{L}]+)*$/u;

// Employee ID: One English letter followed by numbers
const employeeIdPattern = /^[A-Za-z][0-9]+$/;

// Department: Letters, spaces, dots and hyphens
const departmentPattern = /^[\p{L}]+(?:[\s.-][\p{L}]+)*\.?$/u;

const facultySchema = new mongoose.Schema(
  {
    // MongoDB automatically creates the unique _id primary key.
    name: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: v => lettersAndSpaces.test(v),
        message: "Faculty name must contain letters only."
      }
    },

    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [
        employeeIdPattern,
        "Employee ID must contain one letter followed by numbers (e.g., A123)."
      ]
    },

    department: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: v => departmentPattern.test(v),
        message: "Department can contain letters, spaces, dots and hyphens only."
      }
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Enter a valid email address."
      ]
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Faculty", facultySchema);
