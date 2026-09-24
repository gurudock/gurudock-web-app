import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import logoUrl from "./assets/gurudock-logo.png";
import LibraryPage from "./LibraryPage";
import TemplatesPage from "./TemplatesPage";
import BriefingPage from "./BriefingPage";
import ProfilePage from "./ProfilePage";
import CreatePage from "./CreatePage";
import HomePage from "./HomePage";
import TimetablePage from "./TimetablePage";
import StudentsPage from "./StudentsPage";
import TestsPage from "./TestsPage";
import AuthModal from "./AuthModal";
import AuthRequiredPage from "./AuthRequiredPage";
import { validateStoredSession } from "./apiClient";
import "./styles.css";

const navItems = [
  ["Features", "#features"],
  ["Examples", "#examples"],
  ["How it works", "#how-it-works"],
  ["Community", "#community"],
  ["Pricing", "#pricing"],
  ["FAQ", "#faq"],
];

const pillars = [
  ["Brief", "Know exactly what to teach today, automatically."],
  ["Create", "A first draft of any classroom document, in minutes."],
  ["Connect", "Reach parents and colleagues without extra typing."],
  ["Track", "See how your class is really doing."],
];

const generators = [
  ["Question papers", "full exam papers with custom sections, marks distribution, and difficulty, ready to export"],
  ["Worksheets", "MCQs, fill-in-the-blanks, match-the-column, short answer, and activity sheets; generate easy, medium, and hard versions of the same worksheet at once"],
  ["Lesson plans", "a ready starting point for every chapter you teach, which you edit and make your own"],
  ["Assignments", "homework sets mixing question types, matched to your syllabus"],
  ["Answer keys", "generated from any paper or worksheet, including multi-part and MCQ answers"],
  ["Diagrams included", "circuits, ray diagrams, chemical structures, and labeled biology figures, generated correctly wherever a question needs one"],
];

const examples = [
  {
    title: "Class 10 Science question paper",
    link: "Full PDF preview",
    desc: "Full PDF preview — CBSE pattern, ready to print.",
    placeholder: "Class 10 Science question paper — PDF preview",
    lines: ["Class 10 Science — Unit Test", "Section A — 6 MCQs / 6 marks", "Section B — 4 short answer / 12 marks", "Section C — diagram + numerical / 7 marks"],
  },
  {
    title: "Worksheet with a circuit diagram",
    link: "Auto-generated, not hand-drawn",
    desc: "Auto-generated diagram, accurate to the question — not hand-drawn.",
    placeholder: "Worksheet with auto-generated circuit diagram",
    lines: ["Draw the labelled circuit", "Identify the ammeter and voltmeter positions", "Explain what happens when resistance increases"],
  },
  {
    title: "Report-card remarks in Hindi",
    link: "A full class set",
    desc: "A full class set, each remark personal to that student's performance.",
    placeholder: "Report-card remarks in Hindi",
    lines: ["Ananya Rao — numericals mein mazboot", "Karan Mehta — written answers need more structure", "Priya S. — diagrams par extra practice"],
  },
  {
    title: "PTM parent notice",
    link: "English and Hindi, side by side",
    desc: "English and Hindi versions, side by side.",
    placeholder: "PTM parent notice — English and Hindi",
    lines: ["Parent-teacher meeting notice", "Hindi version prepared alongside English", "WhatsApp-ready format"],
  },
];

