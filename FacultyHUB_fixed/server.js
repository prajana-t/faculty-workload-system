const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const crypto = require("crypto");
const User = require("./models/User");
require("dotenv").config();

const Faculty = require("./models/Faculty");
const Course = require("./models/Course");
const Workload = require("./models/Workload");
const Timetable = require("./models/Timetable");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const MIN_WEEKLY_HOURS = 1;
const MAX_WEEKLY_HOURS = 5;
const lettersAndSpaces = /^[\p{L}]+(?:[\s'-][\p{L}]+)*$/u;

function validLetters(value) { return typeof value === "string" && lettersAndSpaces.test(value.trim()); }
function duplicateMessage(error) {
  if (error && error.code === 11000) {
    return error.keyPattern?.email ? "This email address is already registered." : "This record already exists.";
  }
  return error.message;
}

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


// Password hashing and signed, HTTP-only login cookies (no extra session package required).
const TOKEN_TTL_SECONDS = 60 * 60 * 12;
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, expectedHex] = stored.split(":");
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function cookieSecret() {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be configured in production.");
  }
  return process.env.SESSION_SECRET || "development-only-change-this-secret-before-deploying";
}
function createToken(user) {
  const payload = Buffer.from(JSON.stringify({
    id: String(user._id), role: user.role, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", cookieSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
function readToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", cookieSecret()).update(payload).digest();
  let supplied;
  try { supplied = Buffer.from(signature, "base64url"); } catch { return null; }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch { return null; }
}
function setAuthCookie(res, user) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `facultyhub_token=${createToken(user)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TOKEN_TTL_SECONDS}${secure}`);
}
function clearAuthCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `facultyhub_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}
async function authenticate(req, res, next) {
  const cookie = req.headers.cookie || "";
  const token = cookie.split(";").map(v => v.trim()).find(v => v.startsWith("facultyhub_token="))?.slice("facultyhub_token=".length);
  const session = readToken(token);
  if (!session) return res.status(401).json({ message: "Please log in to continue." });
  try {
    await connectDB();
    const user = await User.findById(session.id).select("_id name email role faculty");
    if (!user) return res.status(401).json({ message: "Account not found. Please log in again." });
    req.user = user;
    next();
  } catch (error) { res.status(500).json({ message: "Unable to verify login." }); }
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access only." });
  next();
}
function requireFaculty(req, res, next) {
  if (req.user?.role !== "faculty") return res.status(403).json({ message: "Faculty access only." });
  next();
}

// Authentication routes are public and connect to MongoDB themselves.
app.post("/api/auth/signup", async (req, res) => {
  let newlyCreatedFacultyId = null;

  try {
    await connectDB();

    const { name, employeeId, department, email, password } = req.body || {};

    if (!validLetters(name) || !validLetters(department)) {
      return res.status(400).json({
        message: "Enter a valid name and department using letters only."
      });
    }

    if (typeof employeeId !== "string" || !employeeId.trim()) {
      return res.status(400).json({ message: "Employee ID is required." });
    }

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ message: "Password must contain at least 8 characters." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedEmployeeId = employeeId.trim();

    // A User record means an account already exists. A Faculty record alone
    // may simply have been created earlier by the admin for course allocation.
    if (await User.exists({ email: normalizedEmail })) {
      return res.status(409).json({
        message: "This email already has a login account. Please log in."
      });
    }

    // Find faculty records independently so we can distinguish a pre-created
    // admin faculty profile from a real email/Employee ID conflict.
    const [facultyByEmail, facultyByEmployeeId] = await Promise.all([
      Faculty.findOne({ email: normalizedEmail }),
      Faculty.findOne({ employeeId: normalizedEmployeeId })
    ]);

    let faculty;

    if (facultyByEmail || facultyByEmployeeId) {
      // If either identifier exists, both must identify the same faculty
      // record. This prevents attaching an account to someone else's profile.
      const sameFaculty =
        facultyByEmail &&
        facultyByEmployeeId &&
        String(facultyByEmail._id) === String(facultyByEmployeeId._id);

      if (!sameFaculty) {
        return res.status(409).json({
          message: "This email or Employee ID belongs to a different faculty profile. Check both details with the admin."
        });
      }

      // The admin has already created this faculty profile (possibly assigned
      // courses/workloads). Reuse it rather than incorrectly saying it is
      // already registered as a login account.
      faculty = facultyByEmail;
    } else {
      faculty = await Faculty.create({
        name: name.trim(),
        employeeId: normalizedEmployeeId,
        department: department.trim(),
        email: normalizedEmail
      });
      newlyCreatedFacultyId = faculty._id;
    }

    await User.create({
      name: faculty.name || name.trim(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      role: "faculty",
      faculty: faculty._id
    });

    return res.status(201).json({
      message: "Faculty account created successfully. Please log in with your email and password."
    });
  } catch (error) {
    // Only remove the Faculty profile if this request created it. Never delete
    // a profile that existed already or has admin-assigned workload records.
    if (newlyCreatedFacultyId) {
      try {
        await Faculty.findByIdAndDelete(newlyCreatedFacultyId);
      } catch (cleanupError) {
        console.error("Could not clean up newly created faculty profile:", cleanupError.message);
      }
    }

    if (error && error.code === 11000) {
      return res.status(409).json({
        message: error.keyPattern?.email
          ? "This email already has an account or faculty profile. Please check the details with the admin."
          : "This Employee ID is already in use. Please check the details with the admin."
      });
    }

    console.error("Faculty signup error:", error);
    return res.status(500).json({
      message: "Unable to create the faculty account. Please try again or contact the admin."
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    await connectDB();
    const { email, password, role } = req.body || {};
    if (!["admin", "faculty"].includes(role)) return res.status(400).json({ message: "Choose Admin or Faculty login." });
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (role === "admin") {
      const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
      const adminPassword = String(process.env.ADMIN_PASSWORD || "");
      if (!adminEmail || !adminPassword) return res.status(503).json({ message: "Admin login is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env." });
      if (normalizedEmail !== adminEmail || password !== adminPassword) return res.status(401).json({ message: "Invalid admin email or password." });
      let admin = await User.findOne({ email: adminEmail, role: "admin" });
      if (!admin) admin = await User.create({ name: process.env.ADMIN_NAME || "System Administrator", email: adminEmail, passwordHash: hashPassword(adminPassword), role: "admin" });
      setAuthCookie(res, admin);
      return res.json({ message: "Admin login successful.", user: { name: admin.name, email: admin.email, role: admin.role } });
    }
    const user = await User.findOne({ email: normalizedEmail, role: "faculty" });
    if (!user || !verifyPassword(String(password || ""), user.passwordHash)) return res.status(401).json({ message: "Invalid faculty email or password. Sign up first if you do not have an account." });
    setAuthCookie(res, user);
    res.json({ message: "Faculty login successful.", user: { name: user.name, email: user.email, role: user.role } });
  } catch (error) { res.status(500).json({ message: "Login failed. " + error.message }); }
});

app.get("/api/auth/me", authenticate, (req, res) => {
  res.json({ user: { name: req.user.name, email: req.user.email, role: req.user.role } });
});
app.post("/api/auth/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out successfully." });
});

// Faculty members can view only their own workload and timetable.
app.get("/api/faculty/me/workloads", authenticate, requireFaculty, async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.user.faculty);
    if (!faculty) return res.status(404).json({ message: "Faculty profile not found." });
    const rows = await Workload.find({ faculty: faculty._id }).populate("course", "courseCode courseName credits").sort({ semester: 1 }).lean();
    res.json({ faculty: { name: faculty.name, employeeId: faculty.employeeId, department: faculty.department, email: faculty.email }, workloads: rows });
  } catch (error) { res.status(500).json({ message: error.message }); }
});
app.put("/api/faculty/me/workloads/:id", authenticate, requireFaculty, async (req, res) => {
  try {
    const hours = Number(req.body.weeklyHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 5) return res.status(400).json({ message: "Weekly classes must be a whole number from 1 to 5." });
    const item = await Workload.findOneAndUpdate({ _id: req.params.id, faculty: req.user.faculty }, { weeklyHours: hours }, { new: true, runValidators: true }).populate("course", "courseCode courseName credits");
    if (!item) return res.status(404).json({ message: "Your workload assignment was not found." });
    res.json({ message: "Your workload was updated.", workload: item });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

// Faculty can view only their own generated timetable.
app.get("/api/faculty/me/timetable", authenticate, requireFaculty, async (req, res) => {
  try {
    await connectDB();
    const faculty = await Faculty.findById(req.user.faculty).lean();
    if (!faculty) return res.status(404).json({ message: "Faculty profile not found." });

    const semester = typeof req.query.semester === "string" ? req.query.semester.trim() : "";
    // Timetable entries are stored for multiple weeks. The weekly grid should
    // show only the representative first week, not repeat the same pattern 24 times.
    const filter = {
      weekNumber: 1,
      $or: [
        { faculty: faculty._id, entryType: "class" },
        { faculty: null, entryType: "break" }
      ]
    };
    if (semester) filter.semester = semester;

    const [timetable, semesters] = await Promise.all([
      Timetable.find(filter)
        .populate("course", "courseCode courseName credits")
        .sort({ day: 1, startTime: 1 })
        .lean(),
      Workload.distinct("semester", { faculty: faculty._id })
    ]);

    res.json({
      faculty: {
        name: faculty.name,
        employeeId: faculty.employeeId,
        department: faculty.department,
        email: faculty.email
      },
      semesters: semesters.sort(),
      timetable
    });
  } catch (error) {
    res.status(500).json({ message: "Unable to load your timetable: " + error.message });
  }
});

// All data API endpoints require MongoDB.
app.use("/api", authenticate, async (req, res, next) => {
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

// All remaining management endpoints are restricted to administrators.
app.use("/api", requireAdmin);

// FACULTY
app.get("/api/faculty", async (req, res) => {
  try {
    res.json(await Faculty.find().sort({ createdAt: -1 }).lean());
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post("/api/faculty", async (req, res) => {
  try {
    const { name, employeeId, department, email } = req.body;
    if (!validLetters(name)) return res.status(400).json({ message: "Faculty name must contain letters only." });
    if (!validLetters(department)) return res.status(400).json({ message: "Department must contain letters only." });
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ message: "Enter a valid email address." });
    const normalizedEmail = email.trim().toLowerCase();
    const escapedEmail = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existingEmail = await Faculty.exists({ email: { $regex: `^${escapedEmail}$`, $options: "i" } });
    if (existingEmail) return res.status(409).json({ message: "This email address is already registered." });
    const faculty = await Faculty.create({ name, employeeId, department, email: normalizedEmail });
    res.status(201).json(faculty);
  } catch (error) { res.status(400).json({ message: duplicateMessage(error) }); }
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
    const { courseCode, courseName, department, credits } = req.body;
    if (typeof courseCode !== "string" || !/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]+$/.test(courseCode.trim())) return res.status(400).json({ message: "Course code must contain letters and numbers (for example CS301)." });
    if (!validLetters(courseName)) return res.status(400).json({ message: "Course name must contain letters only." });
    if (!validLetters(department)) return res.status(400).json({ message: "Department must contain letters only." });
    const creditValue = Number(credits);
    if (!Number.isInteger(creditValue) || creditValue < 1 || creditValue > 10) return res.status(400).json({ message: "Course credits must be a whole number between 1 and 10." });
    const course = await Course.create({ courseCode: courseCode.trim().toUpperCase(), courseName, department, credits: creditValue });
    res.status(201).json(course);
  } catch (error) { res.status(400).json({ message: duplicateMessage(error) }); }
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
    const labSessions = Number(req.body.labSessions || 0);
    const [facultyExists, courseExists] = await Promise.all([
      Faculty.findById(faculty), Course.findById(course)
    ]);
    if (!facultyExists || !courseExists) {
      return res.status(400).json({ message: "Please select an existing faculty member and course" });
    }
    const hours = Number(weeklyHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 5) {
      return res.status(400).json({ message: "Theory classes per week must be a whole number from 1 to 5." });
    }
    if (!Number.isInteger(labSessions) || labSessions < 0 || labSessions > 5) {
      return res.status(400).json({ message: "Lab sessions per week must be a whole number from 0 to 5." });
    }
    if (typeof semester !== "string" || !semester.trim()) return res.status(400).json({ message: "Semester is required." });
    const workload = await Workload.create({ faculty, course, semester: semester.trim(), weeklyHours: hours, labSessions });
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
    const remaining = await Workload.countDocuments({ semester: workload.semester });
    if (!remaining) await Timetable.deleteMany({ semester: workload.semester });
    res.json({ message: "Workload assignment deleted", semester: workload.semester, remainingAssignments: remaining });
  } catch (error) { res.status(400).json({ message: error.message }); }
});


// EDIT AN EXISTING WORKLOAD
app.put("/api/workloads/:id", async (req, res) => {
  try {
    const { faculty, course, semester, weeklyHours } = req.body;
    const hours = Number(weeklyHours);
    const labSessions = Number(req.body.labSessions || 0);
    if (!Number.isInteger(hours) || hours < 1 || hours > 5) {
      return res.status(400).json({ message: "Theory classes per week must be a whole number from 1 to 5." });
    }
    if (!Number.isInteger(labSessions) || labSessions < 0 || labSessions > 5) {
      return res.status(400).json({ message: "Lab sessions per week must be a whole number from 0 to 5." });
    }
    if (!semester || !String(semester).trim()) return res.status(400).json({ message: "Semester is required." });
    const [f, c] = await Promise.all([Faculty.findById(faculty), Course.findById(course)]);
    if (!f || !c) return res.status(400).json({ message: "Select a valid faculty member and course." });
    const item = await Workload.findByIdAndUpdate(req.params.id,
      { faculty, course, semester: String(semester).trim(), weeklyHours: hours, labSessions },
      { new: true, runValidators: true })
      .populate("faculty", "name employeeId department")
      .populate("course", "courseCode courseName credits");
    if (!item) return res.status(404).json({ message: "Workload assignment not found." });
    res.json(item);
  } catch (error) { res.status(400).json({ message: error.message }); }
});

// WORKLOAD AND TIMETABLE CONFLICT REPORT
app.get("/api/conflicts", async (req, res) => {
  try {
    const [workloads, slots] = await Promise.all([
      Workload.find().populate("faculty", "name employeeId").lean(),
      Timetable.find().populate("faculty", "name employeeId").populate("course", "courseCode courseName").lean()
    ]);
    const totals = new Map();
    workloads.forEach(w => {
      if (!w.faculty) return;
      const key = String(w.faculty._id);
      totals.set(key, (totals.get(key) || 0) + w.weeklyHours);
    });
    const conflicts = [];
    for (const [facultyId, hours] of totals) {
      if (hours > 480) {
        const f = workloads.find(w => String(w.faculty?._id) === facultyId)?.faculty;
        conflicts.push({ type: "WORKLOAD_LIMIT", faculty: f?.name || facultyId, detail: `${hours} semester hours assigned; maximum planning limit is 480.` });
      }
    }
    const reported = new Set();
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j];
      if (a.entryType === "break" || b.entryType === "break" || !a.faculty || !b.faculty) continue;
      // Compare only entries belonging to the same actual week/date. The timetable
      // repeats for 24 weeks, so comparing different weeks caused false warnings.
      const sameWeek = Number(a.weekNumber) === Number(b.weekNumber) &&
        new Date(a.date).toISOString().slice(0, 10) === new Date(b.date).toISOString().slice(0, 10);
      if (sameWeek && String(a.faculty._id) === String(b.faculty._id) && a.day === b.day &&
          a.startTime < b.endTime && b.startTime < a.endTime) {
        const key = [String(a.faculty._id), a.weekNumber, a.day, a.startTime, a.endTime, b.startTime, b.endTime].join("|");
        if (!reported.has(key)) {
          reported.add(key);
          conflicts.push({ type: "SCHEDULE_OVERLAP", faculty: a.faculty.name || "Faculty",
            detail: `${a.day}: ${a.startTime}-${a.endTime} overlaps ${b.startTime}-${b.endTime}.` });
        }
      }
    }
    res.json(conflicts);
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// Automatically generate a faculty-wise timetable from workload assignments.
// Theory is scheduled in the morning (09:00-13:00). Labs are continuous
// two-hour sessions in the afternoon (14:00-16:00 or 15:00-17:00).
// Each faculty can have at most one lab per day and no overlapping sessions.
app.post("/api/timetable/auto-generate", async (req, res) => {
  try {
    const semester = String(req.body.semester || "").trim();
    const startValue = req.body.startDate ? String(req.body.startDate) : new Date().toISOString().slice(0, 10);
    const startDate = new Date(`${startValue}T00:00:00`);
    if (!semester) return res.status(400).json({ message: "Select a semester." });
    if (Number.isNaN(startDate.getTime())) return res.status(400).json({ message: "Choose a valid semester start date." });

    const workloads = await Workload.find({ semester })
      .populate("faculty", "name employeeId")
      .populate("course", "courseCode courseName credits").lean();
    if (!workloads.length) return res.status(400).json({ message: `No faculty workload assignments found for ${semester}. Assign faculty and courses in Workload first.` });
    if (workloads.some(w => !w.faculty || !w.course)) return res.status(400).json({ message: "Some workload rows have missing faculty or course records. Please correct them first." });

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const theoryPeriods = [
      ["09:00", "10:00"], ["10:00", "11:00"], ["11:00", "12:00"], ["12:00", "13:00"]
    ];
    const labPeriods = [["14:00", "16:00"], ["15:00", "17:00"]];
    const occupied = new Map(); // faculty|day -> assigned intervals
    const facultyDayLoad = new Map();
    const facultyLabDays = new Set();
    const scheduleSlots = [];

    const facultyKey = (id, day) => `${String(id)}|${day}`;
    const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];
    const canPlace = (facultyId, day, start, end) => {
      const key = facultyKey(facultyId, day);
      return !(occupied.get(key) || []).some(item => overlaps([start, end], item));
    };
    const place = (workload, day, startTime, endTime, classType, dayIndex) => {
      const key = facultyKey(workload.faculty._id, day);
      if (!occupied.has(key)) occupied.set(key, []);
      occupied.get(key).push([startTime, endTime]);
      facultyDayLoad.set(key, (facultyDayLoad.get(key) || 0) + (classType === "lab" ? 2 : 1));
      scheduleSlots.push({ faculty: workload.faculty._id, course: workload.course._id,
        entryType: "class", classType, label: "", day, dayIndex, startTime, endTime });
    };

    // Place lab sessions first because each faculty is allowed only one lab per day.
    const ordered = [...workloads].sort((a, b) => Number(b.labSessions || 0) - Number(a.labSessions || 0));
    for (const workload of ordered) {
      const count = Number(workload.labSessions || 0);
      if (count > 5) return res.status(409).json({ message: `${workload.faculty.name} has more than five lab sessions for ${workload.course.courseName}.` });
      for (let n = 0; n < count; n++) {
        const candidates = [];
        for (const day of days) {
          if (facultyLabDays.has(facultyKey(workload.faculty._id, day))) continue;
          for (const [startTime, endTime] of labPeriods) {
            if (canPlace(workload.faculty._id, day, startTime, endTime)) {
              candidates.push({ day, startTime, endTime, dayIndex: days.indexOf(day),
                load: facultyDayLoad.get(facultyKey(workload.faculty._id, day)) || 0 });
            }
          }
        }
        candidates.sort((a, b) => a.load - b.load || a.dayIndex - b.dayIndex || a.startTime.localeCompare(b.startTime));
        const chosen = candidates[0];
        if (!chosen) return res.status(409).json({ message: `Cannot place all labs for ${workload.faculty.name}. Each faculty can have only one lab per day, and labs need a continuous two-hour afternoon slot.` });
        place(workload, chosen.day, chosen.startTime, chosen.endTime, "lab", chosen.dayIndex);
        facultyLabDays.add(facultyKey(workload.faculty._id, chosen.day));
      }
    }

    // Place theory in morning periods, spreading a faculty's sessions over days.
    for (const workload of [...workloads].sort((a, b) => Number(b.weeklyHours) - Number(a.weeklyHours))) {
      for (let n = 0; n < Number(workload.weeklyHours || 0); n++) {
        const candidates = [];
        for (const day of days) for (const [startTime, endTime] of theoryPeriods) {
          if (canPlace(workload.faculty._id, day, startTime, endTime)) {
            candidates.push({ day, startTime, endTime, dayIndex: days.indexOf(day),
              load: facultyDayLoad.get(facultyKey(workload.faculty._id, day)) || 0 });
          }
        }
        candidates.sort((a, b) => a.load - b.load || a.dayIndex - b.dayIndex || a.startTime.localeCompare(b.startTime));
        const chosen = candidates[0];
        if (!chosen) return res.status(409).json({ message: `Cannot place all theory classes for ${workload.faculty.name}. Morning capacity is four one-hour periods per day.` });
        place(workload, chosen.day, chosen.startTime, chosen.endTime, "theory", chosen.dayIndex);
      }
    }

    // Add one visible lunch row to every faculty view (it is not a class).
    for (const day of days) scheduleSlots.push({ faculty: null, course: null, entryType: "break",
      classType: "theory", label: "Lunch Break", day, dayIndex: days.indexOf(day),
      startTime: "13:00", endTime: "14:00" });

    const monday = new Date(startDate);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const records = [];
    for (let weekNumber = 1; weekNumber <= 24; weekNumber++) {
      for (const slot of scheduleSlots) {
        const date = new Date(monday);
        date.setDate(date.getDate() + (weekNumber - 1) * 7 + slot.dayIndex);
        records.push({ faculty: slot.faculty, course: slot.course, entryType: slot.entryType,
          classType: slot.classType, label: slot.label, day: slot.day, startTime: slot.startTime,
          endTime: slot.endTime, semester, weekNumber, date });
      }
    }
    await Timetable.deleteMany({ semester });
    await Timetable.insertMany(records);
    const result = await Timetable.find({ semester }).populate("faculty", "name employeeId")
      .populate("course", "courseCode courseName").sort({ weekNumber: 1, date: 1, startTime: 1 }).lean();
    res.json({ message: `Generated a conflict-free timetable for ${workloads.length} workload assignments. Theory is in the morning; labs are in the afternoon, with at most one lab per faculty per day.`, timetable: result });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// Generate a 24-week timetable from user-defined day/time slots.
app.post("/api/timetable/generate", async (req, res) => {
  try {
    const semester = String(req.body.semester || "").trim();
    const startDate = new Date(`${req.body.startDate}T00:00:00`);
    const slots = Array.isArray(req.body.slots) ? req.body.slots : [];
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    if (!semester) return res.status(400).json({ message: "Semester is required." });
    if (!req.body.startDate || Number.isNaN(startDate.getTime())) return res.status(400).json({ message: "Choose a valid semester start date." });
    if (!slots.length) return res.status(400).json({ message: "Add at least one timetable slot." });

    const facultyIds = [...new Set(slots.filter(s => s.entryType !== "break").map(s => String(s.faculty || "")))];
    const courseIds = [...new Set(slots.filter(s => s.entryType !== "break").map(s => String(s.course || "")))];
    const [faculties, courses] = await Promise.all([Faculty.find({ _id: { $in: facultyIds } }), Course.find({ _id: { $in: courseIds } })]);
    const facultySet = new Set(faculties.map(x => String(x._id)));
    const courseSet = new Set(courses.map(x => String(x._id)));
    const normalized = [];
    for (const [i, slot] of slots.entries()) {
      const day = String(slot.day || "");
      const startTime = String(slot.startTime || "");
      const endTime = String(slot.endTime || "");
      const entryType = slot.entryType === "break" ? "break" : "class";
      if (!days.includes(day)) return res.status(400).json({ message: `Slot ${i + 1}: choose Monday to Friday.` });
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime)
        return res.status(400).json({ message: `Slot ${i + 1}: enter a valid start and end time.` });
      if (entryType === "class" && (!facultySet.has(String(slot.faculty)) || !courseSet.has(String(slot.course))))
        return res.status(400).json({ message: `Slot ${i + 1}: select a valid faculty and course.` });
      normalized.push({ faculty: entryType === "class" ? slot.faculty : null, course: entryType === "class" ? slot.course : null,
        entryType, label: entryType === "break" ? (String(slot.label || "Break").trim() || "Break") : "",
        day, dayIndex: days.indexOf(day), startTime, endTime });
    }
    // Prevent overlapping entries in the same day for the same faculty, and overlapping room-wide entries.
    for (let i = 0; i < normalized.length; i++) for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i], b = normalized[j];
      if (a.day === b.day && a.startTime < b.endTime && b.startTime < a.endTime) {
        if (a.entryType === "break" || b.entryType === "break" || String(a.faculty) === String(b.faculty))
          return res.status(409).json({ message: `${a.day}: ${a.startTime}–${a.endTime} overlaps another timetable entry. Please adjust the time.` });
      }
    }
    const monday = new Date(startDate);
    const offset = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - offset);
    const schedule = [];
    for (let weekNumber = 1; weekNumber <= 24; weekNumber++) for (const slot of normalized) {
      const date = new Date(monday);
      date.setDate(date.getDate() + (weekNumber - 1) * 7 + slot.dayIndex);
      schedule.push({ faculty: slot.faculty, course: slot.course, entryType: slot.entryType, label: slot.label,
        day: slot.day, startTime: slot.startTime, endTime: slot.endTime, semester, weekNumber, date });
    }
    await Timetable.deleteMany({ semester });
    await Timetable.insertMany(schedule);
    const result = await Timetable.find({ semester }).populate("faculty", "name employeeId").populate("course", "courseCode courseName").sort({ weekNumber: 1, date: 1, startTime: 1 });
    res.json(result);
  } catch (error) { res.status(500).json({ message: error.message }); }
});
app.get("/api/timetable", async (req, res) => {
  try {
    const filter = {};
    if (req.query.semester) filter.semester = req.query.semester;
    if (req.query.faculty) filter.$or = [{ faculty: req.query.faculty }, { entryType: "break", faculty: null }];
    res.json(await Timetable.find(filter).populate("faculty", "name employeeId").populate("course", "courseCode courseName").sort({ weekNumber: 1, day: 1, startTime: 1 }).lean());
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// EXCEL AND PDF REPORT EXPORTS
app.get("/api/reports/workload.xlsx", async (req, res) => {
  try {
    const rows = await Workload.find().populate("faculty", "name employeeId department").populate("course", "courseCode courseName").lean();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Faculty Workload");
    sheet.columns = [
      { header: "Faculty", key: "faculty", width: 25 }, { header: "Employee ID", key: "id", width: 18 },
      { header: "Department", key: "department", width: 22 }, { header: "Course", key: "course", width: 30 },
      { header: "Semester", key: "semester", width: 18 }, { header: "Weekly Hours", key: "hours", width: 16 }
    ];
    rows.forEach(r => sheet.addRow({ faculty: r.faculty?.name || "", id: r.faculty?.employeeId || "",
      department: r.faculty?.department || "", course: `${r.course?.courseCode || ""} - ${r.course?.courseName || ""}`,
      semester: r.semester, hours: r.weeklyHours }));
    sheet.getRow(1).font = { bold: true };
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="faculty-workload.xlsx"');
    await workbook.xlsx.write(res); res.end();
  } catch (error) { res.status(500).json({ message: error.message }); }
});
app.get("/api/reports/workload.pdf", async (req, res) => {
  try {
    const rows = await Workload.find().populate("faculty", "name employeeId department").populate("course", "courseCode courseName").lean();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="faculty-workload.pdf"');
    const doc = new PDFDocument({ margin: 40, size: "A4" }); doc.pipe(res);
    doc.fontSize(18).text("Faculty Workload Report"); doc.moveDown();
    doc.fontSize(9);
    rows.forEach((r, i) => doc.text(`${i+1}. ${r.faculty?.name || "—"} (${r.faculty?.employeeId || "—"}) | ${r.course?.courseCode || "—"} - ${r.course?.courseName || ""} | ${r.semester} | ${r.weeklyHours} hrs/week`));
    doc.end();
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// REPORT
app.get("/api/reports/workload", async (req, res) => {
  try {
    const report = await Workload.aggregate([
      { $group: { _id: "$faculty", totalWeeklyHours: { $sum: { $add: ["$weeklyHours", { $multiply: [{ $ifNull: ["$labSessions", 0] }, 2] }] } }, assignedCourses: { $sum: 1 } } },
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
