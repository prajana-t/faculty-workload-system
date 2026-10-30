const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

const Faculty = require("./models/Faculty");
const Course = require("./models/Course");
const Workload = require("./models/Workload");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Reuse one MongoDB connection while a Vercel serverless instance stays warm.
// Set MONGODB_URI in Vercel Project Settings > Environment Variables.
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured. Add your MongoDB Atlas URI in Vercel Environment Variables.");

  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!global.__facultyWorkloadMongoPromise) {
    global.__facultyWorkloadMongoPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 0,
      bufferCommands: false
    }).catch((error) => {
      global.__facultyWorkloadMongoPromise = null;
      throw error;
    });
  }

  await global.__facultyWorkloadMongoPromise;
  return mongoose.connection;
}

// Basic server check does not require a database connection.
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Faculty Workload API is running" });
});

// Database status explicitly attempts a connection before reporting status.
app.get("/api/db-health", async (req, res) => {
  try {
    await connectDB();
    res.json({ connected: true, database: mongoose.connection.name || "MongoDB Atlas" });
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    res.status(503).json({ connected: false, message: "MongoDB connection failed. Check MONGODB_URI and Atlas Network Access." });
  }
});

// All data API endpoints require MongoDB.
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    res.status(503).json({
      connected: false,
      message: "Database unavailable. Check the MONGODB_URI environment variable and MongoDB Atlas Network Access."
    });
  }
});

// FACULTY
app.get("/api/faculty", async (req, res) => {
  try {
    res.json(await Faculty.find().sort({ createdAt: -1 }).lean());
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post("/api/faculty", async (req, res) => {
  try {
    const faculty = await Faculty.create({
      name: req.body.name,
      employeeId: req.body.employeeId,
      department: req.body.department,
      email: req.body.email
    });
    res.status(201).json(faculty);
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.delete("/api/faculty/:id", async (req, res) => {
  try {
    const faculty = await Faculty.findByIdAndDelete(req.params.id);
    if (!faculty) return res.status(404).json({ message: "Faculty not found" });
    await Workload.deleteMany({ faculty: faculty._id });
    res.json({ message: "Faculty and related workloads deleted" });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

// COURSES
app.get("/api/courses", async (req, res) => {
  try { res.json(await Course.find().sort({ createdAt: -1 }).lean()); }
  catch (error) { res.status(500).json({ message: error.message }); }
});

app.post("/api/courses", async (req, res) => {
  try {
    const course = await Course.create({
      courseCode: req.body.courseCode,
      courseName: req.body.courseName,
      department: req.body.department,
      credits: Number(req.body.credits)
    });
    res.status(201).json(course);
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.delete("/api/courses/:id", async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found" });
    await Workload.deleteMany({ course: course._id });
    res.json({ message: "Course and related workloads deleted" });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

// WORKLOADS
app.get("/api/workloads", async (req, res) => {
  try {
    const workloads = await Workload.find()
      .populate("faculty", "name employeeId department")
      .populate("course", "courseCode courseName credits")
      .sort({ createdAt: -1 }).lean();
    res.json(workloads);
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post("/api/workloads", async (req, res) => {
  try {
    const { faculty, course, semester, weeklyHours } = req.body;
    const [facultyExists, courseExists] = await Promise.all([
      Faculty.findById(faculty), Course.findById(course)
    ]);
    if (!facultyExists || !courseExists) {
      return res.status(400).json({ message: "Please select an existing faculty member and course" });
    }
    const workload = await Workload.create({ faculty, course, semester, weeklyHours: Number(weeklyHours) });
    const result = await Workload.findById(workload._id)
      .populate("faculty", "name employeeId department")
      .populate("course", "courseCode courseName credits");
    res.status(201).json(result);
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.delete("/api/workloads/:id", async (req, res) => {
  try {
    const workload = await Workload.findByIdAndDelete(req.params.id);
    if (!workload) return res.status(404).json({ message: "Workload not found" });
    res.json({ message: "Workload assignment deleted" });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

// REPORT
app.get("/api/reports/workload", async (req, res) => {
  try {
    const report = await Workload.aggregate([
      { $group: { _id: "$faculty", totalWeeklyHours: { $sum: "$weeklyHours" }, assignedCourses: { $sum: 1 } } },
      { $lookup: { from: "faculties", localField: "_id", foreignField: "_id", as: "facultyInfo" } },
      { $unwind: "$facultyInfo" },
      { $project: { _id: 0, facultyId: "$facultyInfo.employeeId", facultyName: "$facultyInfo.name", department: "$facultyInfo.department", totalWeeklyHours: 1, assignedCourses: 1 } },
      { $sort: { totalWeeklyHours: -1 } }
    ]);
    res.json(report);
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// Local development only. Vercel imports the Express app below.
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}

module.exports = app;
