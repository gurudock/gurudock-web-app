import React, { useEffect, useRef, useState } from "react";
import logoUrl from "./assets/gurudock-logo.png";
import { contentService } from "./services/contentService";
import { libraryService } from "./services/libraryService";
import { readAvailableContentCache, writeAvailableContentCache } from "./availableContentCache";
import { DocumentPreview, handleWorkspaceWheel, mapLibraryItem } from "./LibraryPage";
import { BriefingPreview } from "./BriefingPage";
import LibrarySidebar from "./LibrarySidebar";
import {
  readCachedLibraryDocument,
  readLibraryCache,
  updateCachedLibraryDocument,
  writeLibraryCache,
} from "./libraryCache";

function readHomeLibraryCache() {
  return readLibraryCache("").slice(0, 4).map(mapLibraryItem);
}

const createItems = [
  ["Question paper", "Exam-ready in minutes", "question"],
  ["Worksheet", "Practice sets by topic", "worksheet"],
  ["Lesson plan", "Period-wise plans", "lesson"],
  ["Assignment", "Homework tasks", "assignment"],
];

const classroomItems = [
  ["Students & marks", "Manage your classes and students"],
  ["Time table", "Plan your class schedule"],
  ["Tests", "Create tests and enter marks"],
];

export default function HomePage() {
  const [userName, setUserName] = useState(() => localStorage.getItem("user_name") || "Teacher");
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState("");
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [documentDetails, setDocumentDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [briefingForm, setBriefingForm] = useState({ className: "", subject: "", chapter: "" });
  const [briefingBoard, setBriefingBoard] = useState("");
  const [briefingCurriculum, setBriefingCurriculum] = useState({});
  const [briefingChapters, setBriefingChapters] = useState([]);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingChaptersLoading, setBriefingChaptersLoading] = useState(false);
  const [generatedBriefing, setGeneratedBriefing] = useState(null);
  const [briefingGenerationLoading, setBriefingGenerationLoading] = useState(false);
  const [briefingGenerationError, setBriefingGenerationError] = useState("");
  useEffect(() => {
    const syncUser = () => setUserName(localStorage.getItem("user_name") || "Teacher");
    window.addEventListener("auth-changed", syncUser);
    return () => window.removeEventListener("auth-changed", syncUser);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const applyCurriculum = (data) => {
      const nextBoard = Object.keys(data).includes("CBSE") ? "CBSE" : Object.keys(data)[0] || "";
      const grades = nextBoard ? Object.keys(data[nextBoard] || {}).sort((a, b) => Number(a) - Number(b)) : [];
      const nextClass = grades.includes("10") ? "Class 10" : grades[0] ? `Class ${grades[0]}` : "";
      const subjects = nextClass ? data[nextBoard]?.[nextClass.replace("Class ", "")] || [] : [];
      setBriefingCurriculum(data);
      setBriefingBoard(nextBoard);
      setBriefingForm((current) => ({ ...current, className: current.className || nextClass, subject: current.subject || subjects[0] || "" }));
    };
    const cachedCurriculum = readAvailableContentCache();
    if (cachedCurriculum) applyCurriculum(cachedCurriculum);
    const loadCurriculum = async () => {
      try {
        const data = await contentService.getAvailableContent({ signal: controller.signal });
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Unable to load curriculum.");
        writeAvailableContentCache(data);
        applyCurriculum(data);
      } catch (error) {
        if (error.name !== "AbortError") setBriefingLoading(false);
      } finally {
        if (!controller.signal.aborted) setBriefingLoading(false);
      }
    };
    loadCurriculum();
    return () => controller.abort();
  }, []);

  const briefingClassOptions = briefingBoard
    ? Object.keys(briefingCurriculum[briefingBoard] || {}).sort((a, b) => Number(a) - Number(b)).map((grade) => `Class ${grade}`)
    : [];
  const briefingSubjectOptions = briefingBoard
    ? briefingCurriculum[briefingBoard]?.[briefingForm.className.replace(/^Class\s+/, "")] || []
    : [];

  useEffect(() => {
    const grade = briefingForm.className.replace(/^Class\s+/i, "").trim();
    if (!briefingBoard || !grade || !briefingForm.subject) return undefined;
    const controller = new AbortController();
    const loadChapters = async () => {
      setBriefingChaptersLoading(true);
      try {
        const data = await contentService.getChaptersTopics(
          { board: briefingBoard, grade, subject: briefingForm.subject, book_name: "" },
          { signal: controller.signal },
        );
        const chaptersResponse = data?.chapters || data?.data?.chapters;
        if (!chaptersResponse || typeof chaptersResponse !== "object") throw new Error("Unable to load chapters.");
        const nextChapters = Object.keys(chaptersResponse);
        setBriefingChapters(nextChapters);
        setBriefingForm((current) => ({ ...current, chapter: nextChapters.includes(current.chapter) ? current.chapter : nextChapters[0] || "" }));
      } catch (error) {
        if (error.name !== "AbortError") setBriefingChapters([]);
      } finally {
        if (!controller.signal.aborted) setBriefingChaptersLoading(false);
      }
    };
    loadChapters();
    return () => controller.abort();
  }, [briefingBoard, briefingForm.className, briefingForm.subject]);

  useEffect(() => {
    let active = true;
    const cachedDocuments = readHomeLibraryCache();
    if (cachedDocuments.length) {
      setDocuments(cachedDocuments);
      setSelectedDocument(cachedDocuments[0]);
    }
    const loadDocuments = async () => {
      try {
        const data = await libraryService.list({ page: 1, limit: 4 });
        const nextDocuments = (data.items || []).map(mapLibraryItem);
        writeLibraryCache("", nextDocuments);
        if (active) setDocuments(nextDocuments);
      } catch (error) {
        if (active) setDocumentsError(error.message || "Unable to load documents.");
      } finally {
        if (active) setDocumentsLoading(false);
      }
    };
    loadDocuments();
    return () => { active = false; };
  }, []);

  const openDocument = async (document) => {
    const cachedDocument = readCachedLibraryDocument(document.id);
    const sourceDocument = { ...document, ...cachedDocument };
    const hasCachedContent = sourceDocument.body !== undefined
      || sourceDocument.data !== undefined
      || Array.isArray(sourceDocument.questions)
      || Array.isArray(sourceDocument.periods)
      || Array.isArray(sourceDocument.sections)
      || Array.isArray(sourceDocument.content);
    const cachedDetails = hasCachedContent
      ? {
        ...sourceDocument,
        body: sourceDocument.body ?? sourceDocument.data?.body ?? sourceDocument.data ?? sourceDocument.content,
        content_type: sourceDocument.content_type,
      }
      : null;
    setSelectedDocument(sourceDocument);
    setDocumentDetails(cachedDetails);
    setDetailsError("");
    setDetailsLoading(!cachedDetails);
    setPreviewOpen(true);
    try {
      const data = await libraryService.get(sourceDocument.content_type, sourceDocument.id);
      let body = data.body ?? data.data?.body ?? sourceDocument.body ?? sourceDocument.data?.body ?? sourceDocument.data;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { /* Keep text bodies unchanged. */ }
      }
      const nextDetails = {
        ...sourceDocument,
        ...data,
        body,
        content_type: data.content_type || sourceDocument.content_type,
      };
      setDocumentDetails(nextDetails);
      updateCachedLibraryDocument(nextDetails);
    } catch (error) {
      if (!cachedDetails) setDetailsError(error.message || "Unable to load document details.");
    } finally {
      if (!cachedDetails) setDetailsLoading(false);
    }
  };

  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const updateBriefingField = (field, value) => {
    setBriefingForm((current) => ({ ...current, [field]: value }));
  };

  const generateBriefing = async (event) => {
    event.preventDefault();
    setBriefingGenerationLoading(true);
    setBriefingGenerationError("");
    localStorage.setItem("briefing_context", JSON.stringify(briefingForm));
    try {
      const data = await contentService.pullBriefing({
          board: briefingBoard || "CBSE",
          class_level: briefingForm.className.replace(/^Class\s+/i, "").split("-")[0].trim(),
          subject: briefingForm.subject,
          chapter: briefingForm.chapter,
          language: "english",
          llm_provider: "anthropic",
          force_regenerate: true,
        });
      let cachedBriefings = [];
      try {
        const storedBriefings = JSON.parse(localStorage.getItem("gurudock_previous_briefings") || "[]");
        cachedBriefings = Array.isArray(storedBriefings) ? storedBriefings : [];
      } catch {
        cachedBriefings = [];
      }
      const nextBriefings = [{ ...data, generated_at: data.generated_at || new Date().toISOString() }, ...cachedBriefings.filter((item) => item.id !== data.id)].slice(0, 12);
      localStorage.setItem("gurudock_previous_briefings", JSON.stringify(nextBriefings));
      setGeneratedBriefing(data);
    } catch (error) {
      setBriefingGenerationError(error.message || "Unable to generate the briefing.");
    } finally {
      setBriefingGenerationLoading(false);
    }
  };

  return (
    <div className="home-app" onWheel={(event) => handleWorkspaceWheel(event, ".home-content")}>
      <LibrarySidebar activeItem="home" />
      <div className="home-main">
        <header className="home-topbar">
          <div>
            <span className="home-topbar-eyebrow">Teacher workspace</span>
            <h1>Home</h1>
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
        <main className="home-content">
          <section className="home-briefing-card">
            <div className="home-briefing-heading">
              <span className="home-briefing-mark" aria-hidden="true">✦</span>
              <div>
                <h2>Prepare today&apos;s briefing</h2>
                <p>Choose your class, subject and chapter to get a focused plan for the day.</p>
              </div>
            </div>
            <form className="home-briefing-form" onSubmit={generateBriefing}>
              <label>
                <span>Class</span>
                <HomeThemedSelect value={briefingForm.className} onChange={(nextClass) => {
                  const subjects = briefingCurriculum[briefingBoard]?.[nextClass.replace("Class ", "")] || [];
                  setBriefingForm((current) => ({ ...current, className: nextClass, subject: subjects[0] || "", chapter: "" }));
                }} options={[{ value: "", label: "Select class" }, ...briefingClassOptions]} ariaLabel="Select class" disabled={briefingLoading} />
              </label>
              <label>
                <span>Subject</span>
                <HomeThemedSelect value={briefingForm.subject} onChange={(subject) => setBriefingForm((current) => ({ ...current, subject, chapter: "" }))} options={[{ value: "", label: "Select subject" }, ...briefingSubjectOptions]} ariaLabel="Select subject" disabled={briefingLoading} />
              </label>
              <label>
                <span>Chapter</span>
                <HomeThemedSelect value={briefingForm.chapter} onChange={(chapter) => updateBriefingField("chapter", chapter)} options={[{ value: "", label: briefingChaptersLoading ? "Loading chapters..." : "Select chapter" }, ...briefingChapters]} ariaLabel="Select chapter" disabled={briefingChaptersLoading || !briefingChapters.length} />
              </label>
              <button className="home-briefing-button" type="submit">Generate briefing <b>→</b></button>
            </form>
          </section>

          <section className="home-section home-classes">
            <div className="home-section-heading"><div><h2>Create</h2><p>Start something new. Save time with ready-to-use tools.</p></div></div>
            <div className="home-class-grid">
              {createItems.map(([title, description, mode]) => (
                <a className="home-class-card home-action-card" href="/create" key={title} onClick={(event) => {
                  event.preventDefault();
                  window.dispatchEvent(new CustomEvent("navigate-create", { detail: { mode } }));
                }}>
                  <div><span className="home-card-icon"><HomeIcon type={title} /></span><strong>{title}</strong></div>
                  <small>{description}</small><span className="home-card-action">{title} <b>→</b></span>
                </a>
              ))}
            </div>
          </section>

          <section className="home-section home-classroom">
            <div className="home-section-heading"><div><h2>Your classroom</h2><p>Manage your class, track progress and stay connected.</p></div></div>
            <div className="home-classroom-grid">
              {classroomItems.map(([title, description]) => (
                <a className="home-classroom-card home-action-card" href={title === "Time table" ? "/timetable" : title === "Students & marks" ? "/students" : title === "Tests" ? "/tests" : "/library"} key={title} onClick={(event) => {
                  if (title !== "Time table" && title !== "Students & marks" && title !== "Tests") return;
                  event.preventDefault();
                  window.history.pushState({}, "", title === "Time table" ? "/timetable" : title === "Students & marks" ? "/students" : "/tests");
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }}>
                  <div><span className="home-card-icon"><HomeIcon type={title} /></span><strong>{title}</strong></div>
                  <small>{description}</small><span className="home-card-action">{title === "Students & marks" ? "View students" : title === "Time table" ? "Open time table" : title === "Tests" ? "View tests" : "Send a message"} <b>→</b></span>
                </a>
              ))}
            </div>
          </section>

          <section className="home-documents">
            <div className="home-section-heading">
              <div><h2>Recent documents</h2><p>Your latest work, all in one place.</p></div>
              <a href="/library">See all documents&nbsp; →</a>
            </div>
            <div className="home-documents-grid">
              {documentsLoading && !documents.length ? <p className="home-documents-status">Loading your documents...</p> : documentsError && !documents.length ? (
                <p className="home-documents-status error">{documentsError}</p>
              ) : documents.length === 0 ? (
                <p className="home-documents-status">No documents yet.</p>
              ) : documents.map((document) => (
                <button className="home-document-card" type="button" onClick={() => openDocument(document)} key={document.id}>
                  <span className="home-document-type"><HomeIcon type={document.content_type === "question_paper" ? "Question paper" : document.content_type} /> {formatDocumentType(document.content_type)}</span>
                  <strong>{document.title}</strong>
                  <small>{document.meta}</small>
                  <em>{document.date}</em>
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>
      {previewOpen && (
        <DocumentPreview
          document={selectedDocument}
          details={documentDetails}
          loading={detailsLoading}
          error={detailsError}
          onClose={() => setPreviewOpen(false)}
        />
      )}
      {briefingGenerationLoading && <div className="briefing-generation-backdrop" role="status" aria-live="polite">
        <div className="briefing-generation-dialog"><span className="briefing-generation-spinner" /><div><strong>Generating your briefing</strong><p>Preparing focused teaching notes for this chapter...</p></div></div>
      </div>}
      {briefingGenerationError && <div className="briefing-generation-backdrop" role="alert" onClick={() => setBriefingGenerationError("")}>
        <div className="briefing-generation-dialog briefing-generation-error" onClick={(event) => event.stopPropagation()}><strong>Unable to generate briefing</strong><p>{briefingGenerationError}</p><button type="button" onClick={() => setBriefingGenerationError("")}>Close</button></div>
      </div>}
      {generatedBriefing && !briefingGenerationLoading && <BriefingPreview briefing={generatedBriefing} onClose={() => setGeneratedBriefing(null)} />}
    </div>
  );
}

function HomeSection({ title, children }) {
  return (
    <section className="home-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function formatDocumentType(value) {
  const label = value ? value.replaceAll("_", " ") : "Document";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function HomeIcon({ type }) {
  const common = { viewBox: "0 0 26 26", fill: "none", "aria-hidden": "true" };
  if (type === "notification") {
    return <svg {...common} viewBox="0 0 20 20"><path d="M10 2.5C7.8 2.5 6 4.3 6 6.5V9.5C6 10.5 5.6 11.4 5 12.1L4.3 12.9C3.9 13.3 4.2 14 4.8 14H15.2C15.8 14 16.1 13.3 15.7 12.9L15 12.1C14.4 11.4 14 10.5 14 9.5V6.5C14 4.3 12.2 2.5 10 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M8.2 16.2C8.6 16.9 9.3 17.3 10 17.3C10.7 17.3 11.4 16.9 11.8 16.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
  }
  if (type === "check") {
    return <svg className="home-check" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#5F8A4C" /><path d="M4.5 8.2L6.8 10.5L11.5 5.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (type === "Students & marks") {
    return <svg {...common}><path d="M12 4L22 9L12 14L2 9L12 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M6 11V16C6 17.5 8.5 19 12 19C15.5 19 18 17.5 18 16V11" stroke="currentColor" strokeWidth="1.6" /></svg>;
  }
  if (type === "Time table") {
    return <svg {...common}><rect x="4" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M4 9.5H22M8.5 3V6.5M17.5 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
  }
  if (type === "Analytics") {
    return <svg {...common}><rect x="4" y="12" width="4" height="8" rx="1" fill="currentColor" /><rect x="10" y="7" width="4" height="13" rx="1" fill="currentColor" /><rect x="16" y="3" width="4" height="17" rx="1" fill="currentColor" /></svg>;
  }
  if (type === "Parent messages") {
    return <svg {...common}><path d="M4 5H20V15H9L5 19V15H4V5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
  }
  if (type === "Answer key") {
    return <svg {...common}><circle cx="9" cy="13" r="4.5" stroke="currentColor" strokeWidth="1.6" /><path d="M12.5 13H21M17.5 13V16M21 13V16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
  }
  if (type === "Lesson plan") {
    return <svg {...common}><rect x="4" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M4 9.5H22M8.5 3V6.5M17.5 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
  }
  if (type === "Assignment") {
    return <svg {...common}><rect x="5.5" y="4.5" width="15" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" /><rect x="9.5" y="3" width="7" height="3.5" rx="1" fill="currentColor" /><path d="M9 12H17M9 16H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
  }
  return <svg {...common}><rect x="5" y="3" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M9 9H17M9 13H17M9 17H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function HomeThemedSelect({ value, onChange, options, ariaLabel, disabled = false }) {
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
    <div className={`home-themed-select ${open ? "open" : ""}`} ref={rootRef}>
      <button type="button" className="home-themed-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
        <span className={value ? "" : "placeholder"}>{selectedLabel || "Select an option"}</span>
        <span className="home-themed-select-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="home-themed-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const normalized = typeof option === "string" ? { value: option, label: option } : option;
            const isSelected = normalized.value === value;
            return <button type="button" role="option" aria-selected={isSelected} className={`home-themed-select-option ${isSelected ? "selected" : ""}`} key={normalized.value || normalized.label} onClick={() => { onChange(normalized.value); setOpen(false); }}>{normalized.label}<span aria-hidden="true">{isSelected ? "✓" : ""}</span></button>;
          })}
        </div>
      ) : null}
    </div>
  );
}
