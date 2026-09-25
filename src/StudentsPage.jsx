import React, { useEffect, useMemo, useRef, useState } from "react";
import logoUrl from "./assets/gurudock-logo.png";
import LibrarySidebar from "./LibrarySidebar";
import { studentsService } from "./services/studentsService";
import { contentService } from "./services/contentService";
import { readAvailableContentCache, writeAvailableContentCache } from "./availableContentCache";

const STUDENTS_CACHE_KEY = "gurudock_students_cache";

function getStudentsCacheKey() {
  const user = localStorage.getItem("user_email") || localStorage.getItem("user_name") || "authenticated";
  return `${STUDENTS_CACHE_KEY}:${user.toLowerCase()}`;
}

function readStudentsCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(getStudentsCacheKey()) || "null");
    if (
      !cached ||
      !Array.isArray(cached.students)
    ) {
      return null;
    }
    return cached.students;
  } catch {
    return null;
  }
}

function writeStudentsCache(students) {
  try {
    const key = getStudentsCacheKey();
    const cached = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({
      ...cached,
      cachedAt: Date.now(),
      students,
    }));
  } catch {
    // Caching is best effort; the API remains the source of truth.
  }
}

function readStudentDetailCache(studentId) {
  try {
    const cached = JSON.parse(localStorage.getItem(getStudentsCacheKey()) || "null");
    const detail = cached?.details?.[studentId];
    return detail && Array.isArray(detail.testHistory) ? detail : null;
  } catch {
    return null;
  }
}

function writeStudentDetailCache(student) {
  if (!student?.id) return;
  try {
    const key = getStudentsCacheKey();
    const cached = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({
      ...cached,
      cachedAt: Date.now(),
      details: {
        ...(cached.details || {}),
        [student.id]: student,
      },
    }));
  } catch {
    // Caching is best effort; the API remains the source of truth.
  }
}

function normalizeStudent(student) {
  const classLevel = String(student.class_level || "").replace(/^Class\s+/i, "").trim() || "—";
  const classSection = String(student.class_section || "").trim();
  const section = classSection.includes("-") ? classSection.split("-").pop().trim() : classSection || "—";
  return {
    id: student.id,
    name: student.name || "—",
    classLevel,
    section,
    rollNumber: String(student.roll_number ?? "—"),
    classSection,
  };
}

const emptyStudentForm = () => ({ name: "", className: "", section: "", roll: "" });

function extractAvailableClasses(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return [];
  const classes = Object.values(content).flatMap((boardContent) => (
    boardContent && typeof boardContent === "object" && !Array.isArray(boardContent)
      ? Object.keys(boardContent)
      : []
  ));
  return [...new Set(classes)]
    .map((value) => String(value).replace(/^Class\s+/i, "").trim())
    .filter(Boolean)
    .sort((first, second) => Number(first) - Number(second) || first.localeCompare(second));
}

function nextStudentForm(previousForm) {
  const previousRoll = String(previousForm?.roll || "").trim();
  const numericRoll = Number(previousRoll);
  const nextRoll = previousRoll && Number.isFinite(numericRoll) ? String(numericRoll + 1) : "";

  return {
    name: "",
    className: previousForm?.className || "",
    section: previousForm?.section || "",
    roll: nextRoll,
  };
}