const faqs = [
  ["Is GuruDock really free to use?", "Yes, for real classroom use, for as long as you teach. Upgrade any time for unlimited generation."],
  ["Do I need to set up a timetable to use it?", "No. Every feature works immediately. The timetable is optional and only unlocks automatic daily briefings."],
  ["How is this different from just using ChatGPT?", "GuruDock is built only for CBSE teaching. It knows your NCERT chapters, CBSE marking schemes, and how your class levels differ. It produces a print-ready paper with correct diagrams, not a chat message you have to reformat yourself — and it remembers your classes, your syllabus position, and your students between sessions."],
  ["What if it gets something wrong?", "You review everything before you use it, and editing is one tap. If something is wrong, you fix it or report it — GuruDock gets better from that. Nothing goes to a student or parent without you seeing it first."],
  ["Does it support Hindi?", "Yes, throughout — briefings, worksheets, remarks, and notices can all be generated in Hindi as well as English."],
  ["Is the content aligned with the CBSE curriculum?", "Yes, every generator is built around CBSE/NCERT chapters and assessment patterns."],
  ["Is my students' data safe?", "We're finalizing the exact wording of this answer with our legal and compliance team, since it concerns children's data — it will appear here before launch."],
  ["Can I edit what GuruDock produces?", "Yes — every document, lesson plan, and remark is fully editable, and previous versions are always saved so you can go back."],
  ["Do diagrams actually work, or are they just illustrations?", "Diagrams are built to be accurate to the question — circuits, ray diagrams, and chemical structures are constructed correctly every time, not just drawn to look right."],
  ["Who can join the Staffroom?", "Any verified teacher using GuruDock."],
  ["What happens if I reach my free limit?", "You'll see exactly when it resets, or you can upgrade for unlimited access."],
  ["Can I cancel anytime?", "Our cancellation and refund policy is being finalized with the business team and will be published here before launch."],
];

const testimonials = [
  [
    "I was sure it would produce something generic that I'd have to rewrite anyway. I checked the first three papers question by question. Now I check maybe one in ten.",
    "Science teacher",
    "Class 9-10 A",
  ],
  [
    "I was sure it would produce something generic that I'd have to rewrite anyway. I checked the first three papers question by question. Now I check maybe one in ten.",
    "Mathematics teacher",
    "Class 8 A",
  ],
  [
    "I was sure it would produce something generic that I'd have to rewrite anyway. I checked the first three papers question by question. Now I check maybe one in ten.",
    "Social Science teacher",
    "Class 7-8 A",
  ],
];

const appRoutes = new Set([
  "/",
  "/home",
  "/library",
  "/timetable",
  "/students",
  "/tests",
  "/templates",
  "/briefing",
  "/profile",
  "/create",
]);

