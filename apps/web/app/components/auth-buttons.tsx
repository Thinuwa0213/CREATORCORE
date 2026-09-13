"use client";

import { authClient } from "../../lib/auth-client";
import { useState } from "react";

export function DiscordSignInButton() {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await authClient.signIn.social({
        provider: "discord",
        callbackURL: "/guilds",
      });
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      id="discord-sign-in-button"
      onClick={handleSignIn}
      disabled={loading}
      style={{
        padding: "0.75rem 1.5rem",
        backgroundColor: "#5865F2",
        color: "white",
        border: "none",
        borderRadius: "4px",
        fontSize: "1rem",
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
      }}
    >
      {loading ? "Redirecting to Discord..." : "Sign in with Discord"}
    </button>
  );
}

export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await authClient.signOut();
      window.location.href = "/";
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      id="sign-out-button"
      onClick={handleSignOut}
      disabled={loading}
      style={{
        padding: "0.5rem 1rem",
        backgroundColor: "#374151",
        color: "white",
        border: "none",
        borderRadius: "4px",
        fontSize: "0.875rem",
        cursor: "pointer",
        marginTop: "1rem",
      }}
    >
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}
