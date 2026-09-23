import React from "react";
import logoUrl from "./assets/gurudock-logo.png";
import AuthModal from "./AuthModal";

export default function AuthRequiredPage({ destination = "/" }) {
  const finishAuthentication = () => {
    window.history.replaceState({}, "", destination);
    window.dispatchEvent(new Event("auth-changed"));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <main className="auth-required-page">
      <section className="auth-required-brand">
        <img src={logoUrl} alt="GuruDock" />
        <strong>GuruDock</strong>
        <p>Your staffroom, organized. Generate question papers, worksheets and lesson plans in minutes.</p>
      </section>
      <section className="auth-required-form">
        <AuthModal
          mode="login"
          fullPage
          onAuthenticated={finishAuthentication}
        />
      </section>
    </main>
  );
}
