"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { onboardBotAction } from "../actions";

interface BotSetupFormProps {
  tenantId: string;
  guildId: string;
}

export function BotSetupForm({ tenantId, guildId }: BotSetupFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const tokenInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Capture secret token locally
    const secretToken = token.trim();
    const botName = name.trim() || "Discord Bot";

    // SECURITY: Immediately erase token from React state and DOM input element
    setToken("");
    if (tokenInputRef.current) {
      tokenInputRef.current.value = "";
    }

    if (!secretToken) {
      setError("Bot token is required.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await onboardBotAction(tenantId, guildId, botName, secretToken);
        if (!result.ok) {
          // Never disclose token in error message
          setError(result.error ?? "Failed to configure bot application");
          return;
        }

        // On success, redirect back to guild overview
        router.push(`/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}`);
      } catch {
        setError("An unexpected network error occurred while submitting credentials.");
      }
    });
  };

  return (
    <form
      id="bot-setup-form"
      onSubmit={handleSubmit}
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "8px",
        border: "1px solid #e5e7eb",
        padding: "1.5rem",
        boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      }}
    >
      <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 1rem 0" }}>
        Configure Discord Bot Credentials
      </h2>

      <p style={{ fontSize: "0.875rem", color: "#4b5563", marginBottom: "1.5rem" }}>
        Provide your Discord Bot Token to configure this guild. Your token will be envelope-encrypted
        using the backend KMS before storage. It is never stored in browser storage and is cleared
        from memory immediately upon submission.
      </p>

      {error && (
        <div
          id="bot-setup-error"
          role="alert"
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "4px",
            color: "#991b1b",
            fontSize: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginBottom: "1.25rem" }}>
        <label
          htmlFor="bot-name-input"
          style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.5rem" }}
        >
          Bot Application Name
        </label>
        <input
          id="bot-name-input"
          name="bot-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My Community Bot"
          style={{
            width: "100%",
            padding: "0.5rem 0.75rem",
            borderRadius: "4px",
            border: "1px solid #d1d5db",
            fontSize: "0.875rem",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <label
          htmlFor="bot-token-input"
          style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.5rem" }}
        >
          Bot Token
        </label>
        <input
          ref={tokenInputRef}
          id="bot-token-input"
          name="bot-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="MTAx..."
          required
          style={{
            width: "100%",
            padding: "0.5rem 0.75rem",
            borderRadius: "4px",
            border: "1px solid #d1d5db",
            fontSize: "0.875rem",
            boxSizing: "border-box",
            fontFamily: "monospace",
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
        <a
          href={`/tenants/${tenantId}/guilds/${guildId}`}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#f3f4f6",
            color: "#374151",
            textDecoration: "none",
            borderRadius: "4px",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          Cancel
        </a>
        <button
          id="submit-bot-credentials-btn"
          type="submit"
          disabled={isPending}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: isPending ? "#93c5fd" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          {isPending ? "Configuring..." : "Save Credentials"}
        </button>
      </div>
    </form>
  );
}
