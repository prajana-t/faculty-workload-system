$(document).ready(function () {
  let facultyList = [];
  let courseList = [];
  let workloadList = [];

  // Safely display text received from the database
  function escapeHTML(value) {
    return $("<div>").text(value == null ? "" : String(value)).html();
  }

  // Display success or error messages
  function showMessage(message, success = true) {
    $("#message")
      .removeClass("d-none alert-success alert-danger")
      .addClass(success ? "alert-success" : "alert-danger")
      .text(message);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Common API request function
  async function api(url, method = "GET", data = null) {
    const options = {
      url,
      method,
      dataType: "json"
    };

    if (data !== null) {
      options.contentType = "application/json";
      options.data = JSON.stringify(data);
    }

    try {
      return await $.ajax(options);
    } catch (xhr) {
      const message =
        xhr.responseJSON?.message ||
        xhr.responseJSON?.error ||
        xhr.statusText ||
        "Request failed";

      throw new Error(message);
    }
  }

  // Check database connection
  async function checkDatabase() {
    try {
      const result = await api("/api/db-health");

      $("#dbStatus")
        .text(result.connected ? "MongoDB Connected" : "MongoDB Disconnected")
        .removeClass("text-bg-warning text-bg-danger text-bg-success")
        .addClass(result.connected ? "text-bg-success" : "text-bg-danger");
    } catch (error) {
      $("#dbStatus")
        .text("Database Error")
        .removeClass("text-bg-warning text-bg-success")
        .addClass("text-bg-danger");
    }
  }

  // Navigation between sections
  $(".nav-link[data-section]").on("click", function () {
    const sectionId = $(this).data("section");

    $(".nav-link[data-section]").removeClass("active");
    $(this).addClass("active");

    $(".content-section").addClass("d-none");
    $("#" + sectionId).removeClass("d-none");

    if (sectionId === "reportSection") {
      loadReport();
    }
  });

  // Load faculty list
  async function loadFaculty() {
    facultyList = await api("/api/faculty");

    $("#facultyCount").text(facultyList.length);

    $("#facultyTable").html(
      facultyList.length
        ? facultyList.map(f => `
            <tr>
              <td>${escapeHTML(f.name)}</td>
              <td>${escapeHTML(f.employeeId)}</td>
              <td>${escapeHTML(f.department)}</td>
              <td>${escapeHTML(f.email)}</td>
              <td>
                <button class="btn btn-sm btn-danger delete-faculty"
                  data-id="${escapeHTML(f._id)}">Delete</button>
              </td>
            </tr>
          `).join("")
        : '<tr><td colspan="5" class="text-center">No faculty members added.</td></tr>'
    );

    $("#workloadFaculty").html(
      '<option value="">Select faculty</option>' +
      facultyList.map(f => `
        <option value="${escapeHTML(f._id)}">
          ${escapeHTML(f.name)} (${escapeHTML(f.employeeId)})
        </option>
      `).join("")
    );
  }

  // Add faculty
  $("#facultyForm").on("submit", async function (event) {
    event.preventDefault();

    const data = {
      name: $("#facultyName").val().trim(),
      employeeId: $("#employeeId").val().trim(),
      department: $("#facultyDepartment").val().trim(),
      email: $("#facultyEmail").val().trim()
    };

    const lettersOnly = /^[\p{L}]+(?:[\s'-][\p{L}]+)*$/u;
    if (!lettersOnly.test(data.name)) return showMessage("Faculty name must contain letters only.", false);
    if (!lettersOnly.test(data.department)) return showMessage("Department must contain letters only.", false);

    try {
      await api("/api/faculty", "POST", data);
      this.reset();
      await refreshAll();
      showMessage("Faculty member added successfully.");
    } catch (error) {
      showMessage(error.message, false);
    }
  });

  // Delete faculty
  $("#facultyTable").on("click", ".delete-faculty", async function () {
    const id = $(this).attr("data-id");

    if (!confirm("Delete this faculty member and their workload assignments?")) {
      return;
    }

    try {
      await api("/api/faculty/" + encodeURIComponent(id), "DELETE");
      await refreshAll();
      showMessage("Faculty member deleted successfully.");
    } catch (error) {
      showMessage(error.message, false);
    }
  });

  // Load courses
  async function loadCourses() {
    courseList = await api("/api/courses");

    $("#courseCount").text(courseList.length);

    $("#courseTable").html(
      courseList.length
        ? courseList.map(c => `
            <tr>
              <td>${escapeHTML(c.courseCode)}</td>
              <td>${escapeHTML(c.courseName)}</td>
              <td>${escapeHTML(c.department)}</td>
              <td>${escapeHTML(c.credits)}</td>
              <td>
                <button class="btn btn-sm btn-danger delete-course"
                  data-id="${escapeHTML(c._id)}">Delete</button>
              </td>
            </tr>
          `).join("")
        : '<tr><td colspan="5" class="text-center">No courses added.</td></tr>'
    );

    $("#workloadCourse").html(
      '<option value="">Select course</option>' +
      courseList.map(c => `
        <option value="${escapeHTML(c._id)}">
          ${escapeHTML(c.courseCode)} - ${escapeHTML(c.courseName)}
        </option>
      `).join("")
    );
  }

  // Add course
  $("#courseForm").on("submit", async function (event) {
    event.preventDefault();

    const data = {
      courseCode: $("#courseCode").val().trim(),
      courseName: $("#courseName").val().trim(),
      department: $("#courseDepartment").val().trim(),
      credits: Number($("#credits").val())
    };

    const lettersOnly = /^[\p{L}]+(?:[\s'-][\p{L}]+)*$/u;
    if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]+$/.test(data.courseCode)) return showMessage("Course code must contain letters and numbers, such as CS301.", false);
    if (!lettersOnly.test(data.courseName)) return showMessage("Course name must contain letters only.", false);
    if (!lettersOnly.test(data.department)) return showMessage("Department must contain letters only.", false);

    try {
      await api("/api/courses", "POST", data);
      this.reset();
      await refreshAll();
      showMessage("Course added successfully.");
    } catch (error) {
      showMessage(error.message, false);
    }
  });

  // Delete course
  $("#courseTable").on("click", ".delete-course", async function () {
    const id = $(this).attr("data-id");

    if (!confirm("Delete this course and its workload assignments?")) {
      return;
    }

    try {
      await api("/api/courses/" + encodeURIComponent(id), "DELETE");
      await refreshAll();
      showMessage("Course deleted successfully.");
    } catch (error) {
      showMessage(error.message, false);
    }
  });

  // Load workload assignments
  async function loadWorkloads() {
    const workloads = await api("/api/workloads");
    workloadList = workloads;

    $("#workloadCount").text(workloads.length);

    $("#workloadTable").html(
      workloads.length
        ? workloads.map(w => `
            <tr>
              <td>${escapeHTML(w.faculty?.name || "Faculty unavailable")}</td>
              <td>${escapeHTML(w.course?.courseCode || "Course unavailable")} -
                  ${escapeHTML(w.course?.courseName || "")}</td>
              <td>${escapeHTML(w.semester)}</td>
              <td>${escapeHTML(w.weeklyHours)}</td>
              <td>${escapeHTML(w.labSessions || 0)}</td>
              <td>
                <button class="btn btn-sm btn-outline-primary view-faculty-timetable" data-faculty="${escapeHTML(w.faculty?._id || "")}" data-semester="${escapeHTML(w.semester)}">View Timetable</button>
                <button class="btn btn-sm btn-outline-primary edit-workload" data-id="${escapeHTML(w._id)}">Edit</button>
                <button class="btn btn-sm btn-danger delete-workload"
                  data-id="${escapeHTML(w._id)}">Delete</button>
              </td>
            </tr>
          `).join("")
        : '<tr><td colspan="6" class="text-center">No workload assigned.</td></tr>'
    );
  }

  async function autoGenerateAfterWorkloadChange(semester) {
    if (!semester) return;
    try {
      await api("/api/timetable/auto-generate", "POST", {
        semester: String(semester),
        startDate: $("#semesterStartDate").val() || new Date().toISOString().slice(0, 10)
      });
    } catch (error) {
      // Keep the workload save successful, but tell the admin if the schedule
      // cannot be generated (for example, too many weekly classes to fit).
      showMessage(`Workload saved, but timetable generation needs attention: ${error.message}`, false);
    }
  }

  // Add workload assignment
  $("#workloadForm").on("submit", async function (event) {
    event.preventDefault();

    const data = {
      faculty: $("#workloadFaculty").val(),
      course: $("#workloadCourse").val(),
      semester: $("#semester").val().trim(),
      weeklyHours: Number($("#weeklyHours").val()),
      labSessions: Number($("#labSessions").val())
    };

    if (!Number.isInteger(data.weeklyHours) || data.weeklyHours < 1 || data.weeklyHours > 5) {
      return showMessage("Theory classes per week must be a whole number from 1 to 5.", false);
    }
    if (!Number.isInteger(data.labSessions) || data.labSessions < 0 || data.labSessions > 5) {
      return showMessage("Lab sessions per week must be a whole number from 0 to 5.", false);
    }

    try {
      await api("/api/workloads", "POST", data);
      this.reset();
      await refreshAll();
      await autoGenerateAfterWorkloadChange(data.semester);
      showMessage("Workload assigned and semester timetable generated automatically.");
    } catch (error) {
      showMessage(error.message, false);
    }
  });

  // Delete workload assignment
  $("#workloadTable").on("click", ".delete-workload", async function () {
    const id = $(this).attr("data-id");

    if (!confirm("Delete this workload assignment?")) {
      return;
    }

    try {
      const deleted = await api("/api/workloads/" + encodeURIComponent(id), "DELETE");
      await refreshAll();
      if (deleted.remainingAssignments > 0) await autoGenerateAfterWorkloadChange(deleted.semester);
      showMessage("Workload assignment deleted and timetable refreshed.");
    } catch (error) {
      showMessage(error.message, false);
    }
  });


  // Edit an existing workload assignment
  $("#workloadTable").on("click", ".edit-workload", async function () {
    const id = $(this).attr("data-id");
    const current = await api("/api/workloads");
    const item = current.find(w => w._id === id);
    if (!item) return showMessage("Workload assignment not found.", false);
    const facultyName = prompt("Enter faculty name (available: " + facultyList.map(f => f.name).join(", ") + "):", item.faculty?.name || "");
    if (facultyName === null) return;
    const selectedFaculty = facultyList.find(f => f.name.toLowerCase() === facultyName.trim().toLowerCase());
    if (!selectedFaculty) return showMessage("Faculty name not found.", false);
    const courseName = prompt("Enter course name or code (available: " + courseList.map(c => `${c.courseName} [${c.courseCode}]`).join(", ") + "):", item.course?.courseName || "");
    if (courseName === null) return;
    const selectedCourse = courseList.find(c => c.courseName.toLowerCase() === courseName.trim().toLowerCase() || c.courseCode.toLowerCase() === courseName.trim().toLowerCase());
    if (!selectedCourse) return showMessage("Course not found.", false);
    const semester = prompt("Semester:", item.semester);
    if (semester === null) return;
    const weeklyHours = Number(prompt("Theory classes per week (1–5):", item.weeklyHours));
    if (!Number.isInteger(weeklyHours) || weeklyHours < 1 || weeklyHours > 5) return showMessage("Enter theory classes from 1 to 5.", false);
    const labSessions = Number(prompt("Lab sessions per week (0–5):", item.labSessions || 0));
    if (!Number.isInteger(labSessions) || labSessions < 0 || labSessions > 5) return showMessage("Enter lab sessions from 0 to 5.", false);
    try {
      await api("/api/workloads/" + encodeURIComponent(id), "PUT", { faculty: selectedFaculty._id, course: selectedCourse._id, semester, weeklyHours, labSessions });
      await refreshAll();
      await autoGenerateAfterWorkloadChange(semester);
      showMessage("Workload assignment updated and timetable regenerated.");
    } catch (error) { showMessage(error.message, false); }
  });

  function refreshTimetableSelectors() {
    const semesters = [...new Set(workloadList.map(w => String(w.semester || "").trim()).filter(Boolean))].sort();
    const selectedSemester = $("#timetableSemester").val();
    $("#timetableSemester").html('<option value="">Select semester</option>' + semesters.map(value =>
      `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join(""));
    if (semesters.includes(selectedSemester)) $("#timetableSemester").val(selectedSemester);
    refreshTimetableFacultyOptions();
  }

  function refreshTimetableFacultyOptions() {
    const semester = $("#timetableSemester").val();
    const selectedFaculty = $("#timetableFaculty").val();
    const assignedIds = new Set(workloadList
      .filter(w => !semester || String(w.semester) === String(semester))
      .map(w => String(w.faculty?._id || "")).filter(Boolean));
    const options = facultyList.filter(f => assignedIds.has(String(f._id)));
    $("#timetableFaculty").html('<option value="">Select faculty</option>' + options.map(f =>
      `<option value="${escapeHTML(f._id)}">${escapeHTML(f.name)} (${escapeHTML(f.employeeId || "")})</option>`).join(""));
    if (options.some(f => String(f._id) === String(selectedFaculty))) $("#timetableFaculty").val(selectedFaculty);
    renderSelectedFacultyWorkload();
  }

  function renderSelectedFacultyWorkload() {
    const semester = $("#timetableSemester").val();
    const facultyId = $("#timetableFaculty").val();
    const rows = workloadList.filter(w => String(w.semester) === String(semester) &&
      String(w.faculty?._id || "") === String(facultyId));
    $("#selectedFacultyWorkload").html(rows.length ? rows.map(w => `
      <tr><td>${escapeHTML(w.faculty?.name || "Faculty")}</td>
      <td>${escapeHTML(w.semester)}</td>
      <td>${escapeHTML(w.course?.courseCode ? `${w.course.courseCode} · ${w.course.courseName || ""}` : (w.course?.courseName || "Course"))}</td>
      <td>${escapeHTML(w.weeklyHours)}</td><td>${escapeHTML(w.labSessions || 0)}</td></tr>
    `).join("") : '<tr><td colspan="5" class="text-center text-muted">No workload assignments for this selection.</td></tr>');
  }

  async function generateSemesterTimetable(semester, facultyId) {
    const generated = await api("/api/timetable/auto-generate", "POST", { semester });
    const rows = generated.timetable.filter(row =>
      String(row.faculty?._id || "") === String(facultyId) || row.entryType === "break");
    renderTimetable(rows);
    await loadConflicts();
    showMessage(generated.message || "Timetable generated successfully.");
    return rows;
  }

  $("#timetableSemester").on("change", function () {
    refreshTimetableFacultyOptions();
    $("#timetableTable").html('<div class="text-muted text-center py-4">Select a faculty member and click View Timetable.</div>');
  });
  $("#timetableFaculty").on("change", renderSelectedFacultyWorkload);

  // Generate from MongoDB workload assignments and display only the selected faculty.
  $("#timetableForm").on("submit", async function (event) {
    event.preventDefault();
    const semester = $("#timetableSemester").val();
    const facultyId = $("#timetableFaculty").val();
    if (!semester) return showMessage("Select a semester with workload assignments.", false);
    if (!facultyId) return showMessage("Select a faculty member assigned to this semester.", false);
    try { await generateSemesterTimetable(semester, facultyId); }
    catch (error) { showMessage(error.message, false); }
  });

  // Workload row -> View Timetable: preselect the semester and faculty.
  $("#workloadTable").on("click", ".view-faculty-timetable", async function () {
    const facultyId = $(this).attr("data-faculty");
    const semester = $(this).attr("data-semester");
    $(".nav-link[data-section='timetableSection']").trigger("click");
    $("#timetableSemester").val(semester);
    refreshTimetableFacultyOptions();
    $("#timetableFaculty").val(facultyId);
    renderSelectedFacultyWorkload();
    try { await generateSemesterTimetable(semester, facultyId); }
    catch (error) { showMessage(error.message, false); }
  });

  function renderTimetable(rows) {
    const container = $("#timetableTable");
    if (!rows.length) {
      container.html('<div class="text-muted text-center py-4">No timetable entries found.</div>');
      return;
    }

    // Display only one representative week: the saved weekly pattern repeats for 24 weeks.
    const firstWeek = rows.filter(row => Number(row.weekNumber) === 1);
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const breaks = firstWeek.filter(row => row.entryType === "break");
    const groups = new Map();

    firstWeek.filter(row => row.entryType === "class").forEach(row => {
      const facultyId = String(row.faculty?._id || row.faculty || "unknown");
      const facultyName = row.faculty?.name || "Faculty";
      if (!groups.has(facultyId)) groups.set(facultyId, { name: facultyName, entries: [] });
      groups.get(facultyId).entries.push(row);
    });

    if (!groups.size && breaks.length) {
      groups.set("breaks", { name: "Timetable Breaks", entries: [] });
    }

    const allEntries = [...firstWeek];
    const toMinutes = value => {
      const [h, m] = String(value || "00:00").split(":").map(Number);
      return h * 60 + m;
    };
    const boundariesSet = new Set();
    allEntries.forEach(item => {
      boundariesSet.add(toMinutes(item.startTime));
      boundariesSet.add(toMinutes(item.endTime));
    });

    // Add hourly boundaries between the earliest and latest entry so a 2-hour lab
    // occupies two adjacent hourly columns, just like the handwritten reference.
    if (boundariesSet.size) {
      const values = [...boundariesSet];
      const min = Math.floor(Math.min(...values) / 60) * 60;
      const max = Math.ceil(Math.max(...values) / 60) * 60;
      for (let minute = min; minute <= max; minute += 60) boundariesSet.add(minute);
    }
    const boundaries = [...boundariesSet].sort((a, b) => a - b);
    const boundaryIndex = new Map(boundaries.map((value, index) => [value, index]));
    const timeColumns = boundaries.slice(0, -1).map((start, index) => ({ start, end: boundaries[index + 1] }));

    const clockLabel = minute => {
      const hour = Math.floor(minute / 60), mins = minute % 60;
      const suffix = hour >= 12 ? "PM" : "AM";
      return `${hour % 12 || 12}${mins ? `:${String(mins).padStart(2, "0")}` : ":00"} ${suffix}`;
    };
    const timeHeader = ({ start, end }) => {
      const startHour = Math.floor(start / 60), endHour = Math.floor(end / 60);
      const startSuffix = startHour >= 12 ? "PM" : "AM";
      const endSuffix = endHour >= 12 ? "PM" : "AM";
      const startText = `${startHour % 12 || 12}${start % 60 ? `:${String(start % 60).padStart(2, "0")}` : ":00"}`;
      const endText = `${endHour % 12 || 12}${end % 60 ? `:${String(end % 60).padStart(2, "0")}` : ":00"}`;
      return `${startText} ${startSuffix}–${endText} ${endSuffix}`;
    };

    const semester = firstWeek[0]?.semester || $("#timetableSemester").val() || "";
    const cards = [...groups.values()].map(group => {
      const entries = [...group.entries, ...breaks];
      const courses = [...new Set(group.entries.map(item =>
        item.course?.courseName || item.course?.courseCode || "Course"
      ))];
      const header = `<thead><tr><th class="timetable-day-heading">Day</th>${timeColumns.map(column =>
        `<th>${escapeHTML(timeHeader(column))}</th>`
      ).join("")}</tr></thead>`;

      const body = days.map(day => {
        const dayEntries = entries.filter(item => item.day === day)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        const cells = [];
        let occupiedUntil = 0;

        timeColumns.forEach((column, index) => {
          if (index < occupiedUntil) return;
          const item = dayEntries.find(entry => toMinutes(entry.startTime) === column.start);
          if (!item) {
            cells.push('<td class="timetable-empty">—</td>');
            return;
          }
          const endIndex = boundaryIndex.get(toMinutes(item.endTime));
          const colspan = Math.max(1, (endIndex ?? index + 1) - index);
          occupiedUntil = index + colspan;
          const isBreak = item.entryType === "break";
          const label = isBreak
            ? (item.label || "Break")
            : `${item.course?.courseCode ? item.course.courseCode + " · " : ""}${item.course?.courseName || "Course"} (${String(item.classType || "theory").toUpperCase()})`;
          cells.push(`<td colspan="${colspan}" class="${isBreak ? "timetable-break-cell" : "timetable-filled"}"><strong>${escapeHTML(label)}</strong></td>`);
        });
        return `<tr><th scope="row" class="timetable-day-name">${day}</th>${cells.join("")}</tr>`;
      }).join("");

      return `<section class="faculty-timetable-card">
        <div class="faculty-timetable-heading">
          <div><h6>Semester: ${escapeHTML(semester)} <span class="timetable-heading-separator">|</span> Faculty: ${escapeHTML(group.name)}</h6>
          <span class="faculty-course-count">${courses.length} ${courses.length === 1 ? "course" : "courses"} handled</span></div>
        </div>
        <div class="table-responsive"><table class="faculty-week-grid timetable-matrix">${header}<tbody>${body}</tbody></table></div>
        <p class="faculty-timetable-note">Each row represents a weekday. Each column represents a time slot. Theory appears in the morning; two-hour lab sessions appear in the afternoon. Each faculty member has at most one lab per day.</p>
      </section>`;
    });

    container.html(cards.join(""));
  }

  function formatTimetableTime(value) {
    const [hourText, minute] = String(value || "").split(":");
    const hour = Number(hourText), suffix = hour >= 12 ? "PM" : "AM";
    return `${hour % 12 || 12}:${minute || "00"} ${suffix}`;
  }

  async function loadConflicts() {
    try {
      const conflicts = await api("/api/conflicts");
      $("#conflictList").html(conflicts.length ? conflicts.map(c =>
        `<div class="alert alert-warning mb-2"><strong>${escapeHTML(c.type.replaceAll("_", " "))}</strong> — ${escapeHTML(c.faculty)}: ${escapeHTML(c.detail)}</div>`
      ).join("") : '<div class="alert alert-success mb-0">No workload-limit or timetable-overlap conflicts detected.</div>');
    } catch (error) { showMessage(error.message, false); }
  }
  $("#refreshConflicts").on("click", loadConflicts);

  // Load workload report
  async function loadReport() {
    try {
      const reports = await api("/api/reports/workload");

      $("#reportTable").html(
        reports.length
          ? reports.map(r => `
              <tr>
                <td>${escapeHTML(r.facultyName)}</td>
                <td>${escapeHTML(r.facultyId)}</td>
                <td>${escapeHTML(r.department)}</td>
                <td>${escapeHTML(r.assignedCourses)}</td>
                <td>${escapeHTML(r.totalWeeklyHours)}</td>
              </tr>
            `).join("")
          : '<tr><td colspan="5" class="text-center">No report data available.</td></tr>'
      );
      if (window.workloadChartInstance) window.workloadChartInstance.destroy();
      const canvas = document.getElementById("workloadChart");
      if (canvas && window.Chart) {
        window.workloadChartInstance = new Chart(canvas, {
          type: "bar",
          data: { labels: reports.map(r => r.facultyName), datasets: [{ label: "Teaching hours per week", data: reports.map(r => r.totalWeeklyHours) }] },
          options: { responsive: true, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true } } }
        });
      }
    } catch (error) {
      showMessage(error.message, false);
    }
  }

  $("#refreshReport").on("click", loadReport);

  // Refresh all tables and dashboard numbers. Populate timetable selectors only
  // after faculty, course and workload records have finished loading.
  async function refreshAll() {
    await Promise.all([loadFaculty(), loadCourses(), loadWorkloads()]);
    refreshTimetableSelectors();
  }

  // Show or hide passwords on the login and faculty sign-up forms.
  $(document).on("click", ".password-toggle", function () {
    const inputId = $(this).attr("data-target");
    const passwordInput = document.getElementById(inputId);
    if (!passwordInput) return;

    const shouldShow = passwordInput.type === "password";
    passwordInput.type = shouldShow ? "text" : "password";
    $(this).find("i")
      .toggleClass("bi-eye", !shouldShow)
      .toggleClass("bi-eye-slash", shouldShow);
    $(this)
      .attr("aria-label", shouldShow ? "Hide password" : "Show password")
      .attr("aria-pressed", String(shouldShow));
  });

  // Authentication and role-based portal selection.
  function authMessage(message, success = false) {
    $("#authMessage").removeClass("d-none alert-success alert-danger")
      .addClass(success ? "alert-success" : "alert-danger").text(message);
  }
  function updateUserAvatars(email) {
    const initial = email && String(email).trim()
      ? String(email).trim().charAt(0).toUpperCase()
      : "U";
    $("#adminUserAvatar, #facultyUserAvatar").text(initial);
  }

  function showLoginScreen() {
    $("#authScreen").removeClass("d-none");
    $("#facultyPortal, .app-layout").addClass("d-none");
  }
  function showAdminPortal() {
    $("#authScreen, #facultyPortal").addClass("d-none");
    $(".app-layout").removeClass("d-none");
    checkDatabase();
    refreshAll().catch(error => showMessage("Could not load project data. " + error.message, false));
  }
  async function showFacultyPortal() {
    $("#authScreen, .app-layout").addClass("d-none");
    $("#facultyPortal").removeClass("d-none");
    try {
      const result = await api("/api/faculty/me/workloads");
      $("#facultyWelcomeName").text(result.faculty.name);
      $("#facultyProfile").html(`
        <div><strong>Name</strong><span>${escapeHTML(result.faculty.name)}</span></div>
        <div><strong>Employee ID</strong><span>${escapeHTML(result.faculty.employeeId)}</span></div>
        <div><strong>Department</strong><span>${escapeHTML(result.faculty.department)}</span></div>
        <div><strong>Email</strong><span>${escapeHTML(result.faculty.email)}</span></div>
      `);
      $("#myWorkloadTable").html(result.workloads.length ? result.workloads.map(w => `
        <tr><td>${escapeHTML(w.course?.courseCode || "")} - ${escapeHTML(w.course?.courseName || "")}</td>
        <td>${escapeHTML(w.semester)}</td><td>${escapeHTML(w.weeklyHours)}</td>
        <td><button type="button" class="btn btn-sm btn-primary update-my-hours" data-id="${escapeHTML(w._id)}" data-hours="${escapeHTML(w.weeklyHours)}"><i class="bi bi-pencil-square"></i> Update Hours</button></td></tr>
      `).join("") : '<tr><td colspan="4" class="text-center">No workload has been assigned to you yet. Please contact the administrator.</td></tr>');

      try {
        await loadFacultyTimetable();
      } catch (timetableError) {
        $("#myTimetableTable").html(`<tr><td colspan="6" class="text-center text-danger py-4">${escapeHTML(timetableError.message)}</td></tr>`);
      }
    } catch (error) {
      authMessage(error.message);
      showLoginScreen();
    }
  }
  function formatFacultyTime(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return value || "—";
    const parts = value.split(":").map(Number);
    const hour = parts[0];
    return `${hour % 12 || 12}:${String(parts[1]).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
  }

  async function loadFacultyTimetable() {
    const selectedSemester = $("#myTimetableSemester").val() || "";
    const url = "/api/faculty/me/timetable" +
      (selectedSemester ? "?semester=" + encodeURIComponent(selectedSemester) : "");
    const response = await api(url);
    const semesters = response.semesters || [];
    const select = $("#myTimetableSemester");
    select.html('<option value="">All semesters</option>' + semesters.map(s =>
      `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join(""));
    if (semesters.includes(selectedSemester)) select.val(selectedSemester);

    const faculty = response.faculty || {};
    const rows = response.timetable || [];
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const toMinutes = value => {
      const [h, m] = String(value || "00:00").split(":").map(Number);
      return h * 60 + m;
    };
    const clockLabel = minute => {
      const hour = Math.floor(minute / 60), mins = minute % 60;
      const suffix = hour >= 12 ? "PM" : "AM";
      return `${hour % 12 || 12}${mins ? `:${String(mins).padStart(2, "0")}` : ":00"} ${suffix}`;
    };
    const timeHeader = ({start, end}) => `${clockLabel(start)}–${clockLabel(end)}`;

    // Use one representative week and deduplicate identical slots defensively.
    const unique = new Map();
    rows.forEach(row => {
      const key = [row.entryType, row.day, row.startTime, row.endTime, row.semester,
        row.course?._id || row.course?.courseCode || row.label, row.classType].join("|");
      if (!unique.has(key)) unique.set(key, row);
    });
    const entries = [...unique.values()];
    const classEntries = entries.filter(row => row.entryType !== "break");
    $("#myFacultyTimetableMeta").html(`
      <div class="faculty-timetable-summary">
        Semester: ${escapeHTML(selectedSemester || classEntries[0]?.semester || "—")}
        &nbsp; | &nbsp; Faculty: ${escapeHTML(faculty.name || "—")}
        ${faculty.employeeId ? `&nbsp; | &nbsp; Employee ID: ${escapeHTML(faculty.employeeId)}` : ""}
        ${faculty.department ? `&nbsp; | &nbsp; Department: ${escapeHTML(faculty.department)}` : ""}
      </div>
      <div class="small text-muted mb-1">${faculty.email ? `Email: ${escapeHTML(faculty.email)}` : ""}</div>
      <div class="small text-muted mt-1 mb-2">${[...new Set(classEntries.map(row => row.course?.courseCode).filter(Boolean))].length} course(s) handled</div>
    `);

    if (!classEntries.length) {
      $("#myTimetableGrid").html('<div class="text-center text-muted py-4">No generated timetable is available for this faculty member and semester. Ask the administrator to generate the timetable from Workload / Timetable.</div>');
      return;
    }

    // Build hourly columns from scheduled entries, including lunch and lab periods.
    const boundariesSet = new Set([9 * 60, 13 * 60, 14 * 60, 17 * 60]);
    entries.forEach(item => {
      boundariesSet.add(toMinutes(item.startTime));
      boundariesSet.add(toMinutes(item.endTime));
    });
    const values = [...boundariesSet];
    const min = Math.floor(Math.min(...values) / 60) * 60;
    const max = Math.ceil(Math.max(...values) / 60) * 60;
    for (let minute = min; minute <= max; minute += 60) boundariesSet.add(minute);
    const boundaries = [...boundariesSet].sort((a, b) => a - b);
    const columns = boundaries.slice(0, -1).map((start, i) => ({ start, end: boundaries[i + 1] }));

    const header = `<thead><tr><th>Day</th>${columns.map(col => `<th>${escapeHTML(timeHeader(col))}</th>`).join("")}</tr></thead>`;
    const body = days.map(day => {
      const dayEntries = entries.filter(item => item.day === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      const cells = [];
      let i = 0;
      while (i < columns.length) {
        const column = columns[i];
        const item = dayEntries.find(entry => toMinutes(entry.startTime) === column.start);
        if (!item) {
          cells.push('<td class="faculty-empty-cell">—</td>');
          i++;
          continue;
        }
        const endIndex = boundaries.indexOf(toMinutes(item.endTime));
        const span = Math.max(1, endIndex - i);
        if (item.entryType === "break") {
          cells.push(`<td class="faculty-break-cell" colspan="${span}">${escapeHTML(item.label || "Lunch Break")}</td>`);
        } else {
          const courseCode = item.course?.courseCode || "";
          const courseName = item.course?.courseName || "Course";
          const label = `${courseCode}${courseCode && courseName ? " · " : ""}${courseName} (${item.classType || "theory"})`;
          cells.push(`<td class="${item.classType === "lab" ? "faculty-lab-cell" : "faculty-class-cell"}" colspan="${span}">${escapeHTML(label)}</td>`);
        }
        i += span;
      }
      return `<tr><td>${day}</td>${cells.join("")}</tr>`;
    }).join("");

    $("#myTimetableGrid").html(`<table><thead>${header.replace("<thead>", "").replace("</thead>", "")}</thead><tbody>${body}</tbody></table>`);
  }

  $("#refreshMyTimetable").on("click", async function () {
    const button = $(this);
    button.prop("disabled", true);
    try {
      await loadFacultyTimetable();
    } catch (error) {
      $("#myTimetableGrid").html(`<div class="text-center text-danger py-4">${escapeHTML(error.message)}</div>`);
    } finally {
      button.prop("disabled", false);
    }
  });

  $("#myTimetableSemester").on("change", async function () {
    try {
      await loadFacultyTimetable();
    } catch (error) {
      $("#myTimetableGrid").html(`<div class="text-center text-danger py-4">${escapeHTML(error.message)}</div>`);
    }
  });

  function updateAuthMode() {
    const admin = $("#loginRole").val() === "admin";
    $("#signupSwitch, #loginSwitch").toggleClass("d-none", admin);
    if (admin) {
      $("#loginForm").removeClass("d-none"); $("#signupForm").addClass("d-none");
      $("#authTitle").text("Admin Login"); $("#authSubtitle").text("Sign in with your administrator account.");
    } else {
      $("#authTitle").text($("#signupForm").hasClass("d-none") ? "Faculty Login" : "Faculty Sign Up");
      $("#authSubtitle").text("Faculty members must create an account before logging in.");
    }
    $("#authMessage").addClass("d-none");
  }
  $("#loginRole").on("change", updateAuthMode);
  $("#showSignup").on("click", function (e) {
    e.preventDefault(); $("#loginForm").addClass("d-none"); $("#signupForm").removeClass("d-none"); updateAuthMode();
  });
  $("#showLogin").on("click", function (e) {
    e.preventDefault(); $("#signupForm").addClass("d-none"); $("#loginForm").removeClass("d-none"); updateAuthMode();
  });
  $("#signupForm").on("submit", async function (e) {
    e.preventDefault();
    try {
      const result = await api("/api/auth/signup", "POST", {
        name: $("#signupName").val().trim(), employeeId: $("#signupEmployeeId").val().trim(),
        department: $("#signupDepartment").val().trim(), email: $("#signupEmail").val().trim(),
        password: $("#signupPassword").val()
      });
      const registeredEmail = $("#signupEmail").val().trim();
      this.reset(); $("#signupForm").addClass("d-none"); $("#loginForm").removeClass("d-none");
      $("#loginEmail").val(registeredEmail); authMessage(result.message, true); updateAuthMode();
    } catch (error) { authMessage(error.message); }
  });
  $("#loginForm").on("submit", async function (e) {
    e.preventDefault();
    try {
      const role = $("#loginRole").val();
      const result = await api("/api/auth/login", "POST", { role, email: $("#loginEmail").val().trim(), password: $("#loginPassword").val() });
      authMessage(result.message, true);
      updateUserAvatars(result.user?.email);
      if (role === "admin") showAdminPortal(); else await showFacultyPortal();
    } catch (error) { authMessage(error.message); }
  });
  async function logout() {
    try { await api("/api/auth/logout", "POST"); } catch (_) {}
    updateUserAvatars(null);
    $("#loginPassword, #signupPassword").val("");
    $("#signupForm").addClass("d-none"); $("#loginForm").removeClass("d-none");
    $("#loginRole").val("faculty"); updateAuthMode(); showLoginScreen();
  }
  $("#adminLogout, #facultyLogout").on("click", logout);
  $("#myWorkloadTable").on("click", ".update-my-hours", async function () {
    const id = $(this).attr("data-id");
    const current = Number($(this).attr("data-hours"));
    const value = prompt("Enter your classes per week (1–5):", current);
    if (value === null) return;
    const hours = Number(value);
    if (!Number.isInteger(hours) || hours < 1 || hours > 5) {
      alert("Please enter a whole number from 1 to 5.");
      return;
    }
    try {
      const result = await api("/api/faculty/me/workloads/" + encodeURIComponent(id), "PUT", { weeklyHours: hours });
      alert(result.message);
      await showFacultyPortal();
    } catch (error) { alert(error.message); }
  });

  async function initialize() {
    updateAuthMode();
    try {
      const result = await api("/api/auth/me");
      updateUserAvatars(result.user?.email);
      if (result.user.role === "admin") showAdminPortal();
      else await showFacultyPortal();
    } catch (_) {
      showLoginScreen();
    }
  }
  initialize();
});