function getApiError(data, fallback) {
  if (typeof data?.detail === "string" && data.detail.trim()) return data.detail;
  if (Array.isArray(data?.detail)) {
    return data.detail.map((item) => item?.msg || item?.message || String(item)).join(", ");
  }
  if (typeof data?.message === "string" && data.message.trim()) return data.message;
  return fallback;
}

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedClass, setSelectedClass] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [selected, setSelected] = useState(new Set());
  const [forms, setForms] = useState([emptyStudentForm()]);
  const [studentsSaving, setStudentsSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [studentDetailError, setStudentDetailError] = useState("");
  const [studentDeleting, setStudentDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [studentEditing, setStudentEditing] = useState(false);
  const [studentSaving, setStudentSaving] = useState(false);
  const [availableClasses, setAvailableClasses] = useState([]);
  const [studentEditForm, setStudentEditForm] = useState({ name: "", className: "", section: "", roll: "" });

  useEffect(() => {
    let active = true;
    const cachedStudents = readStudentsCache();

    if (cachedStudents) {
      setStudents(cachedStudents);
      setStudentsLoading(false);
    }

    const loadStudents = async () => {
      if (!cachedStudents) setStudentsLoading(true);
      setStudentsError("");
      try {
        const data = await studentsService.list();
        if (!Array.isArray(data)) throw new Error("Unable to load students.");
        if (active) {
          const nextStudents = data.map(normalizeStudent);
          setStudents(nextStudents);
          writeStudentsCache(nextStudents);
        }
      } catch (error) {
        if (active) {
          setStudentsError(cachedStudents
            ? "Unable to refresh students.Please check your internet connection."
            : error.message || "Unable to load students.");
        }
      } finally {
        if (active) setStudentsLoading(false);
      }
    };

    loadStudents();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const cachedContent = readAvailableContentCache();
    if (cachedContent) setAvailableClasses(extractAvailableClasses(cachedContent));
    const loadAvailableClasses = async () => {
      try {
        const data = await contentService.getAvailableContent({ signal: controller.signal });
        writeAvailableContentCache(data);
        setAvailableClasses(extractAvailableClasses(data));
      } catch (error) {
        if (error.name !== "AbortError") setAvailableClasses([]);
      }
    };
    loadAvailableClasses();
    return () => controller.abort();
  }, []);

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  };

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...students]
      .filter((student) =>
        (!selectedClass || student.classLevel === selectedClass) &&
        (!sectionFilter || student.section === sectionFilter) &&
        (!query || student.name.toLowerCase().includes(query) || student.rollNumber.toLowerCase().includes(query)),
      )
      .sort((a, b) => {
        if (sort === "roll") return a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true });
        if (sort === "class") return `${a.classLevel}${a.section}`.localeCompare(`${b.classLevel}${b.section}`);
        return a.name.localeCompare(b.name);
      });
  }, [search, sectionFilter, selectedClass, sort, students]);

  const activeCount = students.length;
  const classOptions = useMemo(
    () => [...new Set(students.map((student) => student.classLevel).filter((value) => value && value !== "—"))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [students],
  );
  const sectionOptions = useMemo(
    () => [...new Set(students.filter((student) => !selectedClass || student.classLevel === selectedClass).map((student) => student.section).filter((value) => value && value !== "—"))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [selectedClass, students],
  );

  useEffect(() => {
    if (!classOptions.length) {
      setSelectedClass("");
      return;
    }
    if (!classOptions.includes(selectedClass)) setSelectedClass(classOptions[0]);
  }, [classOptions, selectedClass]);

  useEffect(() => {
    if (!sectionOptions.length) {
      setSectionFilter("");
      return;
    }
    if (!sectionOptions.includes(sectionFilter)) setSectionFilter(sectionOptions[0]);
  }, [sectionFilter, sectionOptions]);

  const updateForm = (index, field, value) => setForms((current) => current.map((form, formIndex) => (
    formIndex === index ? { ...form, [field]: value } : form
  )));

  const addStudentRow = () => {
    setForms((current) => [...current, nextStudentForm(current[current.length - 1])]);
  };

  const addStudent = (event) => {
    event.preventDefault();
    if (forms.some((form) => !form.name.trim() || !form.className || !form.section || !form.roll.trim())) {
      showToast("Please fill all required fields");
      return;
    }
    const createStudents = async () => {
      setStudentsSaving(true);
      try {
        const studentPayloads = forms.map((form) => ({
            name: form.name.trim(),
            roll_number: form.roll.trim(),
            class_section: form.section,
            class_level: `Class ${form.className}`,
            board: "CBSE",
        }));
        const data = await studentsService.createBulk(studentPayloads);
        const refreshedStudents = await studentsService.list();
        if (!Array.isArray(refreshedStudents)) throw new Error("Students were saved, but the roster could not be refreshed.");
        const nextStudents = refreshedStudents.map(normalizeStudent);
        setStudents(nextStudents);
        writeStudentsCache(nextStudents);
        setForms([emptyStudentForm()]);
        setActiveTab("all");
        const createdCount = Number.isFinite(Number(data.created_count)) ? Number(data.created_count) : forms.length;
        showToast(`${createdCount} student${createdCount === 1 ? "" : "s"} added successfully`);
      } catch (error) {
        showToast(error.message || "Unable to add students.");
      } finally {
        setStudentsSaving(false);
      }
    };
    createStudents();
  };

  const toggleAll = (checked) => {
    setSelected(checked ? new Set(filteredStudents.map((student) => student.id)) : new Set());
  };

  const toggleStudent = (name) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const openStudentDetail = async (student) => {
    const cachedDetail = readStudentDetailCache(student.id);
    const initialDetail = cachedDetail || { ...student, testHistory: [] };
    setSelectedStudent(initialDetail);
    setStudentEditing(false);
    setStudentEditForm({
      name: student.name,
      className: student.classLevel,
      section: student.section,
      roll: student.rollNumber,
    });
    setStudentDetailLoading(!cachedDetail);
    setStudentDetailError("");
    try {
      const data = await studentsService.get(student.id);
      if (!data?.id) throw new Error("Unable to load student details.");
      const nextStudent = {
        ...normalizeStudent(data),
        board: data.board || "—",
        testHistory: Array.isArray(data.test_history) ? data.test_history : [],
      };
      setSelectedStudent(nextStudent);
      writeStudentDetailCache(nextStudent);
      setStudentEditForm({
        name: data.name || "",
        className: String(data.class_level || "").replace(/^Class\s+/i, "").trim(),
        section: normalizeStudent(data).section,
        roll: String(data.roll_number ?? ""),
      });
    } catch (error) {
      if (!cachedDetail) setStudentDetailError(error.message || "Unable to load student details.");
    } finally {
      setStudentDetailLoading(false);
    }
  };

  const saveStudent = async (event) => {
    event.preventDefault();
    if (!selectedStudent || studentSaving) return;
    if (!studentEditForm.name.trim() || !studentEditForm.className.trim() || !studentEditForm.section.trim() || !studentEditForm.roll.trim()) {
      showToast("Please fill all required fields");
      return;
    }

    setStudentSaving(true);
    try {
      const data = await studentsService.update(selectedStudent.id, {
          name: studentEditForm.name.trim(),
          roll_number: studentEditForm.roll.trim(),
          class_section: studentEditForm.section.trim(),
          class_level: `Class ${studentEditForm.className.trim()}`,
        });

      const updatedStudent = {
        ...selectedStudent,
        name: studentEditForm.name.trim(),
        classLevel: studentEditForm.className.trim().replace(/^Class\s+/i, ""),
        section: studentEditForm.section.trim(),
        rollNumber: studentEditForm.roll.trim(),
        classSection: studentEditForm.section.trim(),
      };
      setStudents((current) => {
        const nextStudents = current.map((student) => student.id === updatedStudent.id ? updatedStudent : student);
        writeStudentsCache(nextStudents);
        return nextStudents;
      });
      setSelectedStudent(updatedStudent);
      setStudentEditing(false);
      showToast(data.message || "Student details updated successfully");
    } catch (error) {
      showToast(error.message || "Unable to update student.");
    } finally {
      setStudentSaving(false);
    }
  };

  const deleteStudents = async (studentIds, label) => {
    if (!studentIds.length || studentDeleting) return;

    setStudentDeleting(true);
    try {
      const results = await Promise.all(studentIds.map(async (studentId) => {
        const data = await studentsService.delete(studentId);
        return {
          studentId,
          success: true,
          message: typeof data.detail === "string" ? data.detail : "",
        };
      }));
      const deletedIds = results.filter((result) => result.success).map((result) => result.studentId);
      const failedCount = results.length - deletedIds.length;
      if (!deletedIds.length) {
        throw new Error(results[0]?.message || "Unable to delete student.");
      }

      setStudents((current) => {
        const nextStudents = current.filter((student) => !deletedIds.includes(student.id));
        writeStudentsCache(nextStudents);
        return nextStudents;
      });
      setSelected((current) => {
        const next = new Set(current);
        deletedIds.forEach((studentId) => next.delete(studentId));
        return next;
      });
      if (selectedStudent && deletedIds.includes(selectedStudent.id)) setSelectedStudent(null);
      showToast(failedCount ? `${deletedIds.length} deleted; ${failedCount} failed` : `${deletedIds.length} student${deletedIds.length === 1 ? "" : "s"} deleted successfully`);
    } catch (error) {
      showToast(error.message || "Unable to delete student.");
    } finally {
      setStudentDeleting(false);
    }
  };

  const deleteStudent = () => {
    if (!selectedStudent) return;
    setDeleteConfirmation({ ids: [selectedStudent.id], label: selectedStudent.name });
  };

  const deleteSelectedStudents = () => {
    const selectedIds = [...selected];
    if (selectedIds.length) {
      setDeleteConfirmation({ ids: selectedIds, label: `${selectedIds.length} selected students` });
    }
  };

  const confirmDelete = () => {
    if (!deleteConfirmation) return;
    const confirmation = deleteConfirmation;
    setDeleteConfirmation(null);
    deleteStudents(confirmation.ids, confirmation.label);
  };

  return (
    <div className="students-app">
      <LibrarySidebar activeItem="students" />
      <main className="students-main">
        <header className="home-topbar">
          <div><span className="home-topbar-eyebrow">Teacher workspace</span><h1>Students</h1></div>
          <a className="home-mobile-brand" href="/home" aria-label="GuruDock home"><img src={logoUrl} alt="" /><strong>GuruDock</strong></a>
          <div className="home-topbar-user"><span className="home-avatar">M</span><strong>Ms</strong></div>
        </header>
        <section className="students-content">
          <div className="students-tabs">
            <button className={activeTab === "all" ? "active" : ""} type="button" onClick={() => setActiveTab("all")}>All Students</button>
            <button className={activeTab === "add" ? "active" : ""} type="button" onClick={() => setActiveTab("add")}>Add Student</button>
          </div>

          {activeTab === "all" ? (
            <>
              <div className="students-stats">
                <Stat icon="♟" label="Total Students" value={students.length} />
                <Stat icon="✓" label="Active Students" value={activeCount} />
                <Stat icon="♟" label="Classes Handled" value={new Set(students.map((student) => student.classLevel)).size} />
              </div>
              <div className="students-filters">
                <Filter label="Class"><StudentSelect value={selectedClass} onChange={(value) => { setSelectedClass(value); setSectionFilter(""); }} options={classOptions} ariaLabel="Filter by class" /></Filter>
                <Filter label="Section"><StudentSelect value={sectionFilter} onChange={setSectionFilter} options={sectionOptions} ariaLabel="Filter by section" /></Filter>
                <Filter label="Search"><div className="students-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or roll number..." /></div></Filter>
                <Filter label="Sort by"><StudentSelect value={sort} onChange={setSort} options={[{ value: "name", label: "Name (A–Z)" }, { value: "roll", label: "Roll Number" }]} ariaLabel="Sort students by" /></Filter>
              </div>
              {selected.size ? <div className="students-selection-bar"><strong>{selected.size} selected</strong><button className="student-list-delete" type="button" onClick={deleteSelectedStudents} disabled={studentDeleting}><TrashIcon />{studentDeleting ? "Deleting..." : "Delete selected"}</button></div> : null}
              {studentsError ? <div className="students-error">{studentsError}</div> : null}
              <div className="students-table-card">
                <div className="students-table-wrap"><table><thead><tr><th><input type="checkbox" checked={filteredStudents.length > 0 && filteredStudents.every((student) => selected.has(student.id))} onChange={(event) => toggleAll(event.target.checked)} /></th><th>Roll No.</th><th>Student Name</th><th>Class</th><th>Section</th><th>Actions</th></tr></thead>
                  <tbody>{studentsLoading ? <tr><td colSpan="6" className="students-loading">Loading students...</td></tr> : filteredStudents.map((student) => <tr key={student.id} role="button" tabIndex="0" onPointerUp={(event) => { if (!event.target.closest("button, input")) openStudentDetail(student); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openStudentDetail(student); } }}><td><input type="checkbox" checked={selected.has(student.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleStudent(student.id)} /></td><td>{student.rollNumber}</td><td className="student-name">{student.name}</td><td>{student.classLevel}</td><td>{student.section}</td><td><div className="student-row-actions"><button className="student-view" type="button" onClick={(event) => { event.stopPropagation(); openStudentDetail(student); }}>View</button><button className="student-icon-delete" type="button" onClick={(event) => { event.stopPropagation(); setDeleteConfirmation({ ids: [student.id], label: student.name }); }} disabled={studentDeleting} aria-label={`Delete ${student.name}`} title={`Delete ${student.name}`}><TrashIcon /></button></div></td></tr>)}</tbody>
                </table></div>
                <div className="students-footer">Showing {filteredStudents.length} of {students.length} students</div>
              </div>
            </>
          ) : (
            <form className="students-add-panel" onSubmit={addStudent}>
              <h2>Add students</h2><p>Enter one or more students and save them together to your class list.</p>
              <div className="students-form-rows">
                {forms.map((form, index) => (
                  <div className="students-form-row" key={index}>
                    <div className="students-form-row-number">{index + 1}</div>
                    <div className="students-form-grid">
                      <Field label="STUDENT NAME *"><input value={form.name} onChange={(event) => updateForm(index, "name", event.target.value)} placeholder="e.g. Aarav Sharma" /></Field>
                      <Field label="CLASS *"><StudentSelect value={form.className} onChange={(value) => updateForm(index, "className", value)} options={[{ value: "", label: "Select class" }, ...availableClasses]} ariaLabel="Select class" /></Field>
                      <Field label="SECTION *"><StudentSelect value={form.section} onChange={(value) => updateForm(index, "section", value)} options={[{ value: "", label: "Select section" }, ...["A", "B", "C", "D", "E"]]} ariaLabel="Select section" /></Field>
                      <Field label="ROLL NUMBER *"><input value={form.roll} onChange={(event) => updateForm(index, "roll", event.target.value)} placeholder="e.g. 12" /></Field>
                    </div>
                    {forms.length > 1 ? <button className="students-remove-row" type="button" onClick={() => setForms((current) => current.filter((_, formIndex) => formIndex !== index))} aria-label={`Remove student ${index + 1}`}>×</button> : null}
                  </div>
                ))}
              </div>
              <button className="students-add-row" type="button" onClick={addStudentRow}>+ Add another student</button>
              <div className="students-form-actions"><button className="students-secondary" type="button" onClick={() => setActiveTab("all")}>Cancel</button><button className="students-primary" type="submit" disabled={studentsSaving}>{studentsSaving ? "Saving..." : `Save ${forms.length} student${forms.length === 1 ? "" : "s"}`}</button></div>
            </form>
          )}
        </section>
      </main>
      {toast ? <div className="students-toast">{toast}</div> : null}
      {selectedStudent ? (
        <div className="student-detail-backdrop" role="presentation" onClick={() => setSelectedStudent(null)}>
          <section className="student-detail-panel" role="dialog" aria-modal="true" aria-labelledby="student-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="student-detail-header">
              <div><div className="students-eyebrow">STUDENT PROFILE</div><h2 id="student-detail-title">{selectedStudent.name}</h2></div>
              <button type="button" className="student-detail-close" onClick={() => setSelectedStudent(null)} aria-label="Close student details">×</button>
            </div>
            {studentDetailLoading ? <div className="student-detail-loading">Loading student details...</div> : studentDetailError ? <div className="students-error">{studentDetailError}</div> : studentEditing ? (
              <form className="student-edit-form" onSubmit={saveStudent}>
                <div className="student-edit-grid">
                  <Field label="STUDENT NAME *"><input value={studentEditForm.name} onChange={(event) => setStudentEditForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <Field label="CLASS *"><input value={studentEditForm.className} onChange={(event) => setStudentEditForm((current) => ({ ...current, className: event.target.value }))} placeholder="e.g. 10" /></Field>
                  <Field label="SECTION *"><input value={studentEditForm.section} onChange={(event) => setStudentEditForm((current) => ({ ...current, section: event.target.value }))} placeholder="e.g. A" /></Field>
                  <Field label="ROLL NUMBER *"><input value={studentEditForm.roll} onChange={(event) => setStudentEditForm((current) => ({ ...current, roll: event.target.value }))} /></Field>
                </div>
                <div className="student-detail-actions"><button className="students-secondary" type="button" onClick={() => setStudentEditing(false)}>Cancel</button><button className="students-primary" type="submit" disabled={studentSaving}>{studentSaving ? "Saving..." : "Save changes"}</button></div>
              </form>
            ) : (
              <>
                <div className="student-detail-meta"><div><span>Class</span><strong>{selectedStudent.classLevel} — {selectedStudent.section}</strong></div><div><span>Roll number</span><strong>{selectedStudent.rollNumber}</strong></div><div><span>Board</span><strong>{selectedStudent.board}</strong></div></div>
                <h3>Test history</h3>
                {selectedStudent.testHistory.length ? <div className="student-history"><table><thead><tr><th>Test</th><th>Subject</th><th>Date</th><th>Marks</th><th>Percentage</th><th>Remarks</th></tr></thead><tbody>{selectedStudent.testHistory.map((test) => <tr key={`${test.test_id}-${test.test_date}`}><td>{test.title}</td><td>{test.subject}</td><td>{test.test_date}</td><td>{test.is_absent ? "Absent" : `${test.marks_obtained} / ${test.max_marks}`}</td><td>{test.is_absent ? "—" : `${test.percentage}%`}</td><td>{test.remarks || "—"}</td></tr>)}</tbody></table></div> : <p className="student-detail-empty">No test records available for this student.</p>}
              </>
            )}
            {!studentEditing ? <div className="student-detail-actions"><button className="students-secondary" type="button" onClick={() => setStudentEditing(true)}>Edit Student</button><button className="student-delete-button" type="button" onClick={deleteStudent} disabled={studentDeleting}>{studentDeleting ? "Deleting..." : "Delete Student"}</button></div> : null}
          </section>
        </div>
      ) : null}
      {deleteConfirmation ? (
        <div className="student-warning-backdrop" role="presentation" onClick={() => setDeleteConfirmation(null)}>
          <section className="student-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="student-warning-title" onClick={(event) => event.stopPropagation()}>
            <div className="student-warning-icon" aria-hidden="true">!</div>
            <div>
              <h2 id="student-warning-title">Delete student{deleteConfirmation.ids.length > 1 ? "s" : ""}?</h2>
              <p>Are you sure you want to delete <strong>{deleteConfirmation.label}</strong>? This action cannot be undone.</p>
            </div>
            <div className="student-warning-actions">
              <button className="students-secondary" type="button" onClick={() => setDeleteConfirmation(null)}>Cancel</button>
              <button className="student-delete-confirm" type="button" onClick={confirmDelete}>Delete</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ icon, label, value }) {
  return <div className="students-stat"><div className="students-stat-icon">{icon}</div><div><div className="students-stat-label">{label}</div><div className="students-stat-number">{value}</div></div></div>;
}

function Filter({ label, children }) {
  return <div><label>{label}</label>{children}</div>;
}

function Field({ label, children }) {
  return <div><label>{label}</label>{React.isValidElement(children) && children.type === "input"
    ? React.cloneElement(children, { className: "students-form-control" })
    : children}</div>;
}

function StudentSelect({ value, onChange, options, ariaLabel }) {
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

  return (
    <div className={`students-select ${open ? "open" : ""}`} ref={rootRef}>
      <button type="button" className="students-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className={value ? "" : "placeholder"}>{selectedLabel || "Select an option"}</span>
        <span className="students-select-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="students-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const normalized = typeof option === "string" ? { value: option, label: option } : option;
            const isSelected = normalized.value === value;
            return <button type="button" role="option" aria-selected={isSelected} className={`students-select-option ${isSelected ? "selected" : ""}`} key={normalized.value || normalized.label} onClick={() => { onChange(normalized.value); setOpen(false); }}>{normalized.label}<span aria-hidden="true">{isSelected ? "✓" : ""}</span></button>;
          })}
        </div>
      ) : null}
    </div>
  );
}

function TrashIcon() {
  return <svg className="trash-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>;
}
