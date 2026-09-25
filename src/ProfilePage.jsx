import React, { useEffect, useRef, useState } from "react";
import { handleWorkspaceWheel } from "./LibraryPage";
import LibrarySidebar from "./LibrarySidebar";
import AuthModal from "./AuthModal";
import { API_BASE_URL, authenticatedFetch } from "./apiClient";
import { readAvailableContentCache, writeAvailableContentCache } from "./availableContentCache";

const PROFILE_CACHE_KEY = "gurudock_profile_cache";

export default function ProfilePage() {
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [profileTab, setProfileTab] = useState("personal");
  const [personalForm, setPersonalForm] = useState({ full_name: "", phone_number: "", city: "", state: "", preferred_language: "english" });
  const [educationForm, setEducationForm] = useState({ boards_taught: "", class_levels_taught: "", subjects_taught: "", designation: "", school_name: "", school_email: "", is_class_teacher: false, class_teacher_of_section: "", medium_of_instruction: "english", years_of_experience: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSavedOpen, setProfileSavedOpen] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({ rating: "", message: "" });
  const [feedbackHoverRating, setFeedbackHoverRating] = useState(0);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [pictureUploading, setPictureUploading] = useState(false);
  const pictureInputRef = useRef(null);
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
      pictureUrl: "",
    };
  });

  useEffect(() => {
    let active = true;

    const loadUserDetails = async () => {
      if (!localStorage.getItem("access_token")) return;

      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/auth/me`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load profile details.");
        }

        const name = data.name || getNameFromEmail(data.email || "");
        const email = data.email || "";
        const pictureUrl = await resolveProfilePictureUrl(getProfilePictureUrl(data));
        localStorage.setItem("user_name", name);
        localStorage.setItem("user_email", email);

        if (active) {
          setUser((current) => ({ ...current, name, email, initials: getInitials(name), pictureUrl: pictureUrl || current.pictureUrl }));
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
        const response = await authenticatedFetch(`${API_BASE_URL}/preferences/`);
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

  useEffect(() => {
    if (!authenticated) return undefined;
    let active = true;

    const applyProfileData = async (data) => {
      const personal = data.personal || data.personal_profile || data;
      const education = data.education || data.educational_profile || data;
      const pictureUrl = getProfilePictureUrl(data);
      const profileName = personal.name || personal.full_name;
      const profileEmail = personal.email;
      if (profileName) localStorage.setItem("user_name", profileName);
      if (profileEmail) localStorage.setItem("user_email", profileEmail);
      const displayPictureUrl = await resolveProfilePictureUrl(pictureUrl);
      if (!active) return;
      setUser((current) => ({
        ...current,
        name: profileName || current.name,
        email: profileEmail || current.email,
        initials: profileName ? getInitials(profileName) : current.initials,
        pictureUrl: displayPictureUrl || current.pictureUrl,
      }));
      setPersonalForm((current) => ({
        ...current,
        full_name: personal.full_name ?? personal.name ?? current.full_name,
        phone_number: personal.phone_number ?? current.phone_number,
        city: personal.city ?? current.city,
        state: personal.state ?? current.state,
        preferred_language: personal.preferred_language ?? current.preferred_language,
      }));
      setEducationForm((current) => ({
        ...current,
        boards_taught: Array.isArray(education.boards_taught) ? education.boards_taught.join(", ") : education.boards_taught ?? current.boards_taught,
        class_levels_taught: Array.isArray(education.class_levels_taught) ? education.class_levels_taught.join(", ") : education.class_levels_taught ?? current.class_levels_taught,
        subjects_taught: Array.isArray(education.subjects_taught) ? education.subjects_taught.join(", ") : education.subjects_taught ?? current.subjects_taught,
        designation: education.designation ?? current.designation,
        school_name: education.school_name ?? current.school_name,
        school_email: education.school_email ?? current.school_email,
        is_class_teacher: education.is_class_teacher ?? current.is_class_teacher,
        class_teacher_of_section: education.class_teacher_of_section ?? current.class_teacher_of_section,
        medium_of_instruction: education.medium_of_instruction ?? current.medium_of_instruction,
        years_of_experience: education.years_of_experience ?? current.years_of_experience,
      }));
    };

    const loadProfile = async () => {
      const cachedProfile = readProfileCache(getProfileCacheKey());
      if (cachedProfile) await applyProfileData(cachedProfile);

      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/profile/`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.detail || data.message || "Unable to load profile.");
        }
        writeProfileCache(getProfileCacheKey(), data);
        await applyProfileData(data);
      } catch (error) {
        if (active && !cachedProfile) setProfileError(error.message || "Unable to load profile.");
      }
    };

    loadProfile();
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
      const response = await authenticatedFetch(`${API_BASE_URL}/preferences/replace`, {
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
    const cachedCurriculum = readAvailableContentCache();
    if (cachedCurriculum) {
      setCurriculum(cachedCurriculum);
      setCurriculumLoading(false);
    }

    const loadCurriculum = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/content/available-content`, {
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data || typeof data !== "object") {
          throw new Error("Unable to load available curriculum.");
        }
        writeAvailableContentCache(data);
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

  const educationClassOptions = [...new Set(
    Object.values(curriculum || {}).flatMap((classes) => Object.keys(classes || {})),
  )].sort((first, second) => Number(first) - Number(second));
  const selectedEducationClasses = educationForm.class_levels_taught.split(",").map((value) => value.trim()).filter(Boolean);
  const educationSubjectOptions = [...new Set(
    Object.values(curriculum || {}).flatMap((classes) =>
      selectedEducationClasses.flatMap((classLevel) => classes?.[classLevel] || []),
    ),
  )].sort();

  const updateProfileField = (setForm) => (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage("");
    setProfileError("");
    const payload = profileTab === "personal"
      ? personalForm
      : {
        ...educationForm,
        boards_taught: educationForm.boards_taught.split(",").map((item) => item.trim()).filter(Boolean),
        class_levels_taught: educationForm.class_levels_taught.split(",").map((item) => item.trim()).filter(Boolean),
        subjects_taught: educationForm.subjects_taught.split(",").map((item) => item.trim()).filter(Boolean),
        years_of_experience: educationForm.years_of_experience === "" ? null : Number(educationForm.years_of_experience),
      };

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/profile/${profileTab}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.message || "Unable to save profile details.");
      if (profileTab === "personal" && personalForm.full_name.trim()) {
        localStorage.setItem("user_name", personalForm.full_name.trim());
        setUser((current) => ({ ...current, name: personalForm.full_name.trim(), initials: getInitials(personalForm.full_name.trim()) }));
      }
      invalidateProfileCache(getProfileCacheKey());
      setProfileMessage(`${profileTab === "personal" ? "Personal" : "Educational"} profile saved.`);
      setProfileSavedOpen(true);
    } catch (error) {
      setProfileError(error.message || "Unable to save profile details.");
    } finally {
      setProfileSaving(false);
    }
  };

  const uploadProfilePicture = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileError("Please choose an image file.");
      return;
    }

    setPictureUploading(true);
    setProfileMessage("");
    setProfileError("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/profile/picture`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Unable to upload profile picture.");
      }

      const pictureUrl = await resolveProfilePictureUrl(getProfilePictureUrl(data)) || URL.createObjectURL(file);
      setUser((current) => ({ ...current, pictureUrl }));
      invalidateProfileCache(getProfileCacheKey());
      setProfileMessage("Profile picture updated.");
    } catch (error) {
      setProfileError(error.message || "Unable to upload profile picture.");
    } finally {
      setPictureUploading(false);
    }
  };

  const submitFeedback = async (event) => {
    event.preventDefault();
    if (feedbackSubmitting) return;

    const rating = Number(feedbackForm.rating);
    const message = feedbackForm.message.trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      setFeedbackMessage("");
      setFeedbackError("Please select a rating from 1 to 5.");
      return;
    }
    if (!message) {
      setFeedbackMessage("");
      setFeedbackError("Please enter a message.");
      return;
    }

    setFeedbackSubmitting(true);
    setFeedbackMessage("");
    setFeedbackError("");
    try {
      const response = await authenticatedFetch("https://testing.api.gurudock.com/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { rating, message },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || data.message || "Unable to submit feedback.");
      }
      if (data.success !== true) {
        throw new Error(data.message || "Unable to submit feedback.");
      }
      setFeedbackMessage(data.message || "Thank you for your feedback.");
      setFeedbackForm({ rating: "", message: "" });
    } catch (error) {
      setFeedbackError(error.message || "Unable to submit feedback.");
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  return (
    <div className="profile-app" onWheel={(event) => handleWorkspaceWheel(event, ".profile-content")}>
      <LibrarySidebar activeItem="profile" />
      <div className="profile-main">
        <header className="profile-header"><strong>Profile &amp; settings</strong></header>
        <main className="profile-content">
          <div className="profile-left">
            <div className="profile-tabs" role="tablist" aria-label="Profile sections">
              <button type="button" className={profileTab === "personal" ? "active" : ""} role="tab" aria-selected={profileTab === "personal"} onClick={() => { setProfileTab("personal"); setProfileMessage(""); setProfileError(""); }}>Personal profile</button>
              <button type="button" className={profileTab === "education" ? "active" : ""} role="tab" aria-selected={profileTab === "education"} onClick={() => { setProfileTab("education"); setProfileMessage(""); setProfileError(""); }}>Educational profile</button>
            </div>
            <form className="profile-card profile-details-form" onSubmit={saveProfile}>
              <ProfileSectionTitle>{profileTab === "personal" ? "Personal profile" : "Educational profile"}</ProfileSectionTitle>
              {profileTab === "personal" ? (
                <div className="profile-details-grid">
                  <ProfileField label="Full name"><input name="full_name" value={personalForm.full_name} onChange={updateProfileField(setPersonalForm)} placeholder={user.name} /></ProfileField>
                  <ProfileField label="Phone number"><input name="phone_number" value={personalForm.phone_number} onChange={updateProfileField(setPersonalForm)} placeholder="+91..." /></ProfileField>
                  <ProfileField label="City"><input name="city" value={personalForm.city} onChange={updateProfileField(setPersonalForm)} /></ProfileField>
                  <ProfileField label="State"><input name="state" value={personalForm.state} onChange={updateProfileField(setPersonalForm)} /></ProfileField>
                  <ProfileField label="Preferred language"><ProfileSelect value={personalForm.preferred_language} options={[{ value: "english", label: "English" }, { value: "hindi", label: "Hindi" }]} onChange={(value) => setPersonalForm((current) => ({ ...current, preferred_language: value }))} ariaLabel="Preferred language" /></ProfileField>
                </div>
              ) : (
                <div className="profile-details-grid">
                  <ProfileField label="Boards taught" hint="Comma-separated"><input name="boards_taught" value={educationForm.boards_taught} onChange={updateProfileField(setEducationForm)} placeholder="CBSE, ICSE" /></ProfileField>
                  <ProfileField label="Class levels taught"><ProfileMultiSelect values={selectedEducationClasses} options={educationClassOptions.map((value) => ({ value, label: `Class ${value}` }))} placeholder="Select classes" onChange={(values) => setEducationForm((current) => ({ ...current, class_levels_taught: values.join(", "), subjects_taught: "" }))} disabled={!educationClassOptions.length} ariaLabel="Select class levels taught" /></ProfileField>
                  <ProfileField label="Subjects taught"><ProfileMultiSelect values={educationForm.subjects_taught.split(",").map((value) => value.trim()).filter(Boolean)} options={educationSubjectOptions.map((value) => ({ value, label: value }))} placeholder={selectedEducationClasses.length ? "Select subjects" : "Select a class first"} onChange={(values) => setEducationForm((current) => ({ ...current, subjects_taught: values.join(", ") }))} disabled={!educationSubjectOptions.length} ariaLabel="Select subjects taught" /></ProfileField>
                  <ProfileField label="Designation"><input name="designation" value={educationForm.designation} onChange={updateProfileField(setEducationForm)} placeholder="TGT" /></ProfileField>
                  <ProfileField label="School name"><input name="school_name" value={educationForm.school_name} onChange={updateProfileField(setEducationForm)} /></ProfileField>
                  <ProfileField label="School email"><input type="email" name="school_email" value={educationForm.school_email} onChange={updateProfileField(setEducationForm)} /></ProfileField>
                  <ProfileField label="Medium of instruction"><ProfileSelect value={educationForm.medium_of_instruction} options={[{ value: "english", label: "English" }, { value: "hindi", label: "Hindi" }, { value: "other", label: "Other" }]} onChange={(value) => setEducationForm((current) => ({ ...current, medium_of_instruction: value }))} ariaLabel="Medium of instruction" /></ProfileField>
                  <ProfileField label="Years of experience"><input type="number" min="0" name="years_of_experience" value={educationForm.years_of_experience} onChange={updateProfileField(setEducationForm)} /></ProfileField>
                  <label className="profile-checkbox"><input type="checkbox" name="is_class_teacher" checked={educationForm.is_class_teacher} onChange={updateProfileField(setEducationForm)} /> I am a class teacher</label>
                  <ProfileField label="Class teacher section"><input name="class_teacher_of_section" value={educationForm.class_teacher_of_section} onChange={updateProfileField(setEducationForm)} placeholder="10-A" disabled={!educationForm.is_class_teacher} /></ProfileField>
                </div>
              )}
              {profileMessage && <small className="profile-form-message success">{profileMessage}</small>}
              {profileError && <small className="profile-form-message error">{profileError}</small>}
              <button type="submit" className="primary-button" disabled={!authenticated || profileSaving}>{profileSaving ? "Saving…" : "Save profile"}</button>
            </form>
            <div className="profile-top-grid">
              <section className="profile-card profile-identity">
                <div className="profile-avatar-wrap">
                  <div className="profile-avatar">
                    {user.pictureUrl ? <img src={user.pictureUrl} alt="" /> : user.initials}
                  </div>
                  <button
                    type="button"
                    className="profile-avatar-edit"
                    onClick={() => pictureInputRef.current?.click()}
                    disabled={!authenticated || pictureUploading}
                    aria-label="Change profile picture"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m16.862 3.487 3.651 3.651M4 20l3.92-.98L19.53 7.41a2.586 2.586 0 0 0-3.66-3.66L4.26 15.37 4 20Z" />
                    </svg>
                  </button>
                </div>
                <div className="profile-identity-copy">
                  <strong>{user.name}</strong>
                  <input
                    ref={pictureInputRef}
                    className="profile-picture-input"
                    type="file"
                    accept="image/*"
                    onChange={uploadProfilePicture}
                    disabled={!authenticated || pictureUploading}
                  />
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

            {authenticated && (
              <form className="profile-card profile-feedback-form" onSubmit={submitFeedback}>
                <ProfileSectionTitle>Share your feedback</ProfileSectionTitle>
                <p className="profile-feedback-intro">Tell us how we can make GuruDock better for you.</p>
                <ProfileField label="Rating">
                  <div
                    className="profile-rating"
                    role="radiogroup"
                    aria-label="Feedback rating"
                    onMouseLeave={() => setFeedbackHoverRating(0)}
                  >
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        className={(
                          feedbackHoverRating >= rating
                            || (!feedbackHoverRating && Number(feedbackForm.rating) >= rating)
                        ) ? "selected" : ""}
                        onMouseEnter={() => setFeedbackHoverRating(rating)}
                        onClick={() => {
                          setFeedbackForm((current) => ({ ...current, rating: String(rating) }));
                          setFeedbackError("");
                        }}
                        role="radio"
                        aria-checked={Number(feedbackForm.rating) === rating}
                        aria-label={`${rating} ${rating === 1 ? "star" : "stars"}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </ProfileField>
                <ProfileField label="Message">
                  <textarea
                    name="message"
                    value={feedbackForm.message}
                    onChange={(event) => setFeedbackForm((current) => ({ ...current, message: event.target.value }))}
                    placeholder="What would you like us to know?"
                    rows="5"
                    required
                  />
                </ProfileField>
                {feedbackMessage && <small className="profile-form-message success">{feedbackMessage}</small>}
                {feedbackError && <small className="profile-form-message error">{feedbackError}</small>}
                <button type="submit" className="primary-button" disabled={feedbackSubmitting}>
                  {feedbackSubmitting ? "Submitting…" : "Submit feedback"}
                </button>
              </form>
            )}
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
      {profileSavedOpen && (
        <div className="modal-backdrop" onClick={() => setProfileSavedOpen(false)}>
          <div className="modal narrow profile-saved-modal" role="alertdialog" aria-modal="true" aria-labelledby="profile-saved-title" onClick={(event) => event.stopPropagation()}>
            <div className="profile-saved-icon" aria-hidden="true">✓</div>
            <h2 id="profile-saved-title">Profile saved successfully</h2>
            <p>Your {profileTab === "personal" ? "personal" : "educational"} profile details have been updated.</p>
            <button className="primary-button" type="button" onClick={() => setProfileSavedOpen(false)}>Done</button>
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

function getProfileCacheKey() {
  return localStorage.getItem("user_email") || "authenticated";
}

function readProfileCache(cacheKey) {
  try {
    const cache = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || "{}");
    const entry = cache[cacheKey];
    return entry ? entry.data : null;
  } catch {
    return null;
  }
}

function writeProfileCache(cacheKey, data) {
  try {
    const cache = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || "{}");
    cache[cacheKey] = { cachedAt: Date.now(), data };
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Caching is best effort; the API remains the source of truth.
  }
}

function invalidateProfileCache(cacheKey) {
  try {
    const cache = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || "{}");
    delete cache[cacheKey];
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Caching is best effort; the API remains the source of truth.
  }
}

function getProfilePictureUrl(data) {
  const picture = data?.profile_picture
    || data?.profile_picture_url
    || data?.avatar_url
    || data?.avatar
    || data?.picture
    || data?.personal?.profile_picture_url
    || data?.personal?.profile_picture
    || data?.personal_profile?.profile_picture
    || data?.personal_profile?.profile_picture_url
    || data?.user?.profile_picture
    || data?.user?.profile_picture_url;

  if (typeof picture === "string") return picture;
  if (picture && typeof picture === "object") {
    return picture.url || picture.image_url || picture.path || "";
  }
  return "";
}

async function resolveProfilePictureUrl(url) {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;

  try {
    const response = await authenticatedFetch(url);
    if (!response.ok) return "";
    return URL.createObjectURL(await response.blob());
  } catch {
    return "";
  }
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

function ProfileField({ label, hint, children }) {
  return <label className="profile-field"><span>{label}{hint ? <small>{hint}</small> : null}</span>{children}</label>;
}

function ProfileSelect({ value, options, onChange, ariaLabel, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value);

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

  return <div className={`profile-select ${open ? "open" : ""}`} ref={rootRef}>
    <button type="button" className="profile-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
      <span>{selectedOption?.label || "Select an option"}</span>
      <span className="profile-multi-select-chevron" aria-hidden="true" />
    </button>
    {open ? <div className="profile-select-menu" role="listbox" aria-label={ariaLabel}>
      {options.map((option) => (
        <button type="button" role="option" aria-selected={option.value === value} className={`profile-select-option ${option.value === value ? "selected" : ""}`} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>
          {option.label}
        </button>
      ))}
    </div> : null}
  </div>;
}

function ProfileMultiSelect({ values, options, placeholder, onChange, disabled = false, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

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

  const toggle = (value) => {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };
  const selectedLabels = options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label)
    .join(", ");

  return <div className={`profile-multi-select ${open ? "open" : ""}`} ref={rootRef}>
    <button type="button" className="profile-multi-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
      <span className={values.length ? "selected-values" : "placeholder"}>{selectedLabels || placeholder}</span>
      <span className="profile-multi-select-chevron" aria-hidden="true" />
    </button>
    {open ? <div className="profile-multi-select-menu" role="listbox" aria-label={ariaLabel} aria-multiselectable="true">
      {options.map((option) => {
        const selected = values.includes(option.value);
        return <button type="button" role="option" aria-selected={selected} className={`profile-multi-select-option ${selected ? "selected" : ""}`} key={option.value} onClick={() => toggle(option.value)}>
          <span className="profile-multi-select-check" aria-hidden="true">{selected ? "✓" : ""}</span>
          <span>{option.label}</span>
        </button>;
      })}
    </div> : null}
  </div>;
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
