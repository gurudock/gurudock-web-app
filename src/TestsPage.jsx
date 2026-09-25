import React, { useEffect, useRef, useState } from "react";
import logoUrl from "./assets/gurudock-logo.png";
import LibrarySidebar from "./LibrarySidebar";
import { studentsService } from "./services/studentsService";
import { testsService } from "./services/testsService";

const today = new Date().toISOString().slice(0, 10);
const TESTS_CACHE_KEY = "gurudock_tests_cache";
const TEST_STUDENTS_CACHE_KEY = "gurudock_test_students_cache";

function getUserCacheKey(key) {
  const user = localStorage.getItem("user_email") || localStorage.getItem("user_name") || "authenticated";
  return `${key}:${user.toLowerCase()}`;
}

function readCache(key, property) {
  try {
    const cached = JSON.parse(localStorage.getItem(getUserCacheKey(key)) || "null");
    if (!cached || !Array.isArray(cached[property])) return null;
    return cached[property];
  } catch {
    return null;
  }
}

function writeCache(key, property, value) {
  try {
    localStorage.setItem(getUserCacheKey(key), JSON.stringify({ cachedAt: Date.now(), [property]: value }));
  } catch {
    // Caching is best effort; the API remains the source of truth.
  }
}

const subjectOptions = [
  "Mathematics",
  "Science",
  "English",
  "Hindi",
  "Social Science",
  "Computer Science",
  "Sanskrit",
];

const normalizeClassLevel = (value) => String(value || "")
  .replace(/^Class\s+/i, "")
  .replace(/\s+/g, "")
  .trim()
  .toLowerCase();

const normalizeSection = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  const parts = normalized.split(/[-_/,\s]+/).filter(Boolean);
  return (parts[parts.length - 1] || "").replace(/^section/i, "");
};

const studentMatchesTest = (student, test) =>
  normalizeClassLevel(student.class_level) === normalizeClassLevel(test.class_level) &&
  normalizeSection(student.class_section) === normalizeSection(test.class_section);

