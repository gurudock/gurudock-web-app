import React, { useEffect, useMemo, useState } from "react";
import logoUrl from "./assets/gurudock-logo.png";
import LibrarySidebar from "./LibrarySidebar";
import { readAvailableContentCache, writeAvailableContentCache } from "./availableContentCache";
import { contentService } from "./services/contentService";
import { timetableService } from "./services/timetableService";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PERIODS = [
  ["P1", "8:00–8:40"],
  ["P2", "8:40–9:20"],
  ["P3", "9:20–10:00"],
  ["P4", "10:00–10:40"],
  ["P5", "10:40–11:20"],
  ["P6", "11:20–12:00"],
  ["P7", "12:00–12:40"],
  ["P8", "12:40–1:20"],
  ["P9", "1:50–2:30"],
  ["P10", "2:30–3:10"],
];
const TIMETABLE_CACHE_KEY = "gurudock_timetable_cache";

function getTimetableCacheKey() {
  const user = localStorage.getItem("user_email") || localStorage.getItem("user_name") || "authenticated";
  return `${TIMETABLE_CACHE_KEY}:${user.toLowerCase()}`;
}

function readTimetableCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(getTimetableCacheKey()) || "null");
    if (
      !cached ||
      !Array.isArray(cached.entries) ||
      !Array.isArray(cached.groups)
    ) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function writeTimetableCache(entries, groups) {
  try {
    localStorage.setItem(getTimetableCacheKey(), JSON.stringify({
      cachedAt: Date.now(),
      entries,
      groups,
    }));
  } catch {
    // Caching is best effort; the API remains the source of truth.
  }
}

function getOccupiedPeriods(groups, key) {
  return groups.some((group) => group.periods.includes(key));
}

function formatPeriodTime(entry) {
  if (entry.start_time && entry.end_time) return `${entry.start_time}–${entry.end_time}`;
  return PERIODS.find(([period]) => period === `P${entry.period_number}`)?.[1] || "";
}

function getEntryClassLabel(entry) {
  if (!entry.classSection || entry.className.includes("—")) return entry.className;
  const section = entry.classSection.includes("-")
    ? entry.classSection.split("-").pop()
    : entry.classSection;
  return `${entry.className} — ${section}`;
}

function hasRoom(entry) {
  return entry.room && entry.room.trim().toUpperCase() !== "N/A" && entry.room.trim() !== "—";
}

function getCompactClassLabel(value) {
  return value.replace(/^Class\s+/i, "");
}

