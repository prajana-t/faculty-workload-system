# FacultyHub – Faculty Course & Workload Management System

## Features
- Admin and faculty login with role-based access.
- Faculty and course management.
- Workload allocation using total teaching hours for a semester.
- Automatic 24-week timetable generation from faculty workload assignments, Monday–Friday, one-hour teaching periods, with a reserved lunch break.
- Timetable displays week number, date, day, time, faculty and course.
- Faculty/course edit prompts accept readable names/codes; MongoDB IDs are never requested from the user.
- Conflict checks and PDF/Excel workload reports.

## Run locally (Windows / VS Code)
1. Install Node.js 20.19 or later.
2. Extract this ZIP and open the `FacultyHUB` folder in VS Code.
3. Open Terminal and run `npm install`.
4. Copy `.env.example` to `.env`.
5. Add your own MongoDB Atlas URI, admin login details and a new random session secret.
6. Run `npm start`.
7. Open `http://localhost:3000`.

## Workload and timetable example
For semester `Semester 5`, assign Prajana:
- IoT: 70 total semester hours
- Full Stack: 65 total semester hours
- Web Development: 60 total semester hours

Assign faculty, courses, semester and classes per week in Workload Management. The timetable is regenerated automatically whenever a workload is added, edited or deleted. No manual day/time slot entry is required. In Semester Timetable, choose a semester and a faculty member to display that person’s MongoDB workload assignments and weekly timetable. The weekly pattern is repeated for 24 weeks. Faculty time-slot overlaps are prevented.

The 24-week model is an approximation of a six-month semester. Institutional holidays and examination weeks are not automatically excluded; review the generated schedule before publishing.

## Security
- `.env` is intentionally excluded. Create it from `.env.example`.
- Never upload `.env` to GitHub or share MongoDB passwords/session secrets.
- Set `MONGODB_URI`, `PORT`, `NODE_ENV`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET`.
- Generate a session secret using: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- If credentials were previously shared, rotate the MongoDB database password and all exposed secrets before running this version.

## Vercel
Import the GitHub repository into Vercel and configure the environment variables listed above in Project Settings. Configure MongoDB Atlas network access for your deployment, then redeploy.


## Faculty-wise weekly timetable view

The Workload table includes a View Timetable action on every assignment. Clicking it opens the selected faculty member's timetable for that semester. The Semester Timetable section uses a Semester dropdown and a Faculty Name dropdown, with no Semester Start Date field. Select a faculty member to see their workload table, then click View Timetable to generate the semester schedule and display only that faculty member’s classes and lunch-break row. Generated timetable records are stored in MongoDB and repeated across 24 weeks.


### Timetable scheduling rule
Each `Classes / Week` value is the number of one-hour sessions required for that course each week (1–5 per workload assignment). The generator uses 09:00–13:00 and 14:00–17:00 periods, reserving 13:00–14:00 for lunch. The current shared timetable supports up to 35 one-hour sessions per semester week; if assignments exceed this capacity, it reports a validation error instead of creating overlapping entries. Lab duration is not inferred from course credits; a separate course/session-type and duration field would be needed to schedule two-hour labs automatically.


## Automatic faculty timetable (updated)
- Workload assignments now include **Theory Classes Per Week** and **Lab Sessions Per Week**.
- Theory sessions are scheduled in the morning from 9:00 AM to 1:00 PM.
- Each lab is a continuous two-hour afternoon session (2:00–4:00 PM or 3:00–5:00 PM).
- A faculty member receives at most one lab per day.
- A faculty member's own theory and lab sessions are checked so they cannot overlap.
- The timetable is regenerated when a workload is added, edited, or deleted.
- **View Timetable** generates the schedule from the current workload assignments for the selected semester, then displays the selected faculty member’s timetable.
- Conflict checking compares entries from the same actual week/date, preventing false overlap warnings caused by the 24-week repeating timetable.

Existing workload records are compatible: records without `labSessions` are treated as having zero lab sessions. Set the lab-session count for each course in the Workload form and regenerate the timetable after updating existing assignments.


## Faculty sign-up when the admin has already created the faculty profile
If the admin has already created a Faculty record for course/workload assignment, the faculty member can sign up using the same email and Employee ID. Signup now reuses that existing Faculty record and creates the separate User login record, instead of incorrectly reporting that the faculty is already registered. If the email and Employee ID point to different faculty profiles, signup is rejected to prevent linking the account to the wrong person. Existing User login accounts still need to log in rather than sign up again.


## Faculty login timetable
The faculty portal now displays the faculty profile, workload assignments, a working Update Hours button, and a timetable table with day, time, course code, course subject, semester, and class type. The timetable API is authenticated and only returns the signed-in faculty member's own schedule. If no timetable has been generated for that faculty member, the page explains that the administrator needs to generate it from the admin workload/timetable section.


## Faculty timetable grid correction
Faculty login now displays the same weekly grid style as the administrator's faculty timetable view. It shows only week 1 as the representative repeating weekly pattern, includes lunch breaks, spans multi-hour lab sessions across their time columns, and deduplicates repeated slot rows. The faculty summary shows semester and faculty name. This view reads timetable data generated from MongoDB; an administrator must generate the timetable first.