export default function TestsPage() {
  const [form, setForm] = useState({
    title: "",
    subject: "",
    classLevel: "10",
    section: "A",
    maxMarks: "",
    testDate: today,
  });
  const [createdTests, setCreatedTests] = useState([]);
  const [testsLoading, setTestsLoading] = useState(true);
  const [testsError, setTestsError] = useState("");
  const [testDetail, setTestDetail] = useState(null);
  const [testDetailInitialMarks, setTestDetailInitialMarks] = useState({});
  const [testDetailLoading, setTestDetailLoading] = useState(false);
  const [testDetailSaving, setTestDetailSaving] = useState(false);
  const [testDeleteConfirmation, setTestDeleteConfirmation] = useState(null);
  const [testDeleting, setTestDeleting] = useState(false);
  const [marksWarning, setMarksWarning] = useState("");
  const [activeTest, setActiveTest] = useState(null);
  const [testStudents, setTestStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [marksSaving, setMarksSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const loadStudentsForTest = async (test) => {
    const cachedStudents = readCache(TEST_STUDENTS_CACHE_KEY, "students");
    try {
      const data = await studentsService.list();
      if (!Array.isArray(data)) throw new Error("Unable to load students for this test.");
      writeCache(TEST_STUDENTS_CACHE_KEY, "students", data);
      return data.filter((student) => studentMatchesTest(student, test));
    } catch (error) {
      if (cachedStudents) return cachedStudents.filter((student) => studentMatchesTest(student, test));
      throw error;
    }
  };

  useEffect(() => {
    let active = true;
    const cachedTests = readCache(TESTS_CACHE_KEY, "tests");
    if (cachedTests) {
      setCreatedTests(cachedTests);
      setTestsLoading(false);
    }
    const loadTests = async () => {
      if (!cachedTests) setTestsLoading(true);
      setTestsError("");
      try {
        const data = await testsService.list();
        if (!Array.isArray(data)) throw new Error("Unable to load tests.");
        if (active) {
          setCreatedTests(data);
          writeCache(TESTS_CACHE_KEY, "tests", data);
        }
      } catch (error) {
        if (active) setTestsError(cachedTests ? "Unable to refresh tests." : error.message || "Unable to load tests.");
      } finally {
        if (active) setTestsLoading(false);
      }
    };
    loadTests();
    return () => { active = false; };
  }, []);

  const openTestDetail = async (test) => {
    setTestDetailLoading(true);
    setTestDetail({ ...test, marks: [] });
    try {
      const [detailResponse, studentsResponse] = await Promise.all([
        testsService.get(test.id),
        loadStudentsForTest(test),
      ]);
      const data = detailResponse;
      const studentsData = studentsResponse;
      if (!data?.id) throw new Error("Unable to load test details.");
      if (!Array.isArray(studentsData)) {
        throw new Error(typeof studentsData.detail === "string" ? studentsData.detail : "Unable to load students for this test.");
      }
      const existingMarks = new Map((Array.isArray(data.marks) ? data.marks : []).map((entry) => [entry.student_id, entry]));
      const allStudentMarks = studentsData.map((student) => {
        const existing = existingMarks.get(student.id);
        return existing || {
          entry_id: `pending-${student.id}`,
          student_id: student.id,
          student_name: student.name,
          roll_number: student.roll_number,
          marks_obtained: 0,
          is_absent: false,
          remarks: "",
        };
      });
      setTestDetail({ ...data, marks: allStudentMarks });
      setTestDetailInitialMarks(Object.fromEntries(allStudentMarks.map((entry) => [
        entry.student_id,
        {
          marks_obtained: Number(entry.marks_obtained || 0),
          is_absent: Boolean(entry.is_absent),
          remarks: entry.remarks?.trim() || "",
        },
      ])));
    } catch (error) {
      setTestsError(error.message || "Unable to load test details.");
    } finally {
      setTestDetailLoading(false);
    }
  };

  const deleteTest = async () => {
    if (!testDeleteConfirmation || testDeleting) return;
    setTestDeleting(true);
    try {
      const data = await testsService.delete(testDeleteConfirmation.id);
      setCreatedTests((current) => {
        const nextTests = current.filter((test) => test.id !== testDeleteConfirmation.id);
        writeCache(TESTS_CACHE_KEY, "tests", nextTests);
        return nextTests;
      });
      if (activeTest?.id === testDeleteConfirmation.id) setActiveTest(null);
      setTestDetail(null);
      setTestDeleteConfirmation(null);
      setMessage({ type: "success", text: data.message || "Test deleted successfully." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Unable to delete test." });
    } finally {
      setTestDeleting(false);
    }
  };

  const updateTestDetailMark = (studentId, field, value) => {
    setTestDetail((current) => ({
      ...current,
      marks: current.marks.map((entry) => entry.student_id === studentId
        ? { ...entry, [field]: value }
        : entry),
    }));
  };

  const saveTestDetailMarks = async () => {
    if (!testDetail || testDetailSaving || !Array.isArray(testDetail.marks)) return;
    const invalidMarks = testDetail.marks.filter((entry) =>
      !entry.is_absent &&
      (Number(entry.marks_obtained) < 0 || Number(entry.marks_obtained) > Number(testDetail.max_marks)),
    );
    if (invalidMarks.length) {
      setMarksWarning(`Marks cannot be greater than ${testDetail.max_marks}. Please correct the highlighted entries.`);
      return;
    }
    setTestDetailSaving(true);
    try {
      const payload = testDetail.marks.map((entry) => ({
        student_id: entry.student_id,
        marks_obtained: entry.is_absent ? 0 : Number(entry.marks_obtained || 0),
        is_absent: Boolean(entry.is_absent),
        remarks: entry.remarks?.trim() || null,
      }));
      await testsService.saveMarks(testDetail.id, payload);
      const changedCount = testDetail.marks.filter((entry) => {
        const initial = testDetailInitialMarks[entry.student_id] || {
          marks_obtained: 0,
          is_absent: false,
          remarks: "",
        };
        return Number(entry.marks_obtained || 0) !== initial.marks_obtained
          || Boolean(entry.is_absent) !== initial.is_absent
          || (entry.remarks?.trim() || "") !== initial.remarks;
      }).length;
      setMessage({ type: "success", text: `${changedCount} student${changedCount === 1 ? "" : "s"} updated successfully.` });
      setTestDetail(null);
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Unable to save marks." });
    } finally {
      setTestDetailSaving(false);
    }
  };

  const loadTestStudents = async (test) => {
    setActiveTest(test);
    setStudentsLoading(true);
    setMessage(null);
    try {
      const data = await loadStudentsForTest(test);
      let nextStudents = data.map((student) => ({
        id: student.id,
        name: student.name,
        rollNumber: String(student.roll_number ?? "—"),
      }));
      setTestStudents(nextStudents);
      setMarks(Object.fromEntries(nextStudents.map((student) => [student.id, { marks: "", isAbsent: false, remarks: "" }])));
    } catch (error) {
      setTestStudents([]);
      setMessage({ type: "error", text: error.message || "Unable to load students for this test." });
    } finally {
      setStudentsLoading(false);
    }
  };

  const createTest = async (event) => {
    event.preventDefault();
    setMessage(null);
    if (!form.title.trim() || !form.subject.trim() || !form.maxMarks || !form.testDate) {
      setMessage({ type: "error", text: "Please complete all required fields." });
      return;
    }

    setSaving(true);
    try {
      const data = await testsService.create({
          title: form.title.trim(),
          subject: form.subject.trim(),
          class_section: form.section,
          class_level: `Class ${form.classLevel}`,
          max_marks: Number(form.maxMarks),
          test_date: form.testDate,
        });
      if (!data?.id) throw new Error("Unable to create test.");
      setCreatedTests((current) => {
        const nextTests = [data, ...current];
        writeCache(TESTS_CACHE_KEY, "tests", nextTests);
        return nextTests;
      });
      setForm((current) => ({ ...current, title: "", maxMarks: "" }));
      setMessage({ type: "success", text: "Test created successfully." });
      await loadTestStudents(data);
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Unable to create test." });
    } finally {
      setSaving(false);
    }
  };

  const updateMark = (studentId, field, value) => {
    setMarks((current) => ({
      ...current,
      [studentId]: { ...current[studentId], [field]: value },
    }));
  };

  const saveMarks = async (event) => {
    event.preventDefault();
    if (!activeTest || marksSaving) return;
    const invalidMarks = testStudents.filter((student) => {
      const entry = marks[student.id];
      return !entry?.isAbsent && (Number(entry?.marks) < 0 || Number(entry?.marks) > Number(activeTest.max_marks));
    });
    if (invalidMarks.length) {
      setMarksWarning(`Marks cannot be greater than ${activeTest.max_marks}. Check: ${invalidMarks.map((student) => student.name).join(", ")}`);
      return;
    }
    setMarksSaving(true);
    setMessage(null);
    try {
      const payload = testStudents.map((student) => ({
        student_id: student.id,
        marks_obtained: marks[student.id]?.isAbsent ? 0 : Number(marks[student.id]?.marks || 0),
        is_absent: Boolean(marks[student.id]?.isAbsent),
        remarks: marks[student.id]?.remarks?.trim() || null,
      }));
      await testsService.saveMarks(activeTest.id, payload);
      const changedCount = testStudents.filter((student) => {
        const entry = marks[student.id];
        return Boolean(entry?.isAbsent)
          || String(entry?.marks || "").trim() !== ""
          || Boolean(entry?.remarks?.trim());
      }).length;
      setMessage({ type: "success", text: `${changedCount} student${changedCount === 1 ? "" : "s"} updated successfully.` });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Unable to save marks." });
    } finally {
      setMarksSaving(false);
    }
  };

  return (
    <div className="students-app tests-app">
      <LibrarySidebar activeItem="tests" />
      <main className="students-main">
        <header className="home-topbar">
          <div><span className="home-topbar-eyebrow">Teacher workspace</span><h1>Create Test</h1></div>
          <a className="home-mobile-brand" href="/home" aria-label="GuruDock home"><img src={logoUrl} alt="" /><strong>GuruDock</strong></a>
          <div className="home-topbar-user"><span className="home-avatar">M</span><strong>Ms</strong></div>
        </header>
        <section className="students-content">
          <div className="tests-intro"><div><div className="students-eyebrow">ASSESSMENT</div><h2>Set up a test</h2><p>Create a test record for a class so marks can be entered and tracked later.</p></div></div>
          <form className="tests-form" onSubmit={createTest}>
            <div className="tests-form-grid">
              <TestField label="TEST TITLE *"><input value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder="e.g. Mathematics Unit Test 1" /></TestField>
              <TestField label="SUBJECT *"><TestThemedSelect value={form.subject} onChange={(value) => updateField("subject", value)} options={[{ value: "", label: "Select subject" }, ...subjectOptions]} ariaLabel="Select subject" /></TestField>
              <TestField label="CLASS *"><TestThemedSelect value={form.classLevel} onChange={(value) => updateField("classLevel", value)} options={["6", "7", "8", "9", "10", "11", "12"]} ariaLabel="Select class" /></TestField>
              <TestField label="SECTION *"><TestThemedSelect value={form.section} onChange={(value) => updateField("section", value)} options={["A", "B", "C", "D", "E", "F", "G"]} ariaLabel="Select section" /></TestField>
              <TestField label="MAXIMUM MARKS *"><input type="number" min="1" step="any" value={form.maxMarks} onChange={(event) => updateField("maxMarks", event.target.value)} placeholder="e.g. 50" /></TestField>
              <TestField label="TEST DATE *"><TestDatePicker value={form.testDate} onChange={(value) => updateField("testDate", value)} /></TestField>
            </div>
            {message ? <div className={`tests-message ${message.type}`}>{message.text}</div> : null}
            <div className="tests-form-actions"><button className="students-primary" type="submit" disabled={saving}>{saving ? "Creating..." : "Create test"}</button></div>
          </form>

          <section className="tests-created"><div className="tests-list-heading"><div><h2>Tests</h2><p>Review assessments and manage student marks.</p></div><span className="tests-count">{createdTests.length} {createdTests.length === 1 ? "test" : "tests"}</span></div>{testsError ? <div className="tests-message error">{testsError}</div> : null}{testsLoading ? <div className="tests-students-loading">Loading tests...</div> : createdTests.length ? <div className="tests-list-shell"><div className="tests-list-columns" aria-hidden="true"><span>Assessment</span><span>Class & subject</span><span>Date & marks</span><span>Actions</span></div><div className="tests-created-list">{createdTests.map((test) => <article className="tests-created-card" key={test.id} role="button" tabIndex="0" onClick={() => openTestDetail(test)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openTestDetail(test); } }}><div className="tests-list-title"><span className="tests-list-icon">✓</span><strong>{test.title}</strong></div><span>{test.class_level} — Section {test.class_section} · {test.subject}</span><small>{test.test_date} · Maximum {test.max_marks} marks</small><div className="tests-card-actions"><button className="students-secondary" type="button" onClick={(event) => { event.stopPropagation(); openTestDetail(test); }}>View details</button><button className="student-icon-delete" type="button" onClick={(event) => { event.stopPropagation(); setTestDeleteConfirmation(test); }} aria-label={`Delete ${test.title}`} title={`Delete ${test.title}`}><TrashIcon /></button></div></article>)}</div></div> : <div className="tests-students-empty">No tests created yet.</div>}</section>
          {activeTest ? <div className="student-detail-backdrop" role="presentation" onClick={() => setActiveTest(null)}>
            <section className="student-detail-panel tests-marks-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="student-detail-header"><div><div className="students-eyebrow">MARKS ENTRY</div><h2>{activeTest.title}</h2><p className="tests-detail-summary">{activeTest.class_level} — {activeTest.class_section} · {activeTest.subject} · Maximum {activeTest.max_marks} marks</p></div><button type="button" className="student-detail-close" onClick={() => setActiveTest(null)}>×</button></div>
            <div className="tests-popup-body">{studentsLoading ? <div className="tests-students-loading">Loading students for this test...</div> : testStudents.length ? (
              <form id="test-marks-form" onSubmit={saveMarks}>
                <div className="tests-marks-table-wrap"><table className="tests-marks-table"><thead><tr><th>#</th><th>Student</th><th>Roll No.</th><th>Marks obtained</th><th>Attendance</th><th>Remarks</th></tr></thead><tbody>{testStudents.map((student, index) => <tr key={student.id}><td>{index + 1}</td><td><strong>{student.name}</strong></td><td>{student.rollNumber}</td><td><input type="number" min="0" step="any" value={marks[student.id]?.marks || ""} disabled={marks[student.id]?.isAbsent} onChange={(event) => updateMark(student.id, "marks", event.target.value)} placeholder="0" /></td><td><button type="button" className={`tests-absent-toggle${marks[student.id]?.isAbsent ? " selected" : ""}`} aria-pressed={Boolean(marks[student.id]?.isAbsent)} onClick={() => updateMark(student.id, "isAbsent", !marks[student.id]?.isAbsent)}>{marks[student.id]?.isAbsent ? "Absent" : "Present"}</button></td><td><input className="tests-remark-input" value={marks[student.id]?.remarks || ""} onChange={(event) => updateMark(student.id, "remarks", event.target.value)} placeholder="Optional remark" /></td></tr>)}</tbody></table></div>
              </form>
            ) : <div className="tests-students-empty">No students found for this class and section.</div>}</div>
            {testStudents.length && !studentsLoading ? <div className="tests-marks-actions"><button className="students-primary" form="test-marks-form" type="submit" disabled={marksSaving}>{marksSaving ? "Saving marks..." : "Save marks"}</button></div> : null}
            </section>
          </div> : null}
          {testDetail ? <div className="student-detail-backdrop" role="presentation" onClick={() => setTestDetail(null)}><section className="student-detail-panel tests-detail-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="student-detail-header"><div><div className="students-eyebrow">TEST DETAILS</div><h2>{testDetail.title}</h2></div><button type="button" className="student-detail-close" onClick={() => setTestDetail(null)}>×</button></div><div className="tests-popup-body">{testDetailLoading ? <div className="student-detail-loading">Loading test details...</div> : <><div className="student-detail-meta"><div><span>Class</span><strong>{testDetail.class_level} — {testDetail.class_section}</strong></div><div><span>Subject</span><strong>{testDetail.subject}</strong></div><div><span>Average</span><strong>{testDetail.class_average} / {testDetail.max_marks}</strong></div></div><p className="tests-detail-summary">{testDetail.marks?.length || 0} students · {testDetail.total_appeared || 0} appeared · {testDetail.total_absent || 0} absent · {testDetail.test_date}</p>{testDetail.marks?.length ? <div className="student-history tests-detail-history"><table><thead><tr><th>Student</th><th>Roll No.</th><th>Marks</th><th>Attendance</th><th>Remarks</th></tr></thead><tbody>{testDetail.marks.map((entry) => <tr key={entry.student_id}><td>{entry.student_name}</td><td>{entry.roll_number}</td><td><input className="tests-detail-mark-input" type="number" min="0" step="any" value={entry.marks_obtained ?? 0} disabled={entry.is_absent} onChange={(event) => updateTestDetailMark(entry.student_id, "marks_obtained", event.target.value)} /></td><td><button type="button" className={`tests-absent-toggle${entry.is_absent ? " selected" : ""}`} aria-pressed={Boolean(entry.is_absent)} onClick={() => updateTestDetailMark(entry.student_id, "is_absent", !entry.is_absent)}>{entry.is_absent ? "Absent" : "Present"}</button></td><td><input className="tests-detail-remark-input" value={entry.remarks || ""} onChange={(event) => updateTestDetailMark(entry.student_id, "remarks", event.target.value)} placeholder="Optional remark" /></td></tr>)}</tbody></table></div> : <p className="student-detail-empty">No students found for this class and section.</p>}</>}</div><div className="tests-marks-actions"><button className="students-primary" type="button" onClick={saveTestDetailMarks} disabled={testDetailSaving || !testDetail.marks?.length}>{testDetailSaving ? "Saving marks..." : "Save marks"}</button></div></section></div> : null}
          {testDeleteConfirmation ? <div className="student-warning-backdrop" role="presentation" onClick={() => setTestDeleteConfirmation(null)}><section className="student-warning-modal" role="alertdialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="student-warning-icon">!</div><div><h2>Delete test?</h2><p>Delete <strong>{testDeleteConfirmation.title}</strong>? This action cannot be undone.</p></div><div className="student-warning-actions"><button className="students-secondary" type="button" onClick={() => setTestDeleteConfirmation(null)}>Cancel</button><button className="student-delete-confirm" type="button" onClick={deleteTest} disabled={testDeleting}>{testDeleting ? "Deleting..." : "Delete"}</button></div></section></div> : null}
          {marksWarning ? <div className="student-warning-backdrop" role="presentation" onClick={() => setMarksWarning("")}><section className="student-warning-modal" role="alertdialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="student-warning-icon">!</div><div><h2>Invalid marks</h2><p>{marksWarning}</p></div><div className="student-warning-actions"><button className="student-delete-confirm" type="button" onClick={() => setMarksWarning("")}>Okay</button></div></section></div> : null}
        </section>
      </main>
    </div>
  );
}

function TestField({ label, children }) {
  return <label className="tests-field"><span>{label}</span>{children}</label>;
}

function TrashIcon() {
  return <svg className="trash-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>;
}

function TestDatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState("bottom");
  const [month, setMonth] = useState(() => {
    const date = parseDate(value);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const rootRef = useRef(null);
  const selectedDate = parseDate(value);
  const monthLabel = month.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day > 0 && day <= daysInMonth ? new Date(month.getFullYear(), month.getMonth(), day) : null;
  });

  useEffect(() => {
    if (!open) return undefined;
    const updatePlacement = () => {
      const trigger = rootRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const calendarHeight = 310;
      setPlacement(window.innerHeight - trigger.bottom < calendarHeight && trigger.top > window.innerHeight - trigger.bottom ? "top" : "bottom");
    };
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open]);

  const selectDate = (date) => {
    if (!date) return;
    onChange(formatDate(date));
    setOpen(false);
  };

  return <div className={`test-date-picker ${open ? "open" : ""}`} ref={rootRef}>
    <button type="button" className="test-date-trigger" aria-label="Select test date" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span>{selectedDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
      <span className="test-date-icon" aria-hidden="true">□</span>
    </button>
    {open ? <div className={`test-calendar ${placement}`} role="dialog" aria-label="Test date calendar">
      <div className="test-calendar-header">
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
        <strong>{monthLabel}</strong>
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button>
      </div>
      <div className="test-calendar-weekdays">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="test-calendar-days">
        {days.map((date, index) => {
          const selected = date && formatDate(date) === value;
          return date ? <button type="button" className={selected ? "selected" : ""} key={formatDate(date)} onClick={() => selectDate(date)} aria-label={date.toDateString()} aria-pressed={selected}>{date.getDate()}</button> : <span key={`empty-${index}`} />;
        })}
      </div>
      <button type="button" className="test-calendar-today" onClick={() => selectDate(new Date())}>Today</button>
    </div> : null}
  </div>;
}

function parseDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
}

function formatDate(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function TestThemedSelect({ value, onChange, options, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => (typeof option === "string" ? option : option.value) === value);
  const selectedLabel = typeof selected === "string" ? selected : selected?.label;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className={`briefing-themed-select ${open ? "open" : ""}`} ref={rootRef}>
    <button type="button" className="briefing-themed-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className={value ? "" : "placeholder"}>{selectedLabel || "Select an option"}</span>
      <span className="briefing-themed-select-chevron" aria-hidden="true" />
    </button>
    {open && <div className="briefing-themed-select-menu" role="listbox" aria-label={ariaLabel}>{options.map((option) => {
      const normalized = typeof option === "string" ? { value: option, label: option } : option;
      const isSelected = normalized.value === value;
      return <button type="button" role="option" aria-selected={isSelected} className={`briefing-themed-select-option ${isSelected ? "selected" : ""}`} key={normalized.value || normalized.label} onClick={() => { onChange(normalized.value); setOpen(false); }}>{normalized.label}<span aria-hidden="true">{isSelected ? "✓" : ""}</span></button>;
    })}</div>}
  </div>;
}
