import React, { useEffect, useRef, useState } from "react";
import logoUrl from "./assets/gurudock-logo.png";
import { API_BASE_URL, authenticatedFetch } from "./apiClient";
import { handleWorkspaceWheel } from "./LibraryPage";
import LibrarySidebar from "./LibrarySidebar";
import { readAvailableContentCache, writeAvailableContentCache } from "./availableContentCache";

export default function BriefingPage() {
  const [userName, setUserName] = useState(() => localStorage.getItem("user_name") || "Teacher");
  const [briefingContext] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("briefing_context") || "null");
    } catch {
      return null;
    }

  });
  const currentClass = briefingContext?.className || "9-B";
  const currentSubject = briefingContext?.subject || "Mathematics";
  const currentChapter = briefingContext?.chapter || "Quadratic equations";
  const initialClass = currentClass.match(/\d+/)?.[0] ? `Class ${currentClass.match(/\d+/)[0]}` : "Class 10";
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [form, setForm] = useState({
    className: initialClass,
    subject: currentSubject,
    chapter: currentChapter,
  });
  const [curriculum, setCurriculum] = useState({});
  const [board, setBoard] = useState(briefingContext?.board || "CBSE");
  const [chapters, setChapters] = useState([]);
  const [curriculumLoading, setCurriculumLoading] = useState(true);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [previousBriefings, setPreviousBriefings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("gurudock_previous_briefings") || "[]");
    } catch {
      return [];
    }
  });
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  useEffect(() => {
    const syncUser = () => setUserName(localStorage.getItem("user_name") || "Teacher");
    window.addEventListener("auth-changed", syncUser);
    return () => window.removeEventListener("auth-changed", syncUser);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const applyCurriculum = (data) => {
      const nextBoard = Object.keys(data).includes(board) ? board : Object.keys(data)[0] || "CBSE";
      const grades = Object.keys(data[nextBoard] || {}).sort((a, b) => Number(a) - Number(b));
      const nextClass = grades.includes(initialClass.replace("Class ", "")) ? initialClass : `Class ${grades[0] || ""}`;
      const subjects = data[nextBoard]?.[nextClass.replace("Class ", "")] || [];
      setCurriculum(data);
      setBoard(nextBoard);
      setForm((current) => ({ ...current, className: nextClass, subject: subjects.includes(current.subject) ? current.subject : subjects[0] || "", chapter: "" }));
      setCurriculumLoading(false);
    };
    const cachedCurriculum = readAvailableContentCache();
    if (cachedCurriculum) applyCurriculum(cachedCurriculum);
    fetch(`${API_BASE_URL}/content/available-content`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("Unable to load curriculum.");
        writeAvailableContentCache(data);
        applyCurriculum(data);
      })
      .catch(() => {})
      .finally(() => setCurriculumLoading(false));
    return () => controller.abort();
  }, []);

  const classOptions = Object.keys(curriculum[board] || {}).sort((a, b) => Number(a) - Number(b)).map((grade) => `Class ${grade}`);
  const subjectOptions = curriculum[board]?.[form.className.replace(/^Class\s+/, "")] || [];

  useEffect(() => {
    const grade = form.className.replace(/^Class\s+/i, "").trim();
    if (!board || !grade || !form.subject) return undefined;
    const controller = new AbortController();
    setChaptersLoading(true);
    fetch(`${API_BASE_URL}/content/chapters-topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board, grade, subject: form.subject, book_name: "" }),
      signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      const chapterData = data?.chapters || data?.data?.chapters;
      if (!response.ok || !chapterData || typeof chapterData !== "object") throw new Error("Unable to load chapters.");
      const nextChapters = Object.keys(chapterData);
      setChapters(nextChapters);
      setForm((current) => ({ ...current, chapter: nextChapters.includes(current.chapter) ? current.chapter : nextChapters[0] || "" }));
    }).catch(() => setChapters([])).finally(() => setChaptersLoading(false));
    return () => controller.abort();
  }, [board, form.className, form.subject]);

  const generateBriefing = async (event) => {
    event.preventDefault();
    setBriefingLoading(true);
    setBriefingError("");
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/briefing/pull/stand_alone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          board: briefingContext?.board || "CBSE",
          class_level: form.className.replace(/^Class\s+/i, "").split("-")[0].trim(),
          subject: form.subject,
          chapter: form.chapter,
          language: "english",
          llm_provider: "anthropic",
          force_regenerate: true,
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.message || "Unable to generate the briefing.");
      const nextBriefing = { ...data, generated_at: data.generated_at || new Date().toISOString() };
      const nextPrevious = [nextBriefing, ...previousBriefings.filter((item) => item.id !== nextBriefing.id)].slice(0, 12);
      localStorage.setItem("gurudock_previous_briefings", JSON.stringify(nextPrevious));
      setPreviousBriefings(nextPrevious);
      setBriefing(nextBriefing);
      setPreviewOpen(true);
    } catch (error) {
      setBriefingError(error.message || "Unable to generate the briefing.");
    } finally {
      setBriefingLoading(false);
    }
  };

  return (
    <div className="briefing-app" onWheel={(event) => handleWorkspaceWheel(event, ".briefing-content")}>
      <LibrarySidebar activeItem="briefing" />
      <div className="briefing-main">
        <header className="home-topbar">
          <div>
            <span className="home-topbar-eyebrow">Teacher workspace</span>
            <h1>Briefing</h1>
          </div>
          <a className="home-mobile-brand" href="/home" aria-label="GuruDock home">
            <img src={logoUrl} alt="" />
            <strong>GuruDock</strong>
          </a>
          <div className="home-topbar-user">
            <span className="home-avatar">{initials || "T"}</span>
            <strong>{userName}</strong>
          </div>
        </header>
        <main className="briefing-content">
          <section className="briefing-current-card">
            <div className="briefing-form-heading">
              <span>Generate a briefing</span>
              <p>Choose a class, subject and chapter to prepare focused teaching notes.</p>
            </div>
            <form className="briefing-form" onSubmit={generateBriefing}>
              <label>Class<BriefingThemedSelect value={form.className} onChange={(nextClass) => {
                const subjects = curriculum[board]?.[nextClass.replace("Class ", "")] || [];
                setForm({ className: nextClass, subject: subjects[0] || "", chapter: "" });
              }} options={classOptions} ariaLabel="Select class" disabled={curriculumLoading} /></label>
              <label>Subject<BriefingThemedSelect value={form.subject} onChange={(subject) => setForm({ ...form, subject, chapter: "" })} options={subjectOptions} ariaLabel="Select subject" disabled={curriculumLoading} /></label>
              <label>Chapter<BriefingThemedSelect value={form.chapter} onChange={(chapter) => setForm({ ...form, chapter })} options={[{ value: "", label: chaptersLoading ? "Loading chapters..." : "Select chapter" }, ...chapters]} ariaLabel="Select chapter" disabled={chaptersLoading || !chapters.length} /></label>
              <button className="briefing-primary-button" type="submit" disabled={briefingLoading}>{briefingLoading ? "Generating..." : "Generate briefing →"}</button>
            </form>
          </section>

          <section className="briefing-upcoming briefing-previous-section">
            <h2>Previous briefings</h2>
            {previousBriefings.length ? <div className="briefing-library-list">
              <div className="briefing-library-header"><span>Briefing</span><span>Subject</span><span>Class</span><span>Generated</span><span /></div>
              {previousBriefings.map((item) => (
                <button type="button" className="briefing-library-row" key={item.id || `${item.chapter}-${item.generated_at}`} onClick={() => { setBriefing(item); setPreviewOpen(true); }}>
                  <strong><span className="briefing-library-icon" aria-hidden="true">✦</span>{item.chapter}</strong>
                  <span>{item.subject || "—"}</span>
                  <span>{item.class_level || "—"}</span>
                  <small>{item.generated_at ? new Date(item.generated_at).toLocaleDateString("en-IN") : "—"}</small>
                  <b>Open <span aria-hidden="true">→</span></b>
                </button>
              ))}
            </div> : <p className="briefing-empty">Your generated briefings will appear here.</p>}
          </section>

          
        </main>
      </div>
      {briefingLoading && <div className="briefing-generation-backdrop" role="status" aria-live="polite">
        <div className="briefing-generation-dialog"><span className="briefing-generation-spinner" /><div><strong>Generating your briefing</strong><p>Preparing focused teaching notes for this chapter...</p></div></div>
      </div>}
      {briefingError && <div className="briefing-generation-backdrop" role="alert">
        <div className="briefing-generation-dialog briefing-generation-error"><strong>Unable to generate briefing</strong><p>{briefingError}</p><button type="button" onClick={() => setBriefingError("")}>Close</button></div>
      </div>}
      {briefing && previewOpen && <BriefingPreview briefing={briefing} onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}

function BriefingThemedSelect({ value, onChange, options, ariaLabel, disabled = false }) {
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
    <button type="button" className="briefing-themed-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
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

export function BriefingPreview({ briefing, onClose }) {
  return <div className="briefing-preview-backdrop" onClick={onClose}>
    <article className="briefing-preview" onClick={(event) => event.stopPropagation()}>
      <header className="briefing-preview-header">
        <div><span>Generated briefing</span><h2>{briefing.chapter}</h2><p>{briefing.class_level} · {briefing.subject} · {briefing.board}</p></div>
        <button type="button" onClick={onClose} aria-label="Close briefing">×</button>
      </header>
      <div className="briefing-preview-body">
        <BriefingPreviewSection title="Overview"><p>{briefing.overview}</p></BriefingPreviewSection>
        <BriefingPreviewSection title="Learning objectives"><ul>{(briefing.learning_objectives || []).map((item) => <li key={item}>{item}</li>)}</ul></BriefingPreviewSection>
        <BriefingPreviewSection title={`Topics · ${briefing.estimated_periods || 0} estimated periods`}>
          <div className="briefing-topic-list">{(briefing.topics || []).map((topic) => <section key={topic.topic_id || topic.title}><h4>{topic.title}</h4><p>{topic.summary}</p>{topic.key_points?.length > 0 && <ul>{topic.key_points.map((point) => <li key={point}>{point}</li>)}</ul>}<small>{topic.example_or_application}</small></section>)}</div>
        </BriefingPreviewSection>
        <BriefingPreviewSection title="Key definitions"><ul>{(briefing.key_definitions || []).map((item) => <li key={item.term}><b>{item.term}:</b> {item.definition}</li>)}</ul></BriefingPreviewSection>
        <BriefingPreviewSection title="Exam focus"><ul>{(briefing.exam_focus || []).map((item) => <li key={item}>{item}</li>)}</ul></BriefingPreviewSection>
        <BriefingPreviewSection title="Quick recall"><ul>{(briefing.quick_recall || []).map((item) => <li key={item}>{item}</li>)}</ul></BriefingPreviewSection>
      </div>
    </article>
  </div>;
}

function BriefingPreviewSection({ title, children }) {
  return <section className="briefing-preview-section"><h3>{title}</h3>{children}</section>;
}
