import React, { useEffect, useRef, useState } from "react";
import emptyLibraryUrl from "./assets/empty-library.png";
import libraryLoadingUrl from "./assets/library-loading.png";
import logoUrl from "./assets/gurudock-logo.png";
import { libraryService } from "./services/libraryService";
import AuthModal from "./AuthModal";
import LibrarySidebar from "./LibrarySidebar";
import { readCachedLibraryDocument, readLibraryCache, updateCachedLibraryDocument, writeLibraryCache } from "./libraryCache";

const LIBRARY_TYPE_FILTERS = [
  ["all", "All"],
  ["question_paper", "Question papers"],
  ["assignment", "Assignments"],
  ["worksheet", "Worksheets"],
  ["lesson_plan", "Lesson plans"],
];

function getServiceErrorMessage(error, fallback) {
  if (error?.code === "NETWORK_ERROR") return "Unable to connect to the library service. Try again later.";
  const detail = error?.details?.detail;
  if (error?.code === "HTTP_ERROR" && typeof detail !== "string") return fallback;
  return error?.message || fallback;
}

export default function LibraryPage() {
  const [userName, setUserName] = useState(() => localStorage.getItem("user_name") || "Teacher");
  const [query, setQuery] = useState("");
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [documentDetails, setDocumentDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const date = new Date();

  useEffect(() => {
    const syncUser = () => setUserName(localStorage.getItem("user_name") || "Teacher");
    window.addEventListener("auth-changed", syncUser);
    return () => window.removeEventListener("auth-changed", syncUser);
  }, []);

  useEffect(() => {
    if (!previewOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [previewOpen]);

  useEffect(() => {
    const controller = new AbortController();
    const loadLibrary = async () => {
      const normalizedQuery = query.trim();
      const cachedDocuments = readLibraryCache(normalizedQuery);
      if (cachedDocuments.length) {
        setDocuments(cachedDocuments);
        setSelectedDocument((current) =>
          cachedDocuments.find((item) => item.id === current?.id) || cachedDocuments[0] || null,
        );
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError("");
      const token = localStorage.getItem("access_token");
      if (!token) {
        setDocuments([]);
        setSelectedDocument(null);
        setError("Please log in to view your library.");
        setLoading(false);
        return;
      }

      try {
        const data = await libraryService.list({
          page: "1",
          limit: "100",
          ...(normalizedQuery ? { search: normalizedQuery } : {}),
        }, {
          signal: controller.signal,
        });
        const nextDocuments = (data.items || []).map(mapLibraryItem);
        writeLibraryCache(normalizedQuery, nextDocuments);
        setDocuments(nextDocuments);
        setSelectedDocument((current) =>
          nextDocuments.find((item) => item.id === current?.id) || nextDocuments[0] || null,
        );
      } catch (requestError) {
        if (requestError.name !== "AbortError") {
          if (cachedDocuments.length) {
            const errorMessage = requestError.code === "NETWORK_ERROR"
              ? "Unable to refresh your library."
              : getServiceErrorMessage(requestError, "Unable to refresh your library.");
            setError(`${errorMessage} Showing cached documents.`);
          } else {
            setDocuments([]);
            setSelectedDocument(null);
            setError(getServiceErrorMessage(requestError, "Unable to load your library."));
          }
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadLibrary();
    return () => controller.abort();
  }, [query]);

  const filteredDocuments = typeFilter === "all"
    ? documents
    : documents.filter((document) => document.content_type === typeFilter);
  const groupedDocuments = groupDocuments(filteredDocuments);
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const openDocument = async (document) => {
    const cachedDocument = readCachedLibraryDocument(document.id);
    const sourceDocument = { ...document, ...cachedDocument };
    setSelectedDocument(sourceDocument);
    setDocumentDetails(null);
    setDetailsError("");
    setDetailsLoading(true);
    setPreviewOpen(true);
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
    if (cachedDetails) {
      setDocumentDetails(cachedDetails);
      setDetailsLoading(false);
    }
    try {
      const data = await libraryService.get(sourceDocument.content_type, sourceDocument.id);
      let body = data.body ?? data.data?.body ?? sourceDocument.body ?? sourceDocument.data?.body ?? sourceDocument.data;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          // Keep non-JSON document bodies as text.
        }
      }
      const nextDetails = {
        ...sourceDocument,
        ...data,
        body,
        content_type: data.content_type || sourceDocument.content_type,
      };
      setDocumentDetails(nextDetails);
      updateCachedLibraryDocument(nextDetails);
    } catch (requestError) {
      if (!cachedDetails) {
        setDetailsError(getServiceErrorMessage(requestError, "Unable to load document details."));
      }
    } finally {
      if (!cachedDetails) setDetailsLoading(false);
    }
  };

  return (
    <div className="library-app" onWheel={(event) => handleWorkspaceWheel(event, ".library-content")}>
      <LibrarySidebar activeItem="library" />
      <div className="library-main">
        <header className="home-topbar library-topbar">
          <div>
            <span className="home-topbar-eyebrow">Teacher workspace</span>
            <h1>Library</h1>
          </div>
          <a className="home-mobile-brand" href="/home" aria-label="GuruDock home">
            <img src={logoUrl} alt="" />
            <strong>GuruDock</strong>
          </a>
          <input className="library-topbar-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents…" aria-label="Search documents" />
          <div className="home-topbar-user">
            <span className="home-avatar">{initials || "T"}</span>
            <strong>{userName}</strong>
          </div>
        </header>
        <main className="library-content">
          <nav className="library-type-tabs" aria-label="Filter documents by type">
            {LIBRARY_TYPE_FILTERS.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={typeFilter === value ? "active" : ""}
                onClick={() => setTypeFilter(value)}
                aria-pressed={typeFilter === value}
              >
                {label}
                <span>{value === "all" ? documents.length : documents.filter((document) => document.content_type === value).length}</span>
              </button>
            ))}
          </nav>
          <div className="library-document-groups">
            {loading ? (
              <section className="library-loading-state" aria-live="polite">
                <img src={libraryLoadingUrl} alt="Loading your library" />
                <h2>Loading your library...</h2>
                <p>Fetching your documents, lesson plans and more.<br />Please wait a moment.</p>
                <div className="library-loading-dots" aria-hidden="true">
                  <span className="active" />
                  <span />
                  <span />
                  <span />
                </div>
              </section>
            ) : !localStorage.getItem("access_token") ? (
              <section className="library-login-empty">
                <img src={emptyLibraryUrl} alt="" />
                <h2>Your library awaits</h2>
                <p>Log in to access your saved documents, lesson plans,<br />templates and more. Keep all your teaching resources<br />in one place.</p>
                <button type="button" onClick={() => setLoginOpen(true)}>↪ <span>Log in</span></button>
                <div className="library-login-divider"><span>or</span></div>
                <small>Don&apos;t have an account yet? Create one to start building<br />your library today.</small>
              </section>
            ) : error && !groupedDocuments.length ? <p className="library-empty">{error}</p> : groupedDocuments.length > 0 ? (
              <>
                {groupedDocuments.map((group) => (
              <section className="library-group" key={group.group}>
                <h2>{group.group}</h2>
                <div className="library-list">
                  {group.items.map((item) => (
                    <div
                      className="library-row"
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openDocument(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openDocument(item);
                        }
                      }}
                      aria-label={`Open ${item.title}`}
                    >
                      <div className="library-document-title">
                        <LibraryDocumentIcon type={item.type} />
                        <strong>{item.title}</strong>
                      </div>
                      <span className="library-document-type">{formatContentType(item.content_type)}</span>
                      <span>{item.meta}</span>
                      <small>{item.date}</small>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDocument(item);
                        }}
                      >
                        Open
                      </button>
                    </div>
                  ))}
                </div>
              </section>
                ))}
              </>
            ) : <p className="library-empty">
              {typeFilter === "all" ? "No documents match your search." : `No ${LIBRARY_TYPE_FILTERS.find(([value]) => value === typeFilter)?.[1].toLowerCase() || "documents"} found.`}
            </p>}
          </div>
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
      {loginOpen && (
        <AuthModal
          mode="login"
          onClose={() => setLoginOpen(false)}
          onAuthenticated={() => window.location.reload()}
        />
      )}
    </div>
  );
}

