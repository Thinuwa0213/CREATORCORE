"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { connectGuildAction } from "../actions";

export interface GuildItem {
  id: string;
  name: string;
  connected: boolean;
}

export function GuildCard({ guild }: { guild: GuildItem }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    const res = await connectGuildAction(guild.id);
    if (!res.ok || !res.tenantId) {
      setError(res.error ?? "Failed to connect guild");
      setLoading(false);
      return;
    }

    router.push(`/tenants/${res.tenantId}/guilds/${guild.id}`);
  };

  return (
    <li
      id={`guild-item-${guild.id}`}
      data-testid="guild-item"
      data-guild-id={guild.id}
      style={{
        padding: "1rem",
        borderRadius: "6px",
        border: "1px solid #e5e7eb",
        marginBottom: "0.75rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#ffffff",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: "1rem" }} id={`guild-name-${guild.id}`}>
          {guild.name}
        </div>
        <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>ID: {guild.id}</div>
        <div style={{ marginTop: "0.25rem" }}>
          <span
            id={`guild-connection-badge-${guild.id}`}
            style={{
              display: "inline-block",
              padding: "0.125rem 0.5rem",
              borderRadius: "9999px",
              fontSize: "0.75rem",
              fontWeight: 500,
              backgroundColor: guild.connected ? "#dcfce7" : "#f3f4f6",
              color: guild.connected ? "#15803d" : "#4b5563",
            }}
          >
            {guild.connected ? "Connected" : "Not Connected"}
          </span>
        </div>
        {error && (
          <div
            id={`guild-error-${guild.id}`}
            style={{ color: "#b91c1c", fontSize: "0.875rem", marginTop: "0.5rem" }}
          >
            {error}
          </div>
        )}
      </div>

      <div>
        <button
          id={`connect-guild-button-${guild.id}`}
          onClick={handleConnect}
          disabled={loading}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: guild.connected ? "#2563eb" : "#059669",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Connecting..." : guild.connected ? "Manage Guild" : "Connect"}
        </button>
      </div>
    </li>
  );
}
