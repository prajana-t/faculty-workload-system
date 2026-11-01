const mongoose = require("mongoose");

const lettersAndSpaces = /^[\p{L}]+(?:[\s'-][\p{L}]+)*$/u;

const facultySchema = new mongoose.Schema(
  {
    // MongoDB automatically creates the unique _id primary key.
    name: { type: String, required: true, trim: true, validate: { validator: v => lettersAndSpaces.test(v), message: "Faculty name must contain letters only." } },
    employeeId: { type: String, required: true, unique: true, trim: true },
    department: { type: String, required: true, trim: true, validate: { validator: v => lettersAndSpaces.test(v), message: "Department must contain letters only." } },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address."] }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Faculty", facultySchema);
