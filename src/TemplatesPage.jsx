import React, { useEffect, useState } from "react";
import { handleWorkspaceWheel } from "./LibraryPage";
import LibrarySidebar from "./LibrarySidebar";
import logoUrl from "./assets/gurudock-logo.png";

const templates = [
  { name: "Greenwood Standard", description: "Mid-term & final layout · used 14 times", lastUsed: "Last used 3 days ago", featured: true },
  { name: "CBSE Board Format", description: "Official header · used 8 times", lastUsed: "Last used 2 weeks ago" },
];

export default function TemplatesPage() {
  const [saved, setSaved] = useState(false);
  const [userName, setUserName] = useState(() => localStorage.getItem("user_name") || "Teacher");
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  useEffect(() => {
    const syncUser = () => setUserName(localStorage.getItem("user_name") || "Teacher");
    window.addEventListener("auth-changed", syncUser);
    return () => window.removeEventListener("auth-changed", syncUser);
  }, []);

  return (
    <div className="template-app" onWheel={(event) => handleWorkspaceWheel(event, ".template-content")}>
      <LibrarySidebar activeItem="templates" />
      <div className="template-main">
        <header className="home-topbar template-home-topbar">
          <div>
            <span className="home-topbar-eyebrow">Teacher workspace</span>
            <h1>Templates</h1>
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
        <main className="template-content">
          <p className="template-intro">Upload an old paper and reuse its layout — school name, header, footer, exam type, marks scheme. New generations inherit the template automatically.</p>
          <div className="template-grid">
            {templates.map((template) => <TemplateCard key={template.name} {...template} />)}
            <button className="template-card template-upload-card" type="button">
              <span className="template-plus">+</span>
              <strong>Upload a paper</strong>
              <span>Extract its layout as a new template</span>
            </button>
          </div>
          <section className="template-review">
            <h2>Review extracted template</h2>
            <div className="template-review-card">
              <div>
                <h3>Detected fields</h3>
                <div className="template-fields">
                  <TemplateField label="School name" value="Greenwood Public School" />
                  <TemplateField label="Exam type" value="Mid-Term Examination" />
                  <TemplateField label="Marks scheme" value="1 / 3 / 5 mark split" />
                </div>
                <button className="template-save-button" type="button" onClick={() => setSaved(true)}>{saved ? "Template saved" : "Save template"}</button>
              </div>
              <TemplatePreview />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function TemplateCard({ name, description, lastUsed, featured = false }) {
  return (
    <article className="template-card">
      <div className={`template-icon ${featured ? "featured" : ""}`} aria-hidden="true">▤</div>
      <strong>{name}</strong>
      <span>{description}</span>
      <small>{lastUsed}</small>
    </article>
  );
}

function TemplateField({ label, value }) {
  return <div className="template-field"><span>{label}</span><strong>{value}</strong></div>;
}

function TemplatePreview() {
  return (
    <div className="template-preview">
      <strong>Greenwood Public School</strong>
      <span>Mid-Term Examination</span>
      <i />
      <small>— extracted layout preview —</small>
    </div>
  );
}