export function mapLibraryItem(item) {
  return {
    ...item,
    meta: [item.grade, item.subject].filter(Boolean).join(" · ") || "No subject",
    date: formatDocumentDate(item.updated_at || item.created_at),
    type: item.content_type === "question_paper" ? "paper" : item.content_type === "lesson_plan" ? "calendar" : item.content_type,
  };
}

function groupDocuments(documents) {
  const groups = new Map();
  documents.forEach((document) => {
    const group = isRecent(document.created_at) ? "This week" : "Earlier";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(document);
  });
  return Array.from(groups, ([group, items]) => ({ group, items }));
}

function isRecent(timestamp) {
  if (!timestamp) return false;
  return Date.now() - new Date(timestamp).getTime() <= 7 * 24 * 60 * 60 * 1000;
}

function formatDocumentDate(timestamp) {
  if (!timestamp) return "Unknown date";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function handleWorkspaceWheel(event, contentSelector) {
  if (event.target.closest(contentSelector)) return;
  const content = event.currentTarget.querySelector(contentSelector);
  content?.scrollBy({ top: event.deltaY, left: event.deltaX });
}

function LibraryDocumentIcon({ type }) {
  return <span className={`library-document-icon ${type}`} aria-hidden="true">{type === "calendar" ? "□" : type === "key" ? "⌕" : "▤"}</span>;
}

export function DocumentPreview({ document, details, loading, error, onClose }) {
  const questions = details?.questions || [];
  const [pdfUrl, setPdfUrl] = useState(details?.pdf_download_url || "");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfTitleOpen, setPdfTitleOpen] = useState(false);
  const [pdfTitle, setPdfTitle] = useState("");
  const [docxUrl, setDocxUrl] = useState("");
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState("");
  const [answerKey, setAnswerKey] = useState(null);
  const [answerKeyLoading, setAnswerKeyLoading] = useState(false);
  const [answerKeyError, setAnswerKeyError] = useState("");
  const [answerKeyPdfUrl, setAnswerKeyPdfUrl] = useState("");
  const [answerKeyPdfLoading, setAnswerKeyPdfLoading] = useState(false);
  const [answerKeyPdfError, setAnswerKeyPdfError] = useState("");
  const [lessonPlanEditing, setLessonPlanEditing] = useState(false);
  const [lessonPlanForm, setLessonPlanForm] = useState(() => createLessonPlanForm(details));
  const [lessonPlanSaving, setLessonPlanSaving] = useState(false);
  const [lessonPlanError, setLessonPlanError] = useState("");
  const [lessonPlanMessage, setLessonPlanMessage] = useState("");
  const answerKeySectionRef = useRef(null);
  const canCreateAnswerKey = ["worksheet", "assignment", "question_paper"].includes(details?.content_type);

  useEffect(() => {
    if (!answerKey) return;
    const frame = requestAnimationFrame(() => {
      answerKeySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [answerKey]);
  const lessonPlanDetails = details?.content_type === "lesson_plan"
    ? { ...details, ...lessonPlanForm, body: lessonPlanForm }
    : details;
  const periods = details?.content_type === "lesson_plan" && Array.isArray(lessonPlanDetails.body?.periods)
    ? lessonPlanDetails.body.periods
    : [];

  useEffect(() => {
    setLessonPlanForm(createLessonPlanForm(details));
    setLessonPlanEditing(false);
    setLessonPlanError("");
    setLessonPlanMessage("");
  }, [details]);
  const downloads = [
    ["Download PDF", details?.pdf_download_url],
    ["Download answer key", details?.answer_key_download_url],
  ].filter(([, url]) => url);

  const openPdfTitleDialog = () => {
    setPdfTitle(details?.title || document?.title || "");
    setPdfError("");
    setPdfTitleOpen(true);
  };

  const createPdf = async (event) => {
    event?.preventDefault();
    const title = pdfTitle.trim();
    if (!title) {
      setPdfError("Please enter a title for the PDF.");
      return;
    }

    setPdfTitleOpen(false);
    setPdfLoading(true);
    setPdfError("");
    try {
      const data = await libraryService.generatePdf({
        content_type: details.content_type,
        content_id: details.id || document.id,
        title,
      });
      if (!data.download_url) throw new Error("PDF was created but no download link was returned.");
      setPdfUrl(data.download_url);
    } catch (requestError) {
      setPdfError(getServiceErrorMessage(requestError, "Unable to create PDF."));
    } finally {
      setPdfLoading(false);
    }
  };

  const createDocx = async () => {
    setDocxLoading(true);
    setDocxError("");
    try {
      const data = await libraryService.generateDocx({
        content_type: details.content_type,
        content_id: details.id || document.id,
      });
      const downloadUrl = data.download_url || data.docx_download_url;
      if (!downloadUrl) throw new Error("DOCX was created but no download link was returned.");
      setDocxUrl(downloadUrl);
    } catch (requestError) {
      setDocxError(getServiceErrorMessage(requestError, "Unable to create DOCX."));
    } finally {
      setDocxLoading(false);
    }
  };

  const createAnswerKey = async () => {
    setAnswerKeyLoading(true);
    setAnswerKeyError("");
    try {
      const data = await libraryService.generateAnswerKey({
        content_type: details.content_type,
        content_id: details.id || document.id,
      });
      if (!Array.isArray(data.data?.answers)) {
        throw new Error("Answer key was created but no answers were returned.");
      }
      setAnswerKey({ ...data.data, answer_key_id: data.answer_key_id });
    } catch (requestError) {
      setAnswerKeyError(getServiceErrorMessage(requestError, "Unable to create answer key."));
    } finally {
      setAnswerKeyLoading(false);
    }
  };

  const createAnswerKeyPdf = async () => {
    setAnswerKeyPdfLoading(true);
    setAnswerKeyPdfError("");
    try {
      const data = await libraryService.generatePdf({
        content_type: "answer_key",
        content_id: answerKey.answer_key_id,
      });
      if (!data.download_url) throw new Error("Answer key PDF was created but no download link was returned.");
      setAnswerKeyPdfUrl(data.download_url);
    } catch (requestError) {
      setAnswerKeyPdfError(getServiceErrorMessage(requestError, "Unable to create answer key PDF."));
    } finally {
      setAnswerKeyPdfLoading(false);
    }
  };

  const saveLessonPlan = async () => {
    setLessonPlanSaving(true);
    setLessonPlanError("");
    setLessonPlanMessage("");
    try {
      const lessonPlanId = details.id || details.content_id || document?.id;
      if (!lessonPlanId) throw new Error("This lesson plan has no content ID to update.");
      const data = await libraryService.updateLessonPlan(lessonPlanId, { body: lessonPlanForm });
      const updatedBody = data.body || data.data?.body || lessonPlanForm;
      setLessonPlanForm(updatedBody);
      updateCachedLibraryDocument({
        ...details,
        title: updatedBody.title || details.title,
        updated_at: new Date().toISOString(),
      });
      setLessonPlanEditing(false);
      setLessonPlanMessage("Lesson plan saved");
    } catch (requestError) {
      setLessonPlanError(getServiceErrorMessage(requestError, "Unable to save lesson plan."));
    } finally {
      setLessonPlanSaving(false);
    }
  };

  return (
    <div
      className="document-preview-backdrop"
      onClick={() => {
        if (!lessonPlanEditing) onClose();
      }}
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
    >
      <article className="document-preview" onClick={(event) => event.stopPropagation()}>
        <header className="document-preview-header">
          <div>
            <span className="document-preview-type">{formatContentType(details?.content_type)}</span>
            <h2>{details?.title || document?.title}</h2>
            <p>{[details?.subject, details?.grade, details?.board].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="document-preview-actions">
          {!loading && details?.content_type === "lesson_plan" && (
            <button
              className="document-preview-edit-button"
              type="button"
              onClick={() => {
                setLessonPlanError("");
                setLessonPlanMessage("");
                setLessonPlanEditing((current) => !current);
              }}
            >
              {lessonPlanEditing ? "Cancel edit" : "Edit lesson plan"}
            </button>
          )}
            {!loading && pdfUrl ? (
              <a className="document-preview-pdf-button" href={pdfUrl} download="gurudock-document.pdf">Download PDF</a>
            ) : !loading && (
              <button className="document-preview-pdf-button" type="button" onClick={openPdfTitleDialog} disabled={pdfLoading}>
                {pdfLoading ? "Creating PDF…" : "Create PDF"}
              </button>
            )}
            {!loading && docxUrl ? (
              <a className="document-preview-docx-button" href={docxUrl} download="gurudock-document.docx">Download DOCX</a>
            ) : !loading && (
              <button className="document-preview-docx-button" type="button" onClick={createDocx} disabled={docxLoading}>
                {docxLoading ? "Creating DOCX…" : "Create DOCX"}
              </button>
            )}
            {!loading && canCreateAnswerKey && (
              <button className="document-preview-answer-key-button" type="button" onClick={createAnswerKey} disabled={answerKeyLoading}>
                {answerKeyLoading ? "Creating Answer Key…" : answerKey ? "Answer Key Created" : "Create Answer Key"}
              </button>
            )}
            <button className="document-preview-close" type="button" onClick={onClose} aria-label="Close preview">×</button>
          </div>
        </header>
        {error && <p className="document-preview-error">{error}</p>}
        {pdfError && <p className="document-preview-error">{pdfError}</p>}
        {docxError && <p className="document-preview-error">{docxError}</p>}
        {lessonPlanError && <p className="document-preview-error">{lessonPlanError}</p>}
        {lessonPlanMessage && <p className="document-preview-success">{lessonPlanMessage}</p>}
        {answerKeyError && <p className="document-preview-error">{answerKeyError}</p>}
        {answerKeyPdfError && <p className="document-preview-error">{answerKeyPdfError}</p>}
        <div className={`document-preview-body${loading || error ? " document-preview-loading-body" : ""}`}>
          {loading ? (
            <div className="document-preview-loading" aria-live="polite">
              <div className="document-preview-spinner" aria-hidden="true" />
              <h3>Loading document...</h3>
              <p>Fetching the document content. Please wait a moment.</p>
            </div>
          ) : error ? (
            <div className="document-preview-loading">
              <h3>Unable to load document</h3>
              <p>Close this preview and try opening the document again.</p>
            </div>
          ) : (
            <>
            {details?.content_type === "lesson_plan" ? (
            lessonPlanEditing ? (
              <LessonPlanEditor
                value={lessonPlanForm}
                onChange={setLessonPlanForm}
                onSave={saveLessonPlan}
                saving={lessonPlanSaving}
              />
            ) : (
              <LessonPlanDetails details={lessonPlanDetails} periods={periods} />
            )
          ) : details?.content_type === "question_paper" ? (
            <QuestionPaperPreview details={details} />
          ) : details?.content_type === "worksheet" ? (
            <WorksheetPreview details={details} />
          ) : details?.content_type === "assignment" ? (
            <AssignmentPreview details={details} />
          ) : (
            <>
              {details?.description && <p className="preview-description">{details.description}</p>}
              {details?.body && (
                <div className="library-detail-body">
                  {typeof details.body === "string" ? details.body : JSON.stringify(details.body, null, 2)}
                </div>
              )}
            </>
          )}
          {answerKey && (
            <AnswerKeyPreview
              data={answerKey}
              sectionRef={answerKeySectionRef}
              pdfUrl={answerKeyPdfUrl}
              pdfLoading={answerKeyPdfLoading}
              onCreatePdf={createAnswerKeyPdf}
            />
          )}
          </>
          )}
        </div>
        {downloads.length > 0 && (
          <footer className="document-preview-footer">
            {downloads.map(([label, url]) => (
              <a key={label} href={url} download={label.toLowerCase().includes("answer") ? "gurudock-answer-key.pdf" : "gurudock-document.pdf"}>
                {label}
              </a>
            ))}
          </footer>
        )}
      </article>
      {pdfTitleOpen && (
        <div
          className="pdf-title-dialog-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            setPdfTitleOpen(false);
          }}
        >
          <form className="pdf-title-dialog" onSubmit={createPdf} onClick={(event) => event.stopPropagation()}>
            <h2>Name your PDF</h2>
            <p>Give this document a clear title before creating the PDF.</p>
            <label htmlFor="pdf-title">PDF title</label>
            <input
              id="pdf-title"
              value={pdfTitle}
              onChange={(event) => setPdfTitle(event.target.value)}
              placeholder="e.g. Class 10 Mathematics Assignment"
              autoFocus
              maxLength={160}
            />
            {pdfError && <span className="pdf-title-dialog-error">{pdfError}</span>}
            <div className="pdf-title-dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setPdfTitleOpen(false)}>Cancel</button>
              <button type="submit" className="primary-button">Create PDF</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function AnswerKeyPreview({ data, sectionRef, pdfUrl, pdfLoading, onCreatePdf }) {
  const answers = Array.isArray(data?.answers) ? data.answers : [];

  return (
    <section className="answer-key-preview" ref={sectionRef}>
      <div className="answer-key-header">
        <h3>Answer Key</h3>
        {pdfUrl ? (
          <a className="document-preview-pdf-button" href={pdfUrl} download="gurudock-answer-key.pdf">
            Download Answer Key PDF
          </a>
        ) : (
          <button className="document-preview-pdf-button" type="button" onClick={onCreatePdf} disabled={pdfLoading}>
            {pdfLoading ? "Creating PDF…" : "Create Answer Key PDF"}
          </button>
        )}
      </div>
      {answers.length === 0 ? (
        <p className="library-empty">No answers were returned.</p>
      ) : (
        <div className="answer-key-answers">
          {answers.map((item, index) => (
            <article className="answer-key-answer" key={item.question_number || index}>
              <strong>{item.question_number || index + 1}.</strong>
              <div>
                {item.question && <p className="answer-key-question">{item.question}</p>}
                <p><strong>Answer:</strong> {item.answer || "Answer not provided."}</p>
                {(item.correct_option_number || item.correct_option) && (
                  <p className="answer-key-correct-option">
                    <strong>Correct option:</strong>{" "}
                    {[item.correct_option_number, item.correct_option].filter(Boolean).join(" — ")}
                  </p>
                )}
                {Array.isArray(item.sub_answers) && item.sub_answers.length > 0 && (
                  <div className="answer-key-subanswers">
                    <strong>Sub-answers:</strong>
                    <ul>
                      {item.sub_answers.map((subAnswer, subIndex) => (
                        <li key={subIndex}>
                          {typeof subAnswer === "string"
                            ? subAnswer
                            : subAnswer.answer || subAnswer.correct_option || JSON.stringify(subAnswer)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {item.explanation && <small>{item.explanation}</small>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AssignmentPreview({ details }) {
  const questions = Array.isArray(details.questions) ? details.questions : [];
  const totalMarks = questions.reduce((total, question) => total + (question.marks || 0), 0);

  return (
    <div className="assignment-preview">
      <div className="assignment-meta">
        <span><strong>Subject</strong>{details.subject || "N/A"}</span>
        <span><strong>Grade</strong>{details.grade || "N/A"}</span>
        <span><strong>Board</strong>{details.board || "N/A"}</span>
        <span><strong>Language</strong>{details.language || "English"}</span>
        <span><strong>Questions</strong>{questions.length}</span>
        <span><strong>Total marks</strong>{details.total_marks ?? totalMarks ?? "N/A"}</span>
      </div>
      {Array.isArray(details.instructions) && details.instructions.length > 0 && (
        <div className="assignment-instructions">
          <strong>Instructions</strong>
          <ul>{details.instructions.map((instruction, index) => <li key={`${instruction}-${index}`}>{instruction}</li>)}</ul>
        </div>
      )}
      {details.description && <p className="preview-description">{details.description}</p>}
      {questions.length === 0 ? (
        <p className="library-empty">No questions are available for this assignment.</p>
      ) : (
        <div className="assignment-questions">
          {questions.map((question, index) => (
            <article className="assignment-question" key={question.id || index}>
              <div className="assignment-question-heading">
                <strong>{index + 1}.</strong>
                <span>{question.question}</span>
                {question.marks != null && <small>{question.marks} marks</small>}
              </div>
              {question.options?.length > 0 && (
                <ul className="assignment-options">
                  {question.options.map((option, optionIndex) => (
                    <li key={`${option}-${optionIndex}`}><strong>{String.fromCharCode(65 + optionIndex)})</strong> {option}</li>
                  ))}
                </ul>
              )}
              {Array.isArray(question.subquestions) && question.subquestions.length > 0 && (
                <ol className="assignment-subquestions" type="i">
                  {question.subquestions.map((subquestion, subIndex) => (
                    <li key={`${subquestion}-${subIndex}`}>{subquestion}</li>
                  ))}
                </ol>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function WorksheetPreview({ details }) {
  const body = details.body && typeof details.body === "object" ? details.body : {};
  const questions = Array.isArray(details.questions)
    ? details.questions
    : Array.isArray(body.questions)
      ? body.questions
      : [];
  const instructions = details.instructions || body.instructions;

  return (
    <div className="worksheet-preview">
      <div className="worksheet-meta">
        <span><strong>Subject</strong>{details.subject || "N/A"}</span>
        <span><strong>Class</strong>{body.class_level || details.class_level || details.grade || "N/A"}</span>
        <span><strong>Board</strong>{details.board || "N/A"}</span>
        <span><strong>Chapter</strong>{details.chapter || "N/A"}</span>
        <span><strong>Difficulty</strong>{details.difficulty || "N/A"}</span>
        <span><strong>Total marks</strong>{details.total_marks ?? "N/A"}</span>
      </div>
      {instructions && (
        <p className="worksheet-instructions">
          <strong>Instructions:</strong> {instructions}
        </p>
      )}
      {questions.length === 0 ? (
        <p className="library-empty">No questions are available for this worksheet.</p>
      ) : (
        <div className="worksheet-questions">
          {questions.map((question, index) => (
            <article className="worksheet-question" key={question.question_number || index}>
              <div className="worksheet-question-heading">
                <strong>{question.question_number || index + 1}.</strong>
                <span>{question.question}</span>
                {question.marks != null && <small>{question.marks} marks</small>}
              </div>
              {question.options?.length > 0 && (
                <ul className="worksheet-options">
                  {question.options.map((option, optionIndex) => (
                    <li key={`${option}-${optionIndex}`}>
                      <strong>{String.fromCharCode(65 + optionIndex)})</strong>{" "}
                      {String(option).replace(/^[A-D][.)]\s*/i, "")}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
      {(body.num_questions != null || questions.length > 0) && (
        <small className="question-paper-count">{body.num_questions ?? questions.length} questions</small>
      )}
    </div>
  );
}

function QuestionPaperPreview({ details }) {
  const sections = Array.isArray(details.sections) ? details.sections : [];
  const totalQuestions = sections.reduce((total, section) => total + (section.questions?.length || 0), 0);

  return (
    <div className="question-paper-preview">
      <div className="question-paper-meta">
        <span><strong>Subject</strong>{details.subject || "N/A"}</span>
        <span><strong>Grade</strong>{details.grade || "N/A"}</span>
        <span><strong>Board</strong>{details.board || "N/A"}</span>
        <span><strong>Maximum marks</strong>{details.max_marks ?? "N/A"}</span>
        <span><strong>Duration</strong>{details.duration || "N/A"}</span>
        <span><strong>Difficulty</strong>{details.difficulty || "N/A"}</span>
      </div>
      {details.chapters && Object.keys(details.chapters).length > 0 && (
        <PreviewObject data={{ chapters: details.chapters }} />
      )}
      {sections.length === 0 ? (
        <p className="library-empty">No sections are available for this question paper.</p>
      ) : (
        <div className="question-paper-sections">
          {sections.map((section, sectionIndex) => (
            <section className="question-paper-section" key={section.section_name || sectionIndex}>
              <header>
                <div>
                  <h3>{section.section_name || `Section ${sectionIndex + 1}`}</h3>
                  {section.instruction && <p>{section.instruction}</p>}
                </div>
                <span>
                  {section.questions_to_attempt ?? section.total_questions ?? section.questions?.length ?? 0} × {section.marks_per_question ?? 0} marks
                </span>
              </header>
              {section.questions?.map((question, questionIndex) => (
                <QuestionPaperQuestion
                  key={question.question_number || questionIndex}
                  question={question}
                  fallbackNumber={questionIndex + 1}
                />
              ))}
            </section>
          ))}
        </div>
      )}
      {totalQuestions > 0 && <small className="question-paper-count">{totalQuestions} questions</small>}
    </div>
  );
}

function QuestionPaperQuestion({ question, fallbackNumber }) {
  const subquestions = Array.isArray(question.subquestions) ? question.subquestions : [];
  return (
    <article className="question-paper-question">
      <div className="question-paper-question-text">
        <strong>{question.question_number || fallbackNumber}.</strong>
        <span>{question.question}</span>
        <small>{question.marks != null ? `${question.marks} marks` : ""}</small>
      </div>
      {question.options?.length > 0 && (
        <ul className="question-paper-options">
          {question.options.map((option, index) => (
            <li key={`${option}-${index}`}>
              <strong>{String.fromCharCode(65 + index)})</strong>{" "}
              {String(option).replace(/^[A-D][.)]\s*/i, "")}
            </li>
          ))}
        </ul>
      )}
      {subquestions.length > 0 && (
        <ol className="question-paper-subquestions" type="i">
          {subquestions.map((subquestion, index) => <li key={`${subquestion}-${index}`}>{subquestion}</li>)}
        </ol>
      )}
    </article>
  );
}

function PreviewQuestions({ questions }) {
  return (
    <div className="preview-questions">
      <h3>Questions</h3>
      {questions.map((question, index) => (
        <article key={question.id || index}>
          <strong>{index + 1}. {question.question}</strong>
          {question.options?.length > 0 && <ul>{question.options.map((option) => <li key={option}>{option}</li>)}</ul>}
          {question.answer && <p><strong>Answer:</strong> {question.answer}</p>}
          {question.marks != null && <small>{question.marks} marks</small>}
        </article>
      ))}
    </div>
  );
}

function PreviewObject({ data }) {
  const excluded = new Set(["id", "content_type", "title", "subject", "grade", "board", "language", "body"]);
  return (
    <div className="preview-object">
      {Object.entries(data).filter(([key, value]) => !excluded.has(key) && value != null).map(([key, value]) => (
        <div key={key}><strong>{key.replaceAll("_", " ")}</strong><span>{typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}</span></div>
      ))}
    </div>
  );
}

function formatContentType(value) {
  return value ? value.replaceAll("_", " ") : "Document";
}

function createLessonPlanForm(details) {
  const body = details?.body && typeof details.body === "object" ? details.body : {};
  return {
    title: body.title || details?.title || "",
    cbse_objectives: Array.isArray(details?.cbse_objectives)
      ? details.cbse_objectives
      : Array.isArray(body.cbse_objectives) ? body.cbse_objectives : [],
    periods: Array.isArray(body.periods) ? body.periods.map((period, index) => ({
      sub_topic: period.sub_topic || "",
      period_number: period.period_number || index + 1,
      duration_minutes: period.duration_minutes ?? "",
      assessment_method: period.assessment_method || "",
      learning_outcomes: Array.isArray(period.learning_outcomes) ? period.learning_outcomes : [],
      teaching_activity: period.teaching_activity || "",
      resources_required: Array.isArray(period.resources_required) ? period.resources_required : [],
      board_notes_summary: period.board_notes_summary || "",
    })) : [],
  };
}

function LessonPlanEditor({ value, onChange, onSave, saving }) {
  const updateField = (field, nextValue) => onChange({ ...value, [field]: nextValue });
  const updatePeriod = (index, field, nextValue) => {
    const periods = value.periods.map((period, periodIndex) =>
      periodIndex === index ? { ...period, [field]: nextValue } : period,
    );
    onChange({ ...value, periods });
  };
  const updatePeriodList = (index, field, text) => {
    updatePeriod(index, field, text.split("\n").map((item) => item.trim()).filter(Boolean));
  };

  return (
    <div className="lesson-plan-editor">
      <div className="lesson-plan-editor-grid">
        <LessonPlanInput label="Title" value={value.title} onChange={(next) => updateField("title", next)} />
      </div>
      <LessonPlanTextarea
        label="CBSE objectives (one per line)"
        value={value.cbse_objectives.join("\n")}
        onChange={(next) => updateField(
          "cbse_objectives",
          next.split("\n").map((item) => item.trim()).filter(Boolean),
        )}
      />
      <div className="lesson-plan-editor-periods">
        <h3>Periods</h3>
        {value.periods.map((period, index) => (
          <section className="lesson-plan-editor-period" key={period.period_number || index}>
            <h4>Period {period.period_number || index + 1}</h4>
            <LessonPlanInput label="Sub-topic" value={period.sub_topic} onChange={(next) => updatePeriod(index, "sub_topic", next)} />
            <LessonPlanInput label="Duration (minutes)" type="number" value={period.duration_minutes} onChange={(next) => updatePeriod(index, "duration_minutes", next === "" ? "" : Number(next))} />
            <LessonPlanTextarea label="Learning outcomes (one per line)" value={period.learning_outcomes.join("\n")} onChange={(next) => updatePeriodList(index, "learning_outcomes", next)} />
            <LessonPlanTextarea label="Teaching activity" value={period.teaching_activity} onChange={(next) => updatePeriod(index, "teaching_activity", next)} />
            <LessonPlanTextarea label="Resources required (one per line)" value={period.resources_required.join("\n")} onChange={(next) => updatePeriodList(index, "resources_required", next)} />
            <LessonPlanTextarea label="Assessment method" value={period.assessment_method} onChange={(next) => updatePeriod(index, "assessment_method", next)} />
            <LessonPlanTextarea label="Board notes summary" value={period.board_notes_summary} onChange={(next) => updatePeriod(index, "board_notes_summary", next)} />
          </section>
        ))}
      </div>
      <button className="document-preview-pdf-button lesson-plan-save-button" type="button" onClick={onSave} disabled={saving}>
        {saving ? "Saving lesson plan…" : "Save lesson plan"}
      </button>
    </div>
  );
}

function LessonPlanInput({ label, type = "text", value, onChange }) {
  return (
    <label className="lesson-plan-editor-field">
      <span>{label}</span>
      <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function LessonPlanTextarea({ label, value, onChange }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <label className="lesson-plan-editor-field">
      <span>{label}</span>
      <textarea
        ref={textareaRef}
        rows="1"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function LessonPlanDetails({ details, periods }) {
  return (
    <div className="lesson-plan-details">
      {details.body?.title && <h3>{details.body.title}</h3>}
      <div className="lesson-plan-meta">
        <div>
        <span><strong>Subject</strong>{details.subject || "N/A"}</span>
        <span><strong>Class</strong>{details.class_level || details.grade || "N/A"}</span>
        <span><strong>Board</strong>{details.board || "N/A"}</span>
        <span><strong>Chapter</strong>{details.chapter || "N/A"}</span>
        <span><strong>Language</strong>{details.language || "English"}</span>
        <span><strong>Difficulty</strong>{details.difficulty || "N/A"}</span>
        </div>
      </div>
      <div className="lesson-plan-summary">
        <span><strong>{details.num_periods || periods.length}</strong> periods</span>
        <span><strong>{details.cbse_objectives?.length || 0}</strong> CBSE objectives</span>
        {details.is_customized && <span className="lesson-plan-customized">Customized</span>}
      </div>
      {periods.map((period) => (
        <article className="lesson-period" key={period.period_number}>
          <div className="lesson-period-heading">
            <strong>Period {period.period_number}: {period.sub_topic}</strong>
            <small>{period.duration_minutes} minutes</small>
          </div>
          {period.learning_outcomes?.length > 0 && (
            <LessonPlanList label="Learning outcomes" items={period.learning_outcomes} />
          )}
          {period.teaching_activity && <p><strong>Teaching activity:</strong> {period.teaching_activity}</p>}
          {period.resources_required?.length > 0 && (
            <LessonPlanList label="Resources" items={period.resources_required} />
          )}
          {period.assessment_method && <p><strong>Assessment:</strong> {period.assessment_method}</p>}
          {period.board_notes_summary && <p><strong>Board notes:</strong> {period.board_notes_summary}</p>}
        </article>
      ))}
      {details.cbse_objectives?.length > 0 && (
        <section className="cbse-objectives">
          <div className="cbse-objectives-heading">
            <span>CBSE alignment</span>
            <h3>Learning objectives</h3>
            <p>What students should understand and demonstrate after this lesson.</p>
          </div>
          <ol>
            {details.cbse_objectives.map((objective, index) => (
              <li key={objective}>
                <span>{index + 1}</span>
                <p>{objective}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {details.blooms_tags?.length > 0 && (
        <div className="lesson-plan-tags">
          <strong>Bloom’s taxonomy</strong>
          <div>{details.blooms_tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        </div>
      )}
    </div>
  );
}

function LessonPlanList({ label, items }) {
  return (
    <div className="lesson-plan-list">
      <strong>{label}</strong>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}
