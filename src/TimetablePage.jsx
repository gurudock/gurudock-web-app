import React, { useEffect, useMemo, useState } from "react";
import logoUrl from "./assets/gurudock-logo.png";
import LibrarySidebar from "./LibrarySidebar";
import { readAvailableContentCache, writeAvailableContentCache } from "./availableContentCache";
import { authenticatedFetch, API_BASE_URL } from "./apiClient";

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
const TIMETABLE_CACHE_TTL = 24 * 60 * 60 * 1000;

function getTimetableCacheKey() {
  const user = localStorage.getItem("user_email") || localStorage.getItem("user_name") || "authenticated";
  return `${TIMETABLE_CACHE_KEY}:${user.toLowerCase()}`;
}

function readTimetableCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(getTimetableCacheKey()) || "null");
    if (
      !cached ||
      Date.now() - cached.cachedAt > TIMETABLE_CACHE_TTL ||
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
  useEffect(() => {
    const syncUser = () => setUserName(localStorage.getItem("user_name") || "Teacher");
    window.addEventListener("auth-changed", syncUser);
    return () => window.removeEventListener("auth-changed", syncUser);
  }, []);

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
        const response = await fetch(`${API_BASE_URL}/content/available-content`, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("Unable to load curriculum.");
        }

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
        const response = await authenticatedFetch(`${API_BASE_URL}/timetable`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data)) {
          throw new Error(data.detail || data.message || "Unable to load the timetable.");
        }

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
            ? "Unable to refresh the timetable. Showing the cached timetable."
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
      const response = await authenticatedFetch(`${API_BASE_URL}/timetable/extract`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Unable to extract the timetable.");
      }

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
      const response = await authenticatedFetch(`${API_BASE_URL}/timetable/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Unable to save the timetable.");
      }

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
      const key = `${day}|${periodCode}`;
      const matches = savedEntries.filter(
        (entry) => entry.day === day && entry.period === periodCode,
      );
      const label = matches.length
        ? matches
            .map(
              (entry) => `<div class="lesson"><b>${getEntryClassLabel(entry)}</b><span>${entry.subject}</span>${hasRoom(entry) ? `<span>Room ${entry.room}</span>` : ""}</div>`,
            )
            .join("")
        : "";
      return <td key={`${day}-${periodCode}`} dangerouslySetInnerHTML={{ __html: label }} />;
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
      <style>{`
        .gurudock-timetable-page {
          background: #f5f3e8;
          color: #2b211a;
          font-family: "Work Sans", system-ui, sans-serif;
        }

        .gurudock-timetable-page .library-content {
          width: min(100%, 1180px);
          margin: 0 auto;
          padding: 28px 28px 64px;
          overflow-x: auto;
        }

        .gurudock-timetable-page .tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 18px;
          padding-bottom: 10px;
          border-bottom: 1px solid #e5ddd4;
          flex-wrap: wrap;
        }

        .gurudock-timetable-page .tab {
          border: 0;
          background: transparent;
          padding: 8px 14px 10px;
          color: #756b60;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          border-bottom: 3px solid transparent;
        }

        .gurudock-timetable-page .tab.active {
          color: #5b3219;
          border-color: #5b3219;
        }

        .gurudock-timetable-page section { width: 100%; }
        .gurudock-timetable-page .hidden { display: none !important; }

        .gurudock-timetable-page .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 16px;
        }

        .gurudock-timetable-page .view-toolbar-actions {
          display: none;
        }

        .gurudock-timetable-page .upload-file-types {
          margin: 7px 0 0;
          color: #71808b;
          font-size: 11px;
          line-height: 1.4;
        }

        .gurudock-timetable-page .upload-prompt .upload-file-types {
          text-align: right;
        }

        .gurudock-timetable-page .view-toolbar {
          display: none;
        }

        .gurudock-timetable-page .toolbar select {
          min-width: 220px;
          height: 42px;
          padding: 0 12px;
          border: 1px solid #d6c8b6;
          border-radius: 10px;
          background: #fffdfa;
          color: #2b211a;
          font: inherit;
          font-size: 14px;
        }

        .gurudock-timetable-page .primary,
        .gurudock-timetable-page .save {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 18px;
          border: 0;
          border-radius: 10px;
          background: #5b3219;
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .gurudock-timetable-page .secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          padding: 0 16px;
          border: 1px solid #d6c8b6;
          border-radius: 10px;
          background: #fffdfa;
          color: #2b211a;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }

        .gurudock-timetable-page .card {
          background: #fffdfb;
          border: 1px solid #e5ddd4;
          border-radius: 14px;
          overflow: hidden;
        }

        .gurudock-timetable-page .timetable-wrap {
          overflow: auto;
          border-radius: 12px;
        }

        .gurudock-timetable-page .timetable-loading {
          padding: 36px 20px;
          color: #71808b;
          font-size: 13px;
          text-align: center;
        }

        .gurudock-timetable-page .mobile-timetable {
          display: none;
        }

        .gurudock-timetable-page .timetable {
          width: 100%;
          min-width: 860px;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .gurudock-timetable-page .timetable th {
          background: #f5f0ea;
          padding: 12px 8px;
          color: #65717a;
          font-size: 11px;
          text-align: left;
        }

        .gurudock-timetable-page .timetable td {
          border: 1px solid #eee9e3;
          padding: 7px;
          height: 70px;
          vertical-align: top;
          background: #fff;
        }

        .gurudock-timetable-page .time {
          width: 110px;
          background: #fcfbfa;
          color: #67737c;
          font-size: 11px;
          font-weight: 800;
          line-height: 1.45;
        }

        .gurudock-timetable-page .lesson {
          background: #f3e7dc;
          border-left: 3px solid #5b3219;
          border-radius: 8px;
          padding: 8px;
          overflow-wrap: anywhere;
          text-align: center;
        }

        .gurudock-timetable-page .lesson b {
          display: block;
          color: #2b211a;
          font-size: 12px;
        }

        .gurudock-timetable-page .lesson span {
          display: block;
          margin-top: 4px;
          color: #65717a;
          font-size: 10px;
          line-height: 1.4;
        }

        .gurudock-timetable-page .empty {
          height: 220px;
          text-align: center;
          vertical-align: middle;
          color: #71808b;
          font-size: 13px;
        }

        .gurudock-timetable-page .empty b {
          display: block;
          margin-bottom: 8px;
          color: #29323a;
          font-size: 16px;
        }

        .gurudock-timetable-page .empty-actions {
          display: flex;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .gurudock-timetable-page .mobile-empty-timetable {
          display: none;
        }

        .gurudock-timetable-page .add-card {
          padding: 22px;
        }

        .gurudock-timetable-page .add-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 20px;
        }

        .gurudock-timetable-page .add-head h2 {
          margin: 0 0 6px;
          color: #2b211a;
          font-size: 18px;
          font-weight: 700;
        }

        .gurudock-timetable-page .add-head p {
          margin: 0;
          color: #71808b;
          font-size: 12px;
        }

        .gurudock-timetable-page .fields {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .gurudock-timetable-page .field label {
          display: block;
          margin-bottom: 6px;
          color: #66727c;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .gurudock-timetable-page .field select,
        .gurudock-timetable-page .field input {
          width: 100%;
          height: 42px;
          padding: 0 10px;
          border: 1px solid #d8c9b8;
          border-radius: 9px;
          outline: none;
          background: #fffdfa;
          color: #2b211a;
          font: inherit;
          font-size: 13px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .gurudock-timetable-page .field select {
          appearance: auto;
          cursor: pointer;
        }

        .gurudock-timetable-page .field select:focus,
        .gurudock-timetable-page .field input:focus {
          border-color: #a96a40;
          box-shadow: 0 0 0 3px rgba(190, 95, 42, 0.12);
        }

        .gurudock-timetable-page .field select:disabled,
        .gurudock-timetable-page .field input:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .gurudock-timetable-page .period-section {
          margin-top: 18px;
          border-top: 1px solid #e5ddd4;
          padding-top: 20px;
        }

        .gurudock-timetable-page .period-title {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 12px;
        }

        .gurudock-timetable-page .period-title h3 {
          margin: 0 0 4px;
          color: #2b211a;
          font-size: 16px;
        }

        .gurudock-timetable-page .period-title p {
          margin: 0;
          color: #71808b;
          font-size: 12px;
        }

        .gurudock-timetable-page .text-btn {
          margin-left: 10px;
          border: 0;
          background: transparent;
          color: #5b3219;
          font-weight: 700;
          cursor: pointer;
        }

        .gurudock-timetable-page .grid-wrap {
          overflow: auto;
          border: 1px solid #e5ddd4;
          border-radius: 10px;
        }

        .gurudock-timetable-page .select-grid {
          width: 100%;
          min-width: 760px;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .gurudock-timetable-page .select-grid th {
          background: #f5f0ea;
          padding: 8px 5px;
          color: #65717a;
          font-size: 10px;
          text-align: center;
        }

        .gurudock-timetable-page .select-grid th:first-child,
        .gurudock-timetable-page .select-grid td:first-child {
          width: 52px;
          min-width: 52px;
          max-width: 52px;
        }

        .gurudock-timetable-page .select-grid td {
          border: 1px solid #eee9e3;
          padding: 3px;
          text-align: center;
          background: #fff;
        }

        .gurudock-timetable-page .day {
          width: 52px;
          min-width: 52px;
          max-width: 52px;
          background: #fcfbfa;
          color: #2b211a;
          font-size: 10px;
          font-weight: 800;
          text-align: center !important;
          padding: 3px !important;
        }

        .gurudock-timetable-page .period {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 42px;
          padding: 4px;
          border: 1px solid #ded6ce;
          border-radius: 7px;
          background: #fff;
          color: #2b211a;
          cursor: pointer;
          overflow-wrap: anywhere;
        }

        .gurudock-timetable-page .period.selected {
          background: #f3e7dc;
          border: 2px solid #5b3219;
          color: #5b3219;
        }

        .gurudock-timetable-page .period.occupied {
          background: #eee8e2;
          border: 2px solid #b9aa9d;
          color: #5f5147;
          cursor: pointer;
        }

        .gurudock-timetable-page .period-class {
          display: block;
          font-size: 10px;
          font-weight: 800;
          line-height: 1.2;
          text-align: center;
        }

        .gurudock-timetable-page .period-class-mobile {
          display: none;
        }

        .gurudock-timetable-page .ptime {
          display: block;
          margin-top: 2px;
          color: #71808b;
          font-size: 7px;
          line-height: 1.3;
          white-space: nowrap;
        }

        .gurudock-timetable-page .group-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 16px;
          padding: 12px 14px;
          border: 1px solid #e5ddd4;
          border-radius: 9px;
          background: #faf7f3;
          color: #71808b;
          font-size: 12px;
        }

        .gurudock-timetable-page .group-bar strong {
          color: #5b3219;
        }

        .gurudock-timetable-page .groups {
          margin-top: 20px;
        }

        .gurudock-timetable-page .groups-head h3 {
          margin: 0;
          color: #2b211a;
          font-size: 16px;
        }

        .gurudock-timetable-page .groups-head p {
          margin: 5px 0 10px;
          color: #71808b;
          font-size: 12px;
        }

        .gurudock-timetable-page .group {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
          padding: 13px 15px;
          border: 1px solid #e5ddd4;
          border-radius: 9px;
          background: #fff;
        }

        .gurudock-timetable-page .group-main {
          min-width: 0;
          flex: 1;
        }

        .gurudock-timetable-page .group-main b {
          display: block;
          color: #2b211a;
          font-size: 13px;
        }

        .gurudock-timetable-page .group-main small {
          display: block;
          margin-top: 4px;
          color: #71808b;
          font-size: 11px;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .gurudock-timetable-page .remove {
          border: 0;
          background: transparent;
          color: #8a3d2b;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .gurudock-timetable-page .final-save {
          display: flex;
          justify-content: flex-end;
          margin-top: 14px;
        }

        .gurudock-timetable-page .upload {
          padding: 40px 26px;
          text-align: center;
        }

        .gurudock-timetable-page .upload-prompt {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
          padding: 14px 16px;
          background: #fffdfb;
        }

        .gurudock-timetable-page .upload-prompt-copy {
          min-width: 0;
        }

        .gurudock-timetable-page .upload-prompt-copy strong {
          display: block;
          color: #2b211a;
          font-size: 13px;
        }

        .gurudock-timetable-page .upload-prompt-copy span {
          display: block;
          margin-top: 4px;
          color: #71808b;
          font-size: 11px;
        }

        .gurudock-timetable-page .upload h2 {
          margin: 0 0 12px;
          color: #2b211a;
          font-size: 24px;
        }

        .gurudock-timetable-page .upload p {
          margin: 0 0 18px;
          color: #71808b;
          font-size: 13px;
        }

        .gurudock-timetable-page .toast {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 50;
          display: block;
          padding: 12px 16px;
          border-radius: 8px;
          background: #29323a;
          color: #fff;
          font-size: 13px;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.2s ease, transform 0.2s ease;
          pointer-events: none;
        }

        .gurudock-timetable-page .toast.show {
          opacity: 1;
          transform: translateY(0);
        }

        .gurudock-timetable-page .unsaved-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(43, 33, 26, 0.42);
        }

        .gurudock-timetable-page .unsaved-modal {
          width: min(100%, 420px);
          padding: 26px;
          border: 1px solid #e5ddd4;
          border-radius: 16px;
          background: #fffdfb;
          box-shadow: 0 20px 55px rgba(43, 33, 26, 0.2);
        }

        .gurudock-timetable-page .unsaved-modal-mark {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          margin-bottom: 14px;
          border-radius: 12px;
          background: #f3e7dc;
          color: #5b3219;
          font-size: 20px;
        }

        .gurudock-timetable-page .unsaved-modal h2 {
          margin: 0;
          color: #2b211a;
          font-size: 20px;
        }

        .gurudock-timetable-page .unsaved-modal p {
          margin: 8px 0 20px;
          color: #71808b;
          font-size: 13px;
          line-height: 1.5;
        }

        .gurudock-timetable-page .unsaved-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }

        .gurudock-timetable-page .extracting-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 110;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(43, 33, 26, 0.42);
        }

        .gurudock-timetable-page .extracting-modal {
          width: min(100%, 390px);
          padding: 30px 26px;
          border: 1px solid #e5ddd4;
          border-radius: 16px;
          background: #fffdfb;
          box-shadow: 0 20px 55px rgba(43, 33, 26, 0.2);
          text-align: center;
        }

        .gurudock-timetable-page .extracting-spinner {
          width: 42px;
          height: 42px;
          margin: 0 auto 16px;
          border: 4px solid #eadfd5;
          border-top-color: #5b3219;
          border-radius: 50%;
          animation: timetable-spin 0.8s linear infinite;
        }

        .gurudock-timetable-page .extracting-modal h2 {
          margin: 0;
          color: #2b211a;
          font-size: 20px;
        }

        .gurudock-timetable-page .extracting-modal p {
          margin: 8px 0 0;
          color: #71808b;
          font-size: 13px;
          line-height: 1.5;
        }

        @keyframes timetable-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 900px) {
          .gurudock-timetable-page .library-content {
            padding: 20px 16px 42px;
          }

          .gurudock-timetable-page .toolbar,
          .gurudock-timetable-page .add-head,
          .gurudock-timetable-page .period-title,
          .gurudock-timetable-page .group-bar {
            flex-direction: column;
            align-items: stretch;
          }

          .gurudock-timetable-page .period-title > div:last-child {
            align-self: flex-end;
          }

          .gurudock-timetable-page .fields {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .gurudock-timetable-page .field select,
          .gurudock-timetable-page .field input {
            min-width: 0;
          }
        }

        @media (max-width: 640px) {
          .gurudock-timetable-page .library-content {
            padding: 16px 12px 32px;
          }

          .gurudock-timetable-page .tabs {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 4px;
            margin-bottom: 16px;
            padding: 4px;
            border: 1px solid #e5ddd4;
            border-radius: 11px;
            background: #faf7f3;
          }

          .gurudock-timetable-page .tab {
            min-width: 0;
            min-height: 44px;
            padding: 7px 4px;
            border-bottom: 0;
            border-radius: 8px;
            color: #756b60;
            font-size: 11px;
            line-height: 1.2;
            white-space: normal;
          }

          .gurudock-timetable-page .tab.active {
            background: #5b3219;
            color: #fff;
          }

          .gurudock-timetable-page .toolbar {
            gap: 10px;
          }

          .gurudock-timetable-page .view-toolbar {
            display: none;
          }

          .gurudock-timetable-page .view-toolbar-actions {
            display: flex;
            width: 100%;
            gap: 10px;
          }

          .gurudock-timetable-page .upload-prompt {
            align-items: stretch;
            flex-direction: column;
            gap: 11px;
          }

          .gurudock-timetable-page .upload-prompt .secondary {
            width: 100%;
          }

          .gurudock-timetable-page .unsaved-modal {
            padding: 22px;
          }

          .gurudock-timetable-page .unsaved-modal-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }

          .gurudock-timetable-page .toolbar select,
          .gurudock-timetable-page .toolbar .primary,
          .gurudock-timetable-page .toolbar .secondary {
            width: 100%;
          }

          .gurudock-timetable-page .timetable-wrap {
            overflow: visible;
            border: 0;
            background: transparent;
          }

          .gurudock-timetable-page .timetable {
            display: none;
          }

          .gurudock-timetable-page .mobile-timetable {
            display: grid;
            gap: 10px;
          }

          .gurudock-timetable-page .mobile-empty-timetable {
            display: flex;
            align-items: center;
            flex-direction: column;
            padding: 34px 20px 30px;
            border: 1px solid #e5ddd4;
            border-radius: 14px;
            background: #fffdfb;
            text-align: center;
          }

          .gurudock-timetable-page .mobile-empty-icon {
            display: grid;
            place-items: center;
            width: 48px;
            height: 48px;
            margin-bottom: 14px;
            border-radius: 14px;
            background: #f3e7dc;
            color: #5b3219;
            font-size: 23px;
          }

          .gurudock-timetable-page .mobile-empty-timetable h2 {
            margin: 0;
            color: #2b211a;
            font-size: 18px;
          }

          .gurudock-timetable-page .mobile-empty-timetable p {
            max-width: 270px;
            margin: 8px 0 18px;
            color: #71808b;
            font-size: 12px;
            line-height: 1.5;
          }

          .gurudock-timetable-page .mobile-empty-actions {
            display: grid;
            width: 100%;
            max-width: 280px;
            gap: 9px;
          }

          .gurudock-timetable-page .mobile-day {
            overflow: hidden;
            border: 1px solid #e5ddd4;
            border-radius: 12px;
            background: #fffdfb;
          }

          .gurudock-timetable-page .mobile-day-title {
            margin: 0;
            padding: 11px 13px;
            background: #f5f0ea;
            color: #5b3219;
            font-size: 13px;
            font-weight: 800;
          }

          .gurudock-timetable-page .mobile-lesson {
            display: grid;
            grid-template-columns: 76px minmax(0, 1fr);
            gap: 11px;
            align-items: start;
            padding: 12px 13px;
            border-top: 1px solid #eee9e3;
          }

          .gurudock-timetable-page .mobile-time {
            color: #67737c;
            font-size: 10px;
            font-weight: 800;
            line-height: 1.4;
          }

          .gurudock-timetable-page .mobile-lesson-content {
            min-width: 0;
            padding-left: 10px;
            border-left: 3px solid #5b3219;
          }

          .gurudock-timetable-page .mobile-lesson-content b,
          .gurudock-timetable-page .mobile-lesson-content span {
            display: block;
            overflow-wrap: anywhere;
          }

          .gurudock-timetable-page .mobile-lesson-content b {
            color: #2b211a;
            font-size: 12px;
            line-height: 1.35;
          }

          .gurudock-timetable-page .mobile-lesson-content span {
            margin-top: 3px;
            color: #65717a;
            font-size: 11px;
            line-height: 1.35;
          }

          .gurudock-timetable-page .mobile-empty-day {
            padding: 12px 13px;
            border-top: 1px solid #eee9e3;
            color: #89929a;
            font-size: 11px;
          }

          .gurudock-timetable-page .grid-wrap {
            overflow-x: auto;
          }

          .gurudock-timetable-page .select-grid {
            width: 590px;
            min-width: 590px;
          }

          .gurudock-timetable-page .select-grid th {
            padding: 6px 2px;
            font-size: 8px;
            line-height: 1.15;
            overflow-wrap: anywhere;
          }

          .gurudock-timetable-page .select-grid th:first-child,
          .gurudock-timetable-page .select-grid td:first-child,
          .gurudock-timetable-page .day {
            width: 42px;
            min-width: 42px;
            max-width: 42px;
          }

          .gurudock-timetable-page .select-grid td {
            padding: 2px;
          }

          .gurudock-timetable-page .period {
            min-height: 34px;
            padding: 2px;
            border-radius: 5px;
          }

          .gurudock-timetable-page .period-class {
            display: none;
          }

          .gurudock-timetable-page .period-class-mobile {
            display: block;
            font-size: 9px;
            font-weight: 800;
            line-height: 1.15;
            overflow-wrap: anywhere;
            text-align: center;
          }

          .gurudock-timetable-page .period > div > .ptime {
            display: none;
          }
        }
      `}</style>
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
          <div id="timetable-file-name" style={{ marginBottom: "12px", color: "#47745d", fontSize: "12px" }} />
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
                          <div className="mobile-lesson" key={`${entry.day}-${entry.period}-${entry.className}-${entry.subject}`}>
                            <div className="mobile-time">{periodTime}<br />{entry.period}</div>
                            <div className="mobile-lesson-content">
                              <b>{getEntryClassLabel(entry)}</b>
                              <span>{entry.subject}</span>
                              {hasRoom(entry) ? <span>Room {entry.room}</span> : null}
                            </div>
                          </div>
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
                <div style={{ border: "1px dashed #d9d0c8", borderRadius: "9px", padding: "20px", textAlign: "center", color: "#71808b", fontSize: "12px" }}>
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