function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [createMode, setCreateMode] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [userName, setUserName] = useState(() => {
    const storedName = localStorage.getItem("user_name");
    const storedEmail = localStorage.getItem("user_email");
    return storedName || storedEmail?.split("@")[0] || "";
  });
  const [exampleOpen, setExampleOpen] = useState(null);
  const [openFaqs, setOpenFaqs] = useState([0]);

  useEffect(() => {
    validateStoredSession();
  }, []);

  const openLogin = () => {
    setLoginOpen(true);
    setAuthMode("login");
    setMenuOpen(false);
  };

  const openSignup = () => {
    setLoginOpen(true);
    setAuthMode("signup");
    setMenuOpen(false);
  };

  const confirmLogOut = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_email");
    setUserName("");
    window.dispatchEvent(new Event("auth-changed"));
    setLogoutOpen(false);
  };

  const toggleFaq = (index) => {
    setOpenFaqs((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  };

  useEffect(() => {
    const handlePopState = () => {
      const nextPathname = window.location.pathname;
      if (nextPathname === "/create") setCreateMode(null);
      setPathname(nextPathname);
    };
    const handleAuthChanged = () => setUserName(
      localStorage.getItem("user_name") || localStorage.getItem("user_email")?.split("@")[0] || "",
    );
    const handleCreateNavigation = (event) => {
      setCreateMode(event.detail?.mode || "question");
      if (window.location.pathname !== "/create") {
        window.history.pushState({}, "", "/create");
      }
      setPathname("/create");
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("auth-changed", handleAuthChanged);
    window.addEventListener("navigate-create", handleCreateNavigation);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("auth-changed", handleAuthChanged);
      window.removeEventListener("navigate-create", handleCreateNavigation);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleOutsideClick = (event) => {
      if (!event.target.closest(".nav")) setMenuOpen(false);
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [menuOpen]);

  useEffect(() => {
    if (pathname === "/" && localStorage.getItem("access_token")) {
      window.history.replaceState({}, "", "/home");
      setPathname("/home");
    }
  }, [pathname]);

  useEffect(() => {
    if (localStorage.getItem("access_token") && !appRoutes.has(pathname)) {
      window.history.replaceState({}, "", "/home");
      setPathname("/home");
    }
  }, [pathname]);

  if (localStorage.getItem("access_token") && !appRoutes.has(pathname)) {
    return <HomePage />;
  }

  if (pathname !== "/" && !localStorage.getItem("access_token")) {
    return <AuthRequiredPage destination={`${window.location.pathname}${window.location.search}${window.location.hash}`} />;
  }

  if (pathname === "/home") {
    return <HomePage />;
  }

  if (pathname === "/library") {
    return <LibraryPage />;
  }
  if (pathname === "/timetable") {
    return <TimetablePage />;
  }
  if (pathname === "/students") {
    return <StudentsPage />;
  }
  if (pathname === "/tests") {
    return <TestsPage />;
  }
  if (pathname === "/templates") {
    return <TemplatesPage />;
  }
  if (pathname === "/briefing") {
    return <BriefingPage />;
  }
  if (pathname === "/profile") {
    return <ProfilePage />;
  }
  if (pathname === "/create") {
    return <CreatePage key={createMode || "question"} initialMode={createMode} />;
  }
  return (
    <div className="site">
      <header className="nav">
        <div className="nav-inner">
          <a href="/" className="brand">
            <img src={logoUrl} alt="" />
            <span>GuruDock</span>
          </a>
          <nav className="nav-links">
            {navItems.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
          </nav>
          <div className="nav-actions">
            <button className="menu-button" type="button" aria-label="Open menu" onClick={() => setMenuOpen((value) => !value)}>
              <span />
              <span />
              <span />
            </button>
            {userName ? (
              <button className="primary-button nav-cta" type="button" onClick={() => setLogoutOpen(true)}>Log out</button>
            ) : (
              <>
                <button className="ghost-button" type="button" onClick={openLogin}>Log in</button>
                <button className="primary-button nav-cta" type="button" onClick={openSignup}>Get started free</button>
              </>
            )}
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            {navItems.map(([label, href]) => <a key={label} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
            {!userName && (
              <div className="mobile-menu-actions">
                <button className="ghost-button" type="button" onClick={openLogin}>Log in</button>
                <button className="primary-button" type="button" onClick={openSignup}>Sign up</button>
              </div>
            )}
          </div>
        )}
      </header>

      <main>
        <section id="hero" className="section hero">
          <div>
            <div className="eyebrow"><i />Built for CBSE teachers in India</div>
            <h1>Spend your evenings with your family, not with question papers.</h1>
            <p className="lead">GuruDock drafts your question papers, worksheets, lesson plans, and parent communication in English and Hindi — and tells you exactly what to teach each morning, picking up right where you left off. You stay in charge of every word.</p>
            <div className="button-row">
              <button className="primary-button" type="button" onClick={openSignup}>Get started free</button>
              <a className="secondary-button" href="#how-it-works">See how it works</a>
            </div>
            <div className="trust-row">
              <span>No credit card needed</span><i /><span>Free to start</span><i /><span>Works in English and Hindi</span>
            </div>
          </div>
          <PhonePreview />
        </section>

        <section id="problem" className="section problem-section">
          <div className="problem-intro">
              <span className="kicker">The problem</span>
              <h2>Teaching is the job. Paperwork shouldn't be the second job.</h2>
              <p>You didn't spend years mastering your subject to spend your evenings formatting a question paper.</p>
          </div>
          <div className="problem-quotes">
            {[
              "Hours lost every week writing question papers and worksheets by hand, chapter by chapter.",
              "Report card season means the same remark, written forty times, worded forty different ways.",
              "Every parent notice written twice — once for the school, once for home.",
              "Coming back to a class after a break means reconstructing where you left off, from memory.",
            ].map((item) => <blockquote key={item}>{item}</blockquote>)}
          </div>
          <div className="time-card">
            <div>
              <strong>~2 hours</strong>
              <span>by hand</span>
            </div>
            <b>→</b>
            <div>
              <strong>~4 minutes</strong>
              <span>with GuruDock, plus a quick review</span>
            </div>
            <small>A unit test question paper</small>
          </div>
          <p className="problem-close">GuruDock takes the clerical work off your plate. The teaching stays exactly where it belongs — with you.</p>
        </section>

        <section id="localization" className="localization-section">
          <div className="localization-inner">
            <div className="localization-heading">
              <span className="kicker">Built for Indian classrooms</span>
              <h2>Made for CBSE. Made for India.</h2>
            </div>
            <div className="local-cards">
              <div>Every document follows the CBSE curriculum and NCERT chapter structure — not a generic template adapted from somewhere else.</div>
              <div>Full support for English and Hindi, built in from the start, not translated after the fact.</div>
              <div>Built around how Indian classrooms actually run: CBSE assessment patterns, real class structures, and the shape of an actual teaching day.</div>
            </div>
          </div>
        </section>

        <section id="solution" className="section pillars">
          <div className="pillars-heading">
            <h2>Four things off your desk</h2>
          </div>
          <div className="pillar-grid">
            {pillars.map(([title, copy], index) => (
              <a className="pillar-card" href={["#feature-briefing", "#feature-create", "#feature-communications", "#feature-analytics"][index]} key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
                <span>Learn more ↓</span>
              </a>
            ))}
          </div>
        </section>

        <section id="features" className="features">
          <FeatureBrief />
          <FeatureCreate />
          <FeatureTrack />
          <FeatureConnect />
          <FeatureStaffroom />
        </section>

        <section id="examples" className="section examples">
          <div className="examples-head">
            <span className="kicker">Examples</span>
            <h2>See it before you sign up</h2>
            <p>Real output, not a mockup. Open any example below — no account needed.</p>
          </div>
          <div className="example-grid">
            {examples.map((example, index) => (
              <button className="example-card" type="button" key={example.title} onClick={() => setExampleOpen(index)}>
                <ExamplePreview label={example.placeholder} />
                <span className="example-card-copy">
                  <strong>{example.title}</strong>
                  <span>{example.link} →</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section id="control" className="control">
          <div className="section control-grid">
            <div className="control-copy">
              <span className="kicker">You're in control</span>
              <h2>GuruDock drafts. You decide.</h2>
              <p>A calculator didn't make mathematicians lazy. A well-made question paper is still your paper. GuruDock handles the typing, the formatting, and the repetition. The judgment about what your students need — that stays exactly where it belongs.</p>
            </div>
            <ul className="control-list">
              <li>Nothing is sent, printed, or shared until you approve it</li>
              <li>Every document, remark, and notice is fully editable before you use it</li>
              <li>Every edit is saved, so you can always go back to an earlier version</li>
              <li>You decide what to keep, change, or throw away — GuruDock produces the draft, you produce the final</li>
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="section how">
          <div className="section-heading">
            <span className="kicker">How it works</span>
            <h2>Start in one minute. No setup required.</h2>
          </div>
          <div className="step-grid">
            {[
              ["Sign up in under a minute", "Name, email, a few taps."],
              ["Tell us what you teach", "Your subjects and class levels. That's it."],
              ["Get your first briefing or document", "Working from the first minute, no timetable, no setup."],
              ["(Optional) Add your timetable", "Briefings then arrive automatically every morning, for every class you teach."],
            ].map(([title, copy], index) => (
              <article className="step-card" key={title}>
                <b>{index + 1}</b>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
          <div className="center-stack">
            <button className="primary-button" type="button" onClick={openSignup}>Start your first briefing free</button>
            <p>If you can fill out a form, you can use GuruDock. Nothing to install, nothing to configure.</p>
          </div>
        </section>

        <section id="testimonials" className="testimonials">
          <div className="section testimonials-inner">
            <div className="testimonials-head">
              <span className="kicker">Social proof</span>
              <h2>Teachers who were sure this wouldn't work for them.</h2>
            </div>
<div className="testimonial-grid">
  {testimonials.map(([quote, name, meta]) => (
    <Testimonial
      key={name}
      quote={quote}
      name={name}
      meta={meta}
    />
  ))}
</div>

          </div>
        </section>

        <section id="pricing" className="section pricing">
          <div className="pricing-head">
            <span className="kicker">Pricing</span>
            <h2>Start free. Stays free for real classroom use.</h2>
          </div>
          <div className="pricing-grid">
            <article className="price-card">
              <h3>Free</h3>
              <p>Enough for a full week of worksheets, papers, and lesson plans, every week — free, for as long as you teach.</p>
              <button className="price-button free" type="button" onClick={openSignup}>Start free</button>
              <small>No credit card required to start.</small>
            </article>
            <article className="price-card dark">
              <div className="price-card-top">
                <h3>Pro</h3>
                <span>Pricing coming soon</span>
              </div>
              <p>Unlimited generations, plus more — final Pro perks and price to be announced.</p>
              <button className="price-button pro" type="button" onClick={openLogin}>Go Pro</button>
            </article>
          </div>
          <div className="school-cta">
            <span>Bringing GuruDock to your whole school?</span>
            <a href="mailto:contact@gurudock.com">Talk to us →</a>
          </div>
        </section>

        <section id="faq" className="faq">
          <div className="faq-inner">
            <div className="faq-head">
              <span className="kicker">FAQ</span>
              <h2>Questions teachers ask first.</h2>
              <p>Something not covered? <a href="mailto:hello@gurudock.com">Write to us</a> — a person replies.</p>
            </div>
            <div className="faq-list">
              {faqs.map(([question, answer], index) => {
                const open = openFaqs.includes(index);
                return (
                  <article className="faq-item" key={question}>
                    <button type="button" onClick={() => toggleFaq(index)}>
                      <span>{question}</span>
                      <b>{open ? "–" : "+"}</b>
                    </button>
                    {open && <p>{answer}</p>}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section final-cta">
          <h2>Your next class is already waiting to be briefed.</h2>
          <button className="primary-button" type="button" onClick={openSignup}>Get started free</button>
          <a href="mailto:contact@gurudock.com">Bringing GuruDock to your whole school? Talk to us →</a>
        </section>
      </main>

      <Footer />

      {exampleOpen !== null && (
        <Modal onClose={() => setExampleOpen(null)} example>
          <ExamplePreview label={examples[exampleOpen].placeholder} large />
          <h2 className="example-modal-title">{examples[exampleOpen].title}</h2>
          <p className="example-modal-desc">{examples[exampleOpen].desc}</p>
        </Modal>
      )}

      {logoutOpen && (
        <Modal onClose={() => setLogoutOpen(false)} narrow>
          <h2>Log out?</h2>
          <p>Are you sure you want to log out of GuruDock?</p>
          <div className="logout-actions">
            <button className="secondary-button" type="button" onClick={() => setLogoutOpen(false)}>Cancel</button>
            <button className="primary-button" type="button" onClick={confirmLogOut}>Log out</button>
          </div>
        </Modal>
      )}

      {loginOpen && <AuthModal
        mode={authMode}
        onClose={() => setLoginOpen(false)}
        onModeChange={setAuthMode}
        onAuthenticated={({ name }) => {
          setUserName(name);
          setLoginOpen(false);
          window.history.pushState({}, "", "/home");
          setPathname("/home");
        }}
      />}
    </div>
  );
}

function PhonePreview() {
  return (
    <div className="phone-shell">
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-screen">
          <div className="phone-header">
            <div className="phone-date">Wednesday, 9 September</div>
            <h2>Good morning, Anita</h2>
          </div>
          <div className="phone-body">
            <div className="phone-card active">
              <div className="dot-row"><i /><span>Next · in 40 min</span></div>
              <h3>9:45 am · 10-A · Science</h3>
              <strong>Corrosion & rancidity</strong>
              <small>Pick up from</small>
              <p>Balanced equations finished. Students began naming reaction types.</p>
              <button type="button">Open briefing</button>
            </div>
            <div className="mini-class">
              <div className="mini-time"><b>11:20</b><span>P4</span></div>
              <i />
              <p><strong>9-B · Science</strong><small>Metals & non-metals</small></p>
            </div>
            <div className="mini-class">
              <div className="mini-time"><b>1:40</b><span>P6</span></div>
              <i />
              <p><strong>10-A · Science</strong><small>Practical — indicators</small></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExamplePreview({ label, large = false }) {
  return (
    <div className={`example-preview ${large ? "large" : ""}`}>
      <span>{label}</span>
    </div>
  );
}

function FeatureBrief() {
  return (
    <section id="feature-briefing" className="brief-section">
      <div className="brief-inner">
        <div className="brief-copy">
          <span className="kicker">Brief</span>
          <h2>Open the app, know what to teach.</h2>
          <p>Every morning, a briefing for each class: what you covered last time, what to teach today, quick facts to have ready, and the mistake students usually make on this topic. No setup required to start — look up any topic on demand and get a full briefing instantly, for any class, any subject, any chapter. Set up your timetable once, and your whole day's briefings are waiting when you open the app.</p>
          <ul className="soft-check-list">
            <li>Works from day one, with zero setup</li>
            <li>Remembers where each class left off, automatically</li>
            <li>Upgrades to fully automatic once your timetable is in</li>
            <li>Available in English and Hindi</li>
          </ul>
        </div>
        <div className="brief-panel">
          <div className="brief-panel-head">
            <div>
              <span>10-A · Science · 9:45 am</span>
              <h3>Corrosion &amp; rancidity</h3>
            </div>
            <small>Session 4 of 6</small>
          </div>
          <b>Pick up from</b>
          <p>Balanced equations finished last class. Students began naming reaction types.</p>
          <b>Watch out for</b>
          <div className="warning-box">
            <p>Students conflate corrosion with combustion. Stress that corrosion is slow and needs no flame.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureCreate() {
  return (
    <section id="feature-create" className="create-section">
      <div className="create-inner">
        <div className="paper-panel">
          <div className="paper-top"><b>Class 10 Science — Unit Test</b><span>Medium</span></div>
          <div className="paper-list">
            {["Section A — 6 MCQs|6 marks", "Section B — 4 short answer|12 marks", "Section C — diagram + numerical|7 marks"].map((row) => {
              const [left, right] = row.split("|");
              return <div className="paper-row" key={row}><span>{left}</span><b>{right}</b></div>;
            })}
          </div>
          <div className="button-row tight"><button type="button">Export PDF</button><button type="button">Edit draft</button></div>
          <div className="saved-row"><span aria-hidden="true" />Saved to your library · v3 · full version history kept</div>
        </div>
        <div className="create-copy">
          <span className="kicker">Create</span>
          <h2>A first draft of everything you write by hand.</h2>
          <p>Five generators, one family — every one produces a first draft you review and shape before it reaches a student or a parent.</p>
          <div className="generator-list">
            {generators.map(([title, copy]) => <p key={title}><b>{title}</b> — {copy}</p>)}
          </div>
          <ul className="soft-check-list create-checks">
            <li>Every document exports to a clean, print-ready PDF, in English or Hindi</li>
            <li><strong>You review and edit everything</strong> before it ever reaches a student or a parent</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function FeatureTrack() {
  return (
    <section id="feature-analytics" className="track-section">
      <div className="track-inner">
        <div className="track-copy">
          <span className="kicker">Track</span>
          <h2>Know who needs help before the report card does.</h2>
          <ul className="soft-check-list">
            <li>Keep a roster per class — add students one by one or upload a class list</li>
            <li>Record test marks for the whole class in one pass</li>
            <li>See class averages, score distribution, and pass rates instantly</li>
            <li>Spot struggling students automatically, with an adjustable threshold</li>
            <li>Track any student's performance over time, across every test</li>
          </ul>
        </div>
        <div className="analytics-panel">
          <span>10-A · Science · Unit Test 2</span>
          <div className="stat-grid">
            <strong>74%<small>class average</small></strong>
            <strong>92%<small>pass rate</small></strong>
          </div>
          <h3>Needs attention</h3>
          <div className="student-list">
            <div className="student-row"><span>Rohan M.</span><b>38%</b></div>
            <div className="student-row"><span>Priya S.</span><b>44%</b></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureConnect() {
  return (
    <section id="feature-communications" className="connect-section">
      <div className="connect-inner">
        <div className="remarks-panel">
          <h3>10-A · Report card remarks</h3>
          <div className="remark-list">
            <div className="remark-card">
              <b>Ananya Rao</b>
              <p>Consistently strong in numericals; needs more practice with diagram-based questions.</p>
            </div>
            <div className="remark-card">
              <b>Karan Mehta</b>
              <p>Good grasp of concepts; written answers would benefit from more structure.</p>
            </div>
          </div>
          <div className="button-row tight"><button type="button">Draft for whole class</button><button type="button">Send via WhatsApp</button></div>
        </div>
        <div className="connect-copy">
          <span className="kicker">Connect</span>
          <h2>Forty personalized remarks. One tap. Every one still yours to edit.</h2>
          <ul className="soft-check-list">
            <li>Draft report-card remarks for an entire class at once, each one personal to that student's performance</li>
            <li>Draft parent notices — PTM invitations, fee reminders, holiday announcements, exam schedules — in minutes</li>
            <li>Every remark and notice available in English and Hindi</li>
            <li>A clean, ready-to-send version for WhatsApp broadcast, no formatting clutter</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function FeatureStaffroom() {
  return (
    <section id="community" className="staffroom-section">
      <div className="staffroom-inner">
        <div className="staffroom-copy">
          <span className="kicker">Staffroom</span>
          <h2>A staffroom that's always open.</h2>
          <ul className="staffroom-list">
            <li>Post a doubt and get answers from teachers who've solved it before</li>
            <li>Share a tip or a resource</li>
            <li>Join circles for your subject or class level</li>
            <li>Follow teachers whose posts help you, and build your own following as you help others</li>
          </ul>
        </div>
        <div className="staffroom-panel">
          <Post label="Doubt" circle="Science circle" text="How do you explain photosynthesis simply to Class 7 without oversimplifying?" replies="14 replies" />
          <Post label="Tip" circle="Class 10 circle" text="A quick warm-up activity for revising chemical equations before a unit test." replies="9 replies" tone="green" />
        </div>
      </div>
    </section>
  );
}

function FeatureSection({ tag, title, children, flip = false, id }) {
  const [copy, visual] = React.Children.toArray(children);

  return (
    <section id={id} className={`section feature-section ${flip ? "flip" : ""}`}>
      <div className="feature-text">
        <span className="kicker">{tag}</span>
        <h2>{title}</h2>
        {copy}
      </div>
      <div className="feature-visual">{visual}</div>
    </section>
  );
}

function Post({ label, circle, text, replies, tone = "gold" }) {
  return (
    <article className="post-card">
      <div><b className={tone}>{label}</b><span>{circle}</span></div>
      <p>{text}</p>
      <small>{replies}</small>
    </article>
  );
}

function Testimonial({ quote, name, meta }) {
  return (
    <article className="testimonial-card">
      <span>The doubt</span>
      <p>"{quote}"</p>
      <b>{name}</b>
      <small>{meta}</small>
    </article>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <a className="brand footer-brand" href="#hero">
            <img src={logoUrl} alt="" />
            <span>GuruDock</span>
          </a>
          <p>The clerical work off your desk. The teaching stays yours.</p>
        </div>
        <FooterLinks title="Product" links={[["Features", "#features"], ["Pricing", "#pricing"], ["Examples", "#examples"]]} />
        <FooterLinks title="Company" links={[["About", "/about"], ["Contact", "mailto:hello@gurudock.com"]]} />
        <FooterLinks title="Resources" links={[["Help center", "/help"], ["Staffroom (public preview)", "#community"], ["CBSE curriculum guide", "/cbse-curriculum-guide"], ["Privacy policy", "/privacy"], ["Terms of service", "/terms"]]} />
      </div>
      <div className="footer-bottom">
        <span>© 2026 GuruDock. Made in India.</span>
        <span className="language-pill">EN / हिं</span>
      </div>
    </footer>
  );
}

function FooterLinks({ title, links }) {
  return (
    <div className="footer-links">
      <h3>{title}</h3>
      {links.map(([label, href]) => <a href={href} key={label}>{label}</a>)}
    </div>
  );
}

function Modal({ children, onClose, narrow = false, example = false }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${narrow ? "narrow" : ""} ${example ? "example-modal" : ""}`} onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose}>×</button>
        {children}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
