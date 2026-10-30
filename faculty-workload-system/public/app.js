$(document).ready(function () {
  let facultyList = [];
  let courseList = [];

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
              <td>
                <button class="btn btn-sm btn-danger delete-workload"
                  data-id="${escapeHTML(w._id)}">Delete</button>
              </td>
            </tr>
          `).join("")
        : '<tr><td colspan="5" class="text-center">No workload assigned.</td></tr>'
    );
  }

  // Add workload assignment
  $("#workloadForm").on("submit", async function (event) {
    event.preventDefault();

    const data = {
      faculty: $("#workloadFaculty").val(),
      course: $("#workloadCourse").val(),
      semester: $("#semester").val().trim(),
      weeklyHours: Number($("#weeklyHours").val())
    };

    try {
      await api("/api/workloads", "POST", data);
      this.reset();
      await refreshAll();
      showMessage("Workload assigned successfully.");
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
      await api("/api/workloads/" + encodeURIComponent(id), "DELETE");
      await refreshAll();
      showMessage("Workload assignment deleted.");
    } catch (error) {
      showMessage(error.message, false);
    }
  });

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
    } catch (error) {
      showMessage(error.message, false);
    }
  }

  $("#refreshReport").on("click", loadReport);

  // Refresh all tables and dashboard numbers
  async function refreshAll() {
    await Promise.all([
      loadFaculty(),
      loadCourses(),
      loadWorkloads()
    ]);
  }

  // Initial page loading
  async function initialize() {
    await checkDatabase();

    try {
      await refreshAll();
    } catch (error) {
      showMessage(
        "Could not load project data. Check whether MongoDB is running. " +
        error.message,
        false
      );
    }
  }

  initialize();
});