export default function TimetablePage() {
  const [userName, setUserName] = useState(() => localStorage.getItem("user_name") || "Teacher");
  const [activeTab, setActiveTab] = useState("view");
  const [selected, setSelected] = useState(() => new Set());
  const [groups, setGroups] = useState([]);
  const [savedEntries, setSavedEntries] = useState([]);
  const [className, setClassName] = useState("Class 6");
  const [section, setSection] = useState("A");
  const [subject, setSubject] = useState("Mathematics");
  const [room, setRoom] = useState("");
  const [curriculum, setCurriculum] = useState({});
  const [curriculumBoard, setCurriculumBoard] = useState("CBSE");
  const [curriculumLoading, setCurriculumLoading] = useState(true);
  const [toastText, setToastText] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingTimetable, setLoadingTimetable] = useState(true);
  const [extractingTimetable, setExtractingTimetable] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [clearRequested, setClearRequested] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  useEffect(() => {
    const syncUser = () => setUserName(localStorage.getItem("user_name") || "Teacher");
    window.addEventListener("auth-changed", syncUser);
    return () => window.removeEventListener("auth-changed", syncUser);
  }, []);

  useEffect(() => {
    if (!selectedPeriod) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedPeriod(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedPeriod]);

  useEffect(() => {
    const controller = new AbortController();
    const cachedCurriculum = readAvailableContentCache();
    if (cachedCurriculum) {
      const board = Object.prototype.hasOwnProperty.call(cachedCurriculum, "CBSE")
        ? "CBSE"
        : Object.keys(cachedCurriculum)[0] || "CBSE";
      const grades = Object.keys(cachedCurriculum[board] || {}).sort((a, b) => Number(a) - Number(b));
      const nextClass = grades.includes(className.replace(/^Class\s+/i, ""))
        ? className
        : grades[0] ? `Class ${grades[0]}` : "";
      const subjects = cachedCurriculum[board]?.[nextClass.replace(/^Class\s+/i, "")] || [];
      setCurriculum(cachedCurriculum);
      setCurriculumBoard(board);
      setClassName(nextClass);
      setSubject(subjects[0] || "");
      setCurriculumLoading(false);
    }

    const loadCurriculum = async () => {
      try {
        const data = await contentService.getAvailableContent({ signal: controller.signal });
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Unable to load curriculum.");

        const board = Object.prototype.hasOwnProperty.call(data, "CBSE")
          ? "CBSE"
          : Object.keys(data)[0] || "CBSE";
        const grades = Object.keys(data[board] || {}).sort((a, b) => Number(a) - Number(b));
        const nextClass = grades.includes(className.replace(/^Class\s+/i, ""))
          ? className
          : grades[0]
            ? `Class ${grades[0]}`
            : "";
        const subjects = data[board]?.[nextClass.replace(/^Class\s+/i, "")] || [];

        setCurriculum(data);
        writeAvailableContentCache(data);
        setCurriculumBoard(board);
        setClassName(nextClass);
        setSubject(subjects[0] || "");
      } catch (error) {
        if (error.name !== "AbortError") showToast(error.message || "Unable to load curriculum.");
      } finally {
        setCurriculumLoading(false);
      }
    };

    loadCurriculum();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    const cachedTimetable = readTimetableCache();

    if (cachedTimetable) {
      setSavedEntries(cachedTimetable.entries);
      setGroups(cachedTimetable.groups);
      setLoadingTimetable(false);
    }

    const loadTimetable = async () => {
      try {
        const data = await timetableService.list();
        if (!Array.isArray(data)) throw new Error("Unable to load the timetable.");

        const nextEntries = data
          .filter((entry) => entry && entry.day_of_week && Number(entry.period_number))
          .map((entry) => ({
            id: entry.id,
            day: entry.day_of_week,
            period: `P${entry.period_number}`,
            periodTime: formatPeriodTime(entry),
            className: entry.class_level || "Class —",
            classSection: entry.class_section || "",
            subject: entry.subject || "—",
            room: entry.room || "—",
          }));

        const grouped = new Map();
        nextEntries.forEach((entry) => {
          const groupKey = `${entry.classSection}|${entry.className}|${entry.subject}|${entry.room}`;
          const existing = grouped.get(groupKey);
          if (existing) {
            existing.periods.push(`${entry.day}|${entry.period}`);
          } else {
            grouped.set(groupKey, {
              id: `backend-${groupKey}`,
              className: entry.classSection ? `${entry.className} — ${entry.classSection.split("-").pop()}` : entry.className,
              classLevel: entry.className.replace(/^Class\s+/i, "").trim(),
              classSection: entry.classSection,
              subject: entry.subject,
              room: entry.room,
              periods: [`${entry.day}|${entry.period}`],
            });
          }
        });

        if (active) {
          setSavedEntries(nextEntries);
          setGroups(Array.from(grouped.values()));
          setHasUnsavedChanges(false);
          writeTimetableCache(nextEntries, Array.from(grouped.values()));
        }
      } catch (error) {
        if (active) {
          showToast(cachedTimetable
            ? "Unable to refresh the timetable."
            : error.message || "Unable to load the timetable.");
        }
      } finally {
        if (active) setLoadingTimetable(false);
      }
    };

    loadTimetable();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const warnBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const warnBeforeInternalNavigation = (event) => {
      if (!hasUnsavedChanges) return;
      const link = event.target.closest("a");
      if (!link || link.target === "_blank") return;
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation(`${url.pathname}${url.search}${url.hash}`);
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", warnBeforeInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", warnBeforeInternalNavigation, true);
    };
  }, [hasUnsavedChanges]);

  const leaveWithUnsavedChanges = () => {
    if (!pendingNavigation) return;
    const destination = pendingNavigation;
    setPendingNavigation("");
    window.history.pushState({}, "", destination);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const currentClassLabel = `${className} — ${section}`;
  const classOptions = Object.keys(curriculum[curriculumBoard] || {})
    .sort((a, b) => Number(a) - Number(b))
    .map((grade) => `Class ${grade}`);
  const subjectOptions = curriculum[curriculumBoard]?.[className.replace(/^Class\s+/i, "")] || [];

  const showToast = (message) => {
    setToastText(message);
    if (message) {
      window.clearTimeout(showToast.timer);
      showToast.timer = window.setTimeout(() => setToastText(""), 2200);
    }
  };

  const togglePeriod = (day, period) => {
    const key = `${day}|${period}`;
    const occupiedGroupIndex = groups.findIndex((group) => group.periods.includes(key));
    if (occupiedGroupIndex !== -1) {
      const nextGroups = groups
        .map((group, index) => index === occupiedGroupIndex
          ? { ...group, periods: group.periods.filter((assignedPeriod) => assignedPeriod !== key) }
          : group)
        .filter((group) => group.periods.length > 0);
      setGroups(nextGroups);
      setClearRequested(!nextGroups.length);
      setHasUnsavedChanges(true);
      showToast("Period removed — save timetable to apply the change");
      return;
    }
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelected(next);
  };

  const clearAllPeriods = () => {
    setSelected(new Set());
    setGroups([]);
    setClearRequested(true);
    setHasUnsavedChanges(true);
    showToast("Timetable cleared — click Save Timetable to apply the change");
  };

  const resetForm = () => {
    setSelected(new Set());
    setRoom("");
  };

  const addGroup = () => {
    if (!selected.size) {
      showToast("Select at least one period first");
      return;
    }
    const nextGroup = {
      id: `${Date.now()}-${Math.random()}`,
      className: currentClassLabel,
      classLevel: className.replace(/^Class\s+/i, "").trim(),
      classSection: `${className.replace(/^Class\s+/i, "").trim()}-${section}`,
      subject,
      room: room.trim() || "—",
      periods: Array.from(selected),
    };
    setGroups((current) => [...current, nextGroup]);
    setClearRequested(false);
    setHasUnsavedChanges(true);
    setSelected(new Set());
    setRoom("");
    showToast("Teaching group added — selected periods remain highlighted");
  };

  const removeGroup = (index) => {
    setGroups((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setHasUnsavedChanges(true);
  };

  const handleTimetableUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setExtractingTimetable(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await timetableService.extract(formData);

      const extractedEntries = Array.isArray(data) ? data : data.entries;
      if (!Array.isArray(extractedEntries)) {
        throw new Error("The uploaded file did not contain a readable timetable.");
      }

      const extractedGroups = extractedEntries.map((entry, index) => {
        const classLevel = String(entry.class_level || "").replace(/^Class\s+/i, "").trim();
        const classSection = String(entry.class_section || "");
        const section = classSection.includes("-") ? classSection.split("-").pop() : "";
        const periods = (entry.class_subject_entries || [])
          .map((period) => Number(period.period_number))
          .filter((periodNumber) => periodNumber >= 1 && periodNumber <= PERIODS.length)
          .map((periodNumber) => `${entry.class_subject_entries.find((period) => Number(period.period_number) === periodNumber)?.day_of_week}|P${periodNumber}`);

        return {
          id: `extracted-${Date.now()}-${index}`,
          className: `Class ${classLevel}${section ? ` — ${section}` : ""}`,
          classLevel,
          classSection,
          subject: entry.subject || "—",
          room: entry.class_subject_entries?.find((period) => period.room)?.room || "—",
          periods: Array.from(new Set(periods)),
        };
      }).filter((group) => group.periods.length);

      if (!extractedGroups.length) {
        throw new Error("No timetable periods were found in the uploaded file.");
      }

      setGroups(extractedGroups);
      setSelected(new Set());
      setClearRequested(false);
      setHasUnsavedChanges(true);
      setActiveTab("add");
      showToast(`Extracted ${extractedGroups.length} teaching groups. Review and save the timetable.`);
    } catch (error) {
      showToast(error.message || "Unable to extract the timetable.");
    } finally {
      setExtractingTimetable(false);
    }
  };

  const saveTimetable = async () => {
    if (!groups.length && !clearRequested) {
      showToast("Add at least one teaching group first");
      return;
    }

    const payload = groups.map((group) => ({
      class_section: group.classSection,
      subject: group.subject,
        class_level: `Class ${group.classLevel}`,
      class_subject_entries: group.periods.map((key) => {
        const [day, period] = key.split("|");
        const periodTime = PERIODS.find(([periodCode]) => periodCode === period)?.[1] || "";
        const [startTime, endTime] = periodTime.split("–");
        return {
          day_of_week: day,
          period_number: Number(period.replace(/^P/, "")),
          start_time: startTime || null,
          end_time: endTime || null,
          room: group.room === "—" ? null : group.room,
        };
      }),
    }));

    setSaving(true);
    try {
      const data = await timetableService.saveBulk(payload);

      const nextEntries = groups.flatMap((group) =>
        group.periods.map((key) => {
          const [day, period] = key.split("|");
          return { day, period, periodTime: PERIODS.find(([periodCode]) => periodCode === period)?.[1] || "", className: group.className, subject: group.subject, room: group.room };
        }),
      );
      setSavedEntries(nextEntries);
      writeTimetableCache(nextEntries, groups);
      setClearRequested(false);
      setHasUnsavedChanges(false);
      setActiveTab("view");
      showToast(data.message || "Timetable saved successfully");
    } catch (error) {
      showToast(error.message || "Unable to save the timetable.");
    } finally {
      setSaving(false);
    }
  };

  const periodCells = useMemo(
    () =>
      DAYS.map((day) =>
        PERIODS.map(([periodCode, periodTime]) => {
          const key = `${day}|${periodCode}`;
          const occupiedGroup = groups.find((group) => group.periods.includes(key));
          const selectedNow = selected.has(key);
          const cellText = occupiedGroup ? occupiedGroup.className : selectedNow ? currentClassLabel : "Select";
          return {
            key,
            day,
            periodCode,
            periodTime,
            occupiedGroup,
            selectedNow,
            cellText,
          };
        }),
      ),
    [selected, groups, currentClassLabel],
  );

  const tableRows = PERIODS.map(([periodCode, periodTime]) => {
    const displayedPeriodTime = savedEntries.find((entry) => entry.period === periodCode && entry.periodTime)?.periodTime || periodTime;
    const cells = DAYS.map((day) => {
      const matches = savedEntries.filter(
        (entry) => entry.day === day && entry.period === periodCode,
      );
      const periodLabel = `${day}, ${displayedPeriodTime}, ${periodCode}`;
      return (
        <td key={`${day}-${periodCode}`}>
          {matches.length ? (
            <button
              className="timetable-period-trigger"
              type="button"
              aria-label={`${periodLabel}, ${matches.length} ${matches.length === 1 ? "class" : "classes"} scheduled`}
              onClick={() => setSelectedPeriod({ day, period: periodCode })}
            >
              {matches.map((entry, index) => (
                <div className="lesson" key={entry.id || `${entry.className}-${entry.subject}-${entry.room}-${index}`}>
                  <b>{getEntryClassLabel(entry)}</b>
                  <span>{entry.subject}</span>
                  {hasRoom(entry) ? <span>Room {entry.room}</span> : null}
                </div>
              ))}
            </button>
          ) : null}
        </td>
      );
    });
    return (
      <React.Fragment key={periodCode}>
        <tr>
          <td className="time">{displayedPeriodTime}<br />{periodCode}</td>
          {cells}
        </tr>
      </React.Fragment>
    );
  });

  const selectionText = selected.size
    ? <><strong>{selected.size} new periods selected</strong> · Assigned periods remain highlighted</>
    : <><strong>{groups.reduce((count, group) => count + group.periods.length, 0)} periods assigned</strong> · Select more periods for another class</>;

  return (
    <>

      <div className="library-app gurudock-timetable-page">
        <LibrarySidebar activeItem="timetable" />
    <div className="library-main">
      <header className="home-topbar">
        <div>
          <span className="home-topbar-eyebrow">Teacher workspace</span>
          <h1>Timetable</h1>
        </div>
        <a className="home-mobile-brand" href="/home" aria-label="GuruDock home" onClick={(event) => {
          event.preventDefault();
          window.history.pushState({}, "", "/home");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}>
          <img src={logoUrl} alt="" />
          <strong>GuruDock</strong>
        </a>
        <div className="home-topbar-user">
          <span className="home-avatar">{initials || "T"}</span>
          <strong>{userName}</strong>
        </div>
      </header>

      <main className="library-content timetable-content">
        <div className="tabs">
          <button className={`tab ${activeTab === "view" ? "active" : ""}`} type="button" onClick={() => setActiveTab("view")}>View Timetable</button>
          <button className={`tab ${activeTab === "add" ? "active" : ""}`} type="button" onClick={() => setActiveTab("add")}>Add/Edit Timetable</button>
        </div>

        <section className={activeTab === "view" ? "" : "hidden"}>
          {savedEntries.length ? (
            <div className="card upload-prompt">
              <div className="upload-prompt-copy">
                <strong>Have an updated timetable?</strong>
                <span>Upload a timetable to replace your saved timetable.</span>
              </div>
              <div>
                <button className="secondary" type="button" onClick={() => document.getElementById("timetable-pdf-input")?.click()} disabled={extractingTimetable}>
                  {extractingTimetable ? "Reading…" : "Upload timetable"}
                </button>
                <p className="upload-file-types">Supported file types: <strong>JPEG, JPG, PNG, or PDF</strong>.</p>
              </div>
            </div>
          ) : null}
          <input id="timetable-pdf-input" type="file" accept=".pdf,image/jpeg,image/png,image/jpg" hidden onChange={handleTimetableUpload} />
          <div id="timetable-file-name" className="timetable-file-name" />
          <div className="toolbar view-toolbar">
            <div className="view-toolbar-actions">
              <button className="secondary" type="button" onClick={() => document.getElementById("timetable-pdf-input")?.click()}>Upload Timetable</button>
              <button className="primary" type="button" onClick={() => setActiveTab("add")}>＋ Add Timetable</button>
            </div>
            <p className="upload-file-types">Supported file types: <strong>JPEG, JPG, PNG, or PDF</strong>.</p>
          </div>

          {loadingTimetable ? <div className="card timetable-loading">Loading timetable…</div> : <div className="card timetable-wrap">
            <table className="timetable">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Monday</th>
                  <th>Tuesday</th>
                  <th>Wednesday</th>
                  <th>Thursday</th>
                  <th>Friday</th>
                  <th>Saturday</th>
                </tr>
              </thead>
              <tbody>
                {savedEntries.length ? tableRows : (
                  <tr>
                    <td colSpan="7" className="empty">
                      <b>No timetable saved yet</b>
                      <span>Add teaching groups or upload an existing timetable.</span>
                      <div className="empty-actions">
                        <button className="secondary" type="button" onClick={() => setActiveTab("add")}>＋ Add Timetable</button>
                        <button className="primary" type="button" onClick={() => document.getElementById("timetable-pdf-input")?.click()}>Upload Timetable</button>
                      </div>
                      <p className="upload-file-types">Supported file types: <strong>JPEG, JPG, PNG, or PDF</strong>.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {!savedEntries.length ? (
              <div className="mobile-empty-timetable">
                <div className="mobile-empty-icon" aria-hidden="true">▦</div>
                <h2>No timetable saved yet</h2>
                <p>Add teaching groups or upload an existing timetable.</p>
                <div className="mobile-empty-actions">
                  <button className="primary" type="button" onClick={() => setActiveTab("add")}>＋ Add Timetable</button>
                  <button className="secondary" type="button" onClick={() => document.getElementById("timetable-pdf-input")?.click()}>Upload Timetable</button>
                </div>
                <p className="upload-file-types">Supported file types: <strong>JPEG, JPG, PNG, or PDF</strong>.</p>
              </div>
            ) : null}
            {savedEntries.length ? (
              <div className="mobile-timetable">
                {DAYS.map((day) => {
                  const dayEntries = savedEntries
                    .filter((entry) => entry.day === day)
                    .sort((a, b) => PERIODS.findIndex(([period]) => period === a.period) - PERIODS.findIndex(([period]) => period === b.period));

                  return (
                    <section className="mobile-day" key={day}>
                      <h3 className="mobile-day-title">{day}</h3>
                      {dayEntries.length ? dayEntries.map((entry) => {
                        const periodTime = entry.periodTime || PERIODS.find(([period]) => period === entry.period)?.[1] || "";
                        return (
                          <button
                            className="mobile-lesson"
                            key={`${entry.day}-${entry.period}-${entry.className}-${entry.subject}`}
                            type="button"
                            aria-label={`${entry.day}, ${periodTime}, ${entry.period}: ${getEntryClassLabel(entry)}, ${entry.subject}${hasRoom(entry) ? `, Room ${entry.room}` : ""}`}
                            onClick={() => setSelectedPeriod({ day: entry.day, period: entry.period })}
                          >
                            <div className="mobile-time">{periodTime}<br />{entry.period}</div>
                            <div className="mobile-lesson-content">
                              <b>{getEntryClassLabel(entry)}</b>
                              <span>{entry.subject}</span>
                              {hasRoom(entry) ? <span>Room {entry.room}</span> : null}
                            </div>
                          </button>
                        );
                      }) : <div className="mobile-empty-day">No classes scheduled</div>}
                    </section>
                  );
                })}
              </div>
            ) : null}
          </div>}
        </section>

        <section className={activeTab === "add" ? "" : "hidden"}>
          <div className="card add-card">
            <div className="add-head">
              <div>
                <h2>Add teaching group</h2>
                <p>Choose one class and subject, then select only the periods for that group.</p>
              </div>
            </div>

            <div className="fields">
              <div className="field">
                <label>CLASS</label>
                <select value={className} disabled={curriculumLoading || !classOptions.length} onChange={(event) => {
                  const nextClass = event.target.value;
                  const nextSubjects = curriculum[curriculumBoard]?.[nextClass.replace(/^Class\s+/i, "")] || [];
                  setClassName(nextClass);
                  setSubject(nextSubjects[0] || "");
                }}>
                  {classOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>SECTION</label>
                <select value={section} onChange={(event) => setSection(event.target.value)}>
                  {["A", "B", "C", "D", "E", "F", "G"].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>SUBJECT</label>
                <select value={subject} disabled={curriculumLoading || !subjectOptions.length} onChange={(event) => setSubject(event.target.value)}>
                  {subjectOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>ROOM NUMBER</label>
                <input value={room} onChange={(event) => setRoom(event.target.value)} placeholder="e.g. 204" />
              </div>
            </div>

            <div className="period-section">
              <div className="period-title">
                <div>
                  <h3>Select periods</h3>
                  <p>Only the checked periods will be assigned to this class and subject.</p>
                </div>
                <div>
                  <button className="text-btn" type="button" onClick={clearAllPeriods}>Clear</button>
                </div>
              </div>

              <div className="grid-wrap">
                <table className="select-grid">
                  <thead>
                    <tr>
                      <th>Period</th>
                      {DAYS.map((day) => (
                        <th key={day}>{day}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODS.map(([periodCode, periodTime], periodIndex) => (
                      <tr key={periodCode}>
                        <td className="day">{periodCode}<span className="ptime">{periodTime}</span></td>
                        {DAYS.map((day, dayIndex) => {
                          const item = periodCells[dayIndex]?.[periodIndex];
                          const classNames = ["period", item?.selectedNow ? "selected" : "", item?.occupiedGroup ? "occupied" : ""].filter(Boolean).join(" ");
                          return (
                            <td key={`${day}-${periodCode}`}>
                              <div className={classNames} onClick={() => togglePeriod(day, periodCode)} role="button" tabIndex={0} onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  togglePeriod(day, periodCode);
                                }
                              }}>
                                <div>
                                  <span className="period-class">{item?.cellText}</span>
                                  <span className="period-class-mobile">{getCompactClassLabel(item?.cellText || "")}</span>
                                  <span className="ptime">{item?.periodTime}</span>
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="group-bar">
                <span>{selectionText}</span>
                <button className="save" type="button" onClick={addGroup}>＋ Add to Timetable</button>
              </div>
            </div>

            <div className="groups">
              <div className="groups-head">
                <div>
                  <h3>Teaching groups</h3>
                  <p>Review what you have added before saving the timetable.</p>
                </div>
              </div>

              {groups.length ? (
                groups.map((group, index) => (
                  <div key={group.id} className="group">
                    <div className="group-main">
                      <b>{group.subject} · {group.className} · Room {group.room}</b>
                      <small>{group.periods.map((period) => period.replace("|", " · ")).join(", ")}</small>
                    </div>
                    <button className="remove" type="button" onClick={() => removeGroup(index)}>Remove</button>
                  </div>
                ))
              ) : (
                <div className="empty-groups">
                  No teaching groups added yet.
                </div>
              )}

              <div className="final-save">
                <button className="primary" type="button" onClick={saveTimetable} disabled={saving}>
                  {saving ? "Saving…" : "Save Timetable"}
                </button>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>

    <div className={`toast ${toastText ? "show" : ""}`}>{toastText}</div>
    {selectedPeriod ? (() => {
      const periodTime = savedEntries.find((entry) => entry.day === selectedPeriod.day && entry.period === selectedPeriod.period)?.periodTime
        || PERIODS.find(([period]) => period === selectedPeriod.period)?.[1]
        || "";
      const entries = savedEntries.filter((entry) => entry.day === selectedPeriod.day && entry.period === selectedPeriod.period);
      return (
        <div className="period-details-backdrop" role="presentation" onClick={() => setSelectedPeriod(null)}>
          <div
            className="period-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="period-details-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="period-details-header">
              <div>
                <span>{selectedPeriod.day} · {selectedPeriod.period}</span>
                <h2 id="period-details-title">Period details</h2>
                <p>{periodTime}</p>
              </div>
              <button className="period-details-close" type="button" aria-label="Close period details" onClick={() => setSelectedPeriod(null)}>×</button>
            </div>
            {entries.length ? (
              <div className="period-details-list">
                {entries.map((entry, index) => (
                  <article className="period-details-entry" key={entry.id || `${entry.className}-${entry.subject}-${entry.room}-${index}`}>
                    <h3>{getEntryClassLabel(entry)}</h3>
                    <p><strong>Subject</strong><span>{entry.subject}</span></p>
                    <p><strong>Room</strong><span>{hasRoom(entry) ? entry.room : "Not specified"}</span></p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="period-details-empty">No class is scheduled for this period.</p>
            )}
            <div className="period-details-actions">
              <button className="primary" type="button" onClick={() => setSelectedPeriod(null)}>Close</button>
            </div>
          </div>
        </div>
      );
    })() : null}
    {pendingNavigation ? (
      <div className="unsaved-modal-backdrop" role="presentation">
        <div className="unsaved-modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-timetable-title">
          <div className="unsaved-modal-mark" aria-hidden="true">!</div>
          <h2 id="unsaved-timetable-title">Unsaved timetable changes</h2>
          <p>Your added or removed periods have not been saved. Leave this page without saving?</p>
          <div className="unsaved-modal-actions">
            <button className="secondary" type="button" onClick={() => setPendingNavigation("")}>Stay</button>
            <button className="primary" type="button" onClick={leaveWithUnsavedChanges}>Leave page</button>
          </div>
        </div>
      </div>
    ) : null}
    {extractingTimetable ? (
      <div className="extracting-modal-backdrop" role="presentation">
        <div className="extracting-modal" role="dialog" aria-modal="true" aria-labelledby="extracting-timetable-title">
          <div className="extracting-spinner" aria-hidden="true" />
          <h2 id="extracting-timetable-title">Reading your timetable</h2>
          <p>We are analyzing the uploaded file and preparing the periods for review. This may take a moment.</p>
        </div>
      </div>
    ) : null}
  </div>
  </>
  );
}
