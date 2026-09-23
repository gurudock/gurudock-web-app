import React, { useEffect, useRef, useState } from "react";
import { handleWorkspaceWheel } from "./LibraryPage";
import LibrarySidebar from "./LibrarySidebar";
import AuthModal from "./AuthModal";
import { authenticatedFetch } from "./apiClient";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "/api" : "https://testing.api.gurudock.com");

export default function ProfilePage() {
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(() => Boolean(localStorage.getItem("access_token")));
  const [curriculum, setCurriculum] = useState(null);
  const [curriculumLoading, setCurriculumLoading] = useState(true);
  const [curriculumError, setCurriculumError] = useState("");
  const [preferences, setPreferences] = useState({});
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesMessage, setPreferencesMessage] = useState("");
  const [preferencesError, setPreferencesError] = useState("");
  const preferencesRef = useRef(preferences);
  const [selectedClasses, setSelectedClasses] = useState(new Set());
  const [user, setUser] = useState(() => {
    const email = localStorage.getItem("user_email") || "";
    const name = localStorage.getItem("user_name") || getNameFromEmail(email);
    return {
      name,
      email,
      initials: getInitials(name),
    };
  });

  useEffect(() => {
    let active = true;

    const loadUserDetails = async () => {
      if (!localStorage.getItem("access_token")) return;

      try {
        const response = await authenticatedFetch(`${API_URL}/auth/me`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load profile details.");
        }

        const name = data.name || getNameFromEmail(data.email || "");
        const email = data.email || "";
        localStorage.setItem("user_name", name);
        localStorage.setItem("user_email", email);

        if (active) {
          setUser({ name, email, initials: getInitials(name) });
        }
      } catch (error) {
        console.error("Unable to load profile details:", error);
      }
    };

    loadUserDetails();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authenticated) {
      preferencesRef.current = {};
      setPreferences({});
      setSelectedClasses(new Set());
      return undefined;
    }

    let active = true;
    setPreferencesLoading(true);
    setPreferencesError("");

    const loadPreferences = async () => {
      try {
        const response = await authenticatedFetch(`${API_URL}/preferences/`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !isPreferencesMap(data)) {
          throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load preferences.");
        }
        if (active) {
          preferencesRef.current = data;
          setPreferences(data);
          setSelectedClasses(getSelectedClassLevels(data));
        }
      } catch (error) {
        if (active) setPreferencesError(error.message || "Unable to load preferences.");
      } finally {
        if (active) setPreferencesLoading(false);
      }
    };

    loadPreferences();
    return () => {
      active = false;
    };
  }, [authenticated]);

  const stagePreferences = (nextPreferences) => {
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
    setPreferencesMessage("");
    setPreferencesError("");
  };

  const savePreferences = async () => {
    const nextPreferences = buildSelectedPreferences(preferencesRef.current, selectedClasses, curriculum);
    setPreferencesSaving(true);
    setPreferencesMessage("");
    setPreferencesError("");
    try {
      const response = await authenticatedFetch(`${API_URL}/preferences/replace`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: { preferences: nextPreferences },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Unable to save preferences.");
      }
      if (!isPreferencesResponse(data)) {
        throw new Error("The preferences response was invalid.");
      }
      const savedPreferences = data.preferences;
      preferencesRef.current = savedPreferences;
      setPreferences(savedPreferences);
      setPreferencesMessage("Preferences saved");
    } catch (error) {
      setPreferencesError(error.message || "Unable to save preferences.");
    } finally {
      setPreferencesSaving(false);
    }
  };

  useEffect(() => {
    const syncAuthentication = () => setAuthenticated(Boolean(localStorage.getItem("access_token")));
    window.addEventListener("auth-changed", syncAuthentication);
    window.addEventListener("storage", syncAuthentication);
    return () => {
      window.removeEventListener("auth-changed", syncAuthentication);
      window.removeEventListener("storage", syncAuthentication);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadCurriculum = async () => {
      try {
        const response = await fetch(`${API_URL}/content/available-content`, {
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data || typeof data !== "object") {
          throw new Error("Unable to load available curriculum.");
        }
        setCurriculum(data);
      } catch (error) {
        if (error.name !== "AbortError") {
          setCurriculumError(error.message || "Unable to load available curriculum.");
        }
      } finally {
        if (!controller.signal.aborted) setCurriculumLoading(false);
      }
    };

    loadCurriculum();
    return () => controller.abort();
  }, []);

  const logOut = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_email");
    window.dispatchEvent(new Event("auth-changed"));
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const toggleClass = (classLevel) => {
    const current = preferencesRef.current;
    const isSelected = selectedClasses.has(classLevel);
    const nextClasses = new Set(selectedClasses);
    if (isSelected) {
      nextClasses.delete(classLevel);
      const nextPreferences = { ...current };
      Object.keys(curriculum || {}).forEach((board) => {
        if (nextPreferences[board]?.[classLevel]) {
          nextPreferences[board] = { ...nextPreferences[board], [classLevel]: [] };
        }
      });
      stagePreferences(nextPreferences);
    } else {
      nextClasses.add(classLevel);
      const nextPreferences = { ...current };
      const selectedSubjects = new Set();

      Object.entries(curriculum || {}).forEach(([board, classes]) => {
        Object.entries(classes || {}).forEach(([existingClass, subjects]) => {
          if (!selectedClasses.has(existingClass) || !Array.isArray(subjects)) return;
          const chosenSubjects = current?.[board]?.[existingClass] || [];
          chosenSubjects.forEach((subject) => {
            if (subjects.includes(subject)) selectedSubjects.add(subject);
          });
        });
      });

      Object.entries(curriculum || {}).forEach(([board, classes]) => {
        const availableSubjects = classes?.[classLevel];
        if (!Array.isArray(availableSubjects)) return;
        const inheritedSubjects = availableSubjects.filter((subject) => selectedSubjects.has(subject));
        if (inheritedSubjects.length === 0) return;
        nextPreferences[board] = {
          ...(nextPreferences[board] || {}),
          [classLevel]: [...new Set(inheritedSubjects)],
        };
      });
      stagePreferences(nextPreferences);
    }
    setSelectedClasses(nextClasses);
  };

  return (
    <div className="profile-app" onWheel={(event) => handleWorkspaceWheel(event, ".profile-content")}>
      <LibrarySidebar activeItem="profile" />
      <div className="profile-main">
        <header className="profile-header"><strong>Profile &amp; settings</strong></header>
        <main className="profile-content">
          <div className="profile-left">
            <div className="profile-top-grid">
              <section className="profile-card profile-identity">
                <div className="profile-avatar">{user.initials}</div>
                <div className="profile-identity-copy">
                  <strong>{user.name}</strong>
                </div>
              </section>

              {authenticated && (
                <section className="profile-card">
                  <ProfileSectionTitle>Account</ProfileSectionTitle>
                  <div className="profile-account-list">
                    <ProfileAccountRow label="Email" value={user.email || "Not added yet"} />
                    <div className="profile-account-row"><span>Password</span><button type="button" onClick={() => setChangePasswordOpen(true)}>Change</button></div>
                  </div>
                </section>
              )}
            </div>

            <section className="profile-card">
              <ProfileSectionTitle>Subjects & class levels</ProfileSectionTitle>
              {curriculumLoading ? (
                <p className="profile-curriculum-status">Loading curriculum…</p>
              ) : curriculumError ? (
                <p className="profile-curriculum-status error">{curriculumError}</p>
              ) : (
                <CurriculumList
                  curriculum={curriculum}
                  preferences={preferences}
                  selectedClasses={selectedClasses}
                  onToggleClass={toggleClass}
                  onToggleSubject={(subject, subjectLocations) => {
                    stagePreferences(toggleSubjectForLocations(
                      preferencesRef.current,
                      subject,
                      subjectLocations,
                    ));
                  }}
                />
              )}
              {authenticated && (
                <div className="profile-preferences-actions">
                  {preferencesLoading && <small>Loading preferences…</small>}
                  {preferencesMessage && <small className="success">{preferencesMessage}</small>}
                  {preferencesError && <small className="error">{preferencesError}</small>}
                  <button
                    type="button"
                    className="primary-button"
                    disabled={preferencesLoading || preferencesSaving}
                    onClick={savePreferences}
                  >
                    {preferencesSaving ? "Saving…" : "Save preferences"}
                  </button>
                </div>
              )}
            </section>

            {authenticated && (
              <button className="primary-button profile-logout-button" type="button" onClick={() => setLogoutOpen(true)}>Log out</button>
            )}
          </div>

        </main>
      </div>
      {changePasswordOpen && <AuthModal mode="change" onClose={() => setChangePasswordOpen(false)} />}
      {logoutOpen && (
        <div className="modal-backdrop" onClick={() => setLogoutOpen(false)}>
          <div className="modal narrow" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setLogoutOpen(false)}>×</button>
            <h2>Log out?</h2>
            <p>Are you sure you want to log out of GuruDock?</p>
            <div className="logout-actions">
              <button className="secondary-button" type="button" onClick={() => setLogoutOpen(false)}>Cancel</button>
              <button className="primary-button" type="button" onClick={logOut}>Log out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "U";
}

function getNameFromEmail(email) {
  const username = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  if (!username) return "User";
  return username.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSelectedClassLevels(preferences) {
  return new Set(
    Object.values(preferences || {}).flatMap((classes) =>
      Object.entries(classes || {})
        .filter(([, subjects]) => Array.isArray(subjects) && subjects.length > 0)
        .map(([classLevel]) => classLevel),
    ),
  );
}

function buildSelectedPreferences(preferences, selectedClasses, curriculum) {
  const nextPreferences = {};

  Object.entries(curriculum || {}).forEach(([board, classes]) => {
    selectedClasses.forEach((classLevel) => {
      const availableSubjects = classes?.[classLevel];
      if (!Array.isArray(availableSubjects)) return;

      const selectedSubjects = Array.isArray(preferences?.[board]?.[classLevel])
        ? preferences[board][classLevel]
        : [];
      const subjects = selectedSubjects.filter((subject) => availableSubjects.includes(subject));

      const uniqueSubjects = [...new Set(subjects)];
      if (uniqueSubjects.length === 0) return;
      if (!nextPreferences[board]) nextPreferences[board] = {};
      nextPreferences[board][classLevel] = uniqueSubjects;
    });
  });

  return nextPreferences;
}

function toggleSubjectForLocations(preferences, subject, locations) {
  const nextPreferences = { ...preferences };
  const uniqueLocations = [...new Map(
    locations.map((location) => [`${location.board}:${location.classLevel}`, location]),
  ).values()];
  const selectedEverywhere = uniqueLocations.every(({ board, classLevel }) =>
    preferences?.[board]?.[classLevel]?.includes(subject),
  );

  uniqueLocations.forEach(({ board, classLevel }) => {
    const boardPreferences = nextPreferences[board] || {};
    const subjects = Array.isArray(boardPreferences[classLevel])
      ? boardPreferences[classLevel]
      : [];
    const nextSubjects = selectedEverywhere
      ? subjects.filter((item) => item !== subject)
      : [...new Set([...subjects, subject])];

    nextPreferences[board] = {
      ...boardPreferences,
      [classLevel]: nextSubjects,
    };
  });

  return nextPreferences;
}

function isPreferencesResponse(data) {
  return Boolean(
    data
    && typeof data === "object"
    && typeof data.message === "string"
    && isPreferencesMap(data.preferences),
  );
}

function isPreferencesMap(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.values(value).every((classes) =>
      classes
      && typeof classes === "object"
      && !Array.isArray(classes)
      && Object.values(classes).every((subjects) =>
        Array.isArray(subjects) && subjects.every((subject) => typeof subject === "string"),
      ),
    ),
  );
}

function ProfileSectionTitle({ children }) {
  return <h2 className="profile-section-title">{children}</h2>;
}

function ProfileAccountRow({ label, value }) {
  return <div className="profile-account-row"><span>{label}</span><em>{value}</em></div>;
}

function CurriculumList({ curriculum, preferences, selectedClasses, onToggleClass, onToggleSubject }) {
  const boards = Object.entries(curriculum || {});
  const classLevels = [...new Set(
    boards.flatMap(([, classes]) => Object.keys(classes || {})),
  )].sort((first, second) => Number(first) - Number(second));
  const classLocations = new Map();

  boards.forEach(([board, classes]) => {
    Object.entries(classes || {}).forEach(([classLevel, subjects]) => {
      if (!classLocations.has(classLevel)) classLocations.set(classLevel, []);
      classLocations.get(classLevel).push({ board, subjects });
    });
  });

  if (boards.length === 0) {
    return <p className="profile-curriculum-status">No curriculum is available.</p>;
  }

  const selectedSubjectLocations = new Map();
  boards.forEach(([board, classes]) => {
    Object.entries(classes || {}).forEach(([classLevel, subjects]) => {
      if (!selectedClasses.has(classLevel)) return;
      (Array.isArray(subjects) ? subjects : []).forEach((subject) => {
        if (!selectedSubjectLocations.has(subject)) selectedSubjectLocations.set(subject, []);
        selectedSubjectLocations.get(subject).push({ board, classLevel });
      });
    });
  });

  return (
    <div className="profile-curriculum">
      <section className="profile-curriculum-box">
        <h3>Classes</h3>
        <div className="profile-tags">
          {classLevels.map((classLevel) => {
            const locations = classLocations.get(classLevel);
            const selected = selectedClasses.has(classLevel);
            return (
              <button
                type="button"
                className={selected ? "selected" : ""}
                key={classLevel}
                onClick={() => onToggleClass(classLevel)}
                aria-pressed={selected}
              >
                Class {classLevel}
              </button>
            );
          })}
        </div>
      </section>
      <section className="profile-curriculum-box">
        <h3>Subjects</h3>
        {selectedClasses.size === 0 ? (
          <p className="profile-curriculum-status">Select a class to view its subjects.</p>
        ) : (
          <div className="profile-tags">
          {[...selectedSubjectLocations.keys()].sort().map((subject) => {
            const locations = selectedSubjectLocations.get(subject);
            const selected = locations.some(({ board, classLevel }) =>
              preferences?.[board]?.[classLevel]?.includes(subject),
            );
            return (
              <button
                type="button"
                className={selected ? "selected" : ""}
                key={subject}
                onClick={() => onToggleSubject(subject, locations)}
                aria-pressed={selected}
              >
                {subject}
              </button>
            );
          })}
          </div>
        )}
      </section>
    </div>
  );
}
