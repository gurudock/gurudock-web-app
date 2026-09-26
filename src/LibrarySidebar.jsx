import React, { useEffect, useState } from "react";
import logoUrl from "./assets/gurudock-logo.png";

export default function LibrarySidebar({ activeItem = "library" }) {
  const [authenticated, setAuthenticated] = useState(() => Boolean(localStorage.getItem("access_token")));

  useEffect(() => {
    const syncAuthentication = () => setAuthenticated(Boolean(localStorage.getItem("access_token")));
    window.addEventListener("auth-changed", syncAuthentication);
    window.addEventListener("storage", syncAuthentication);
    return () => {
      window.removeEventListener("auth-changed", syncAuthentication);
      window.removeEventListener("storage", syncAuthentication);
    };
  }, []);

  return (
    <aside className="library-sidebar">
      <a className="library-sidebar-brand" href="/home" aria-label="GuruDock home" onClick={handleNavigation}><img src={logoUrl} alt="GuruDock" /><span><strong>GuruDock</strong><small>Teach Smarter. Together.</small></span></a>
      <nav aria-label="Library navigation">
        <LibraryNavItem href="/home" label="Home" icon="home" active={activeItem === "home"} />
        <LibraryNavItem href="/create" label="Create" icon="create" active={activeItem === "create"} />
        <LibraryNavItem href="/briefing" label="Briefing" icon="briefing" active={activeItem === "briefing"} />
        <LibraryNavItem href="/library" label="Library" icon="library" active={activeItem === "library"} />
        {authenticated && <LibraryNavItem className="library-mobile-profile-nav-item" href="/profile" label="Profile" icon="profile" active={activeItem === "profile"} />}
        <LibraryNavItem href="/students" label="Students" icon="students" active={activeItem === "students"} />
        <LibraryNavItem href="/tests" label="Tests" icon="tests" active={activeItem === "tests"} />
        <LibraryNavItem href="/timetable" label="Time table" icon="timetable" active={activeItem === "timetable"} />
      </nav>
      <div className="library-sidebar-bottom">
        {authenticated && <LibraryNavItem className="library-profile-nav-item" href="/profile" label="Profile" icon="profile" active={activeItem === "profile"} />}
      </div>
    </aside>
  );
}

function LibraryNavItem({ href, label, icon, active = false, className = "" }) {
  const itemClassName = [active ? "active" : "", className].filter(Boolean).join(" ");
  return (
    <a className={itemClassName} href={href} title={label} onClick={handleNavigation}>
      <LibraryNavIcon name={icon} />
      <span>{label}</span>
    </a>
  );
}

function handleNavigation(event) {
  const link = event.currentTarget;
  const url = new URL(link.href, window.location.origin);
  if (url.origin !== window.location.origin) return;

  event.preventDefault();
  window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function LibraryNavIcon({ name }) {
  const paths = {
    home: <path d="M4 10L11 4L18 10V17.5C18 18.05 17.55 18.5 17 18.5H13.5V13.5H8.5V18.5H5C4.45 18.5 4 18.05 4 17.5V10Z" />,
    create: <><rect x="2.5" y="2.5" width="17" height="17" rx="5" /><path d="M11 7.5V14.5M7.5 11H14.5" strokeLinecap="round" /></>,
    students: <><circle cx="8" cy="7" r="3" /><circle cx="16" cy="8" r="2.5" /><path d="M2.5 18C2.5 14.5 5 12.5 8 12.5C11 12.5 13.5 14.5 13.5 18M13.5 13.5C16.5 13.5 19.5 15 19.5 18" strokeLinecap="round" /></>,
    tests: <><rect x="4" y="2.5" width="14" height="18" rx="2" /><path d="M8 2.5V5H14V2.5M7.5 9H14.5M7.5 13H14.5M7.5 17H12" strokeLinecap="round" /></>,
    timetable: <><rect x="3" y="4" width="16" height="16" rx="2" /><path d="M7 2.5V6M15 2.5V6M3 9H19M7 12.5H7.01M11 12.5H11.01M15 12.5H15.01M7 16H7.01M11 16H11.01" strokeLinecap="round" /></>,
    library: <><rect x="4" y="5" width="18" height="16" rx="2" /><path d="M4 9.5H22M8.5 3V6.5M17.5 3V6.5" strokeLinecap="round" /></>,
    briefing: <><path d="M12 4C10 2.6 6.5 2 3 2.6V16.6C6.5 16 10 16.6 12 18C14 16.6 17.5 16 21 16.6V2.6C17.5 2 14 2.6 12 4Z" /><path d="M12 4V18" /></>,
    profile: <><circle cx="11" cy="7.5" r="3.8" /><path d="M3.5 18.5C3.5 14.6 6.8 12.5 11 12.5C15.2 12.5 18.5 14.6 18.5 18.5" strokeLinecap="round" /></>,
  };

  return <svg className={`library-nav-svg library-nav-svg-${name}`} viewBox={name === "briefing" ? "0 0 24 22" : "0 0 22 22"} fill="none" aria-hidden="true">{paths[name]}</svg>;
}
