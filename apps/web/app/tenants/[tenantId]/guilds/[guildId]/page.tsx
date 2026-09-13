import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    tenantId: string;
    guildId: string;
  }>;
}

export default async function GuildOverviewPage({ params }: PageProps) {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  const { tenantId, guildId } = await params;

  const res = await callApiServer<{
    status:
      | "NOT_CONFIGURED"
      | "PENDING_CREDENTIAL"
      | "UNASSIGNED"
      | "ACTIVE_ASSIGNMENT"
      | "ONLINE"
      | "DEGRADED"
      | "OFFLINE";
    botApplicationId: string | null;
  }>(`/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/runtime-status`);

  if (!res.ok || !res.data) {
    return (
      <main style={{ padding: "2rem", maxWidth: "640px", margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
        <div
          id="access-denied-container"
          style={{
            padding: "1.5rem",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "6px",
          }}
        >
          <h1 style={{ color: "#991b1b", fontSize: "1.25rem", margin: 0 }}>Access Denied</h1>
          <p id="access-denied-message" style={{ color: "#b91c1c", marginTop: "0.5rem" }}>
            {res.error ?? "You do not have access to this guild or tenant."}
          </p>
          <a href="/guilds" style={{ color: "#2563eb", marginTop: "1rem", display: "inline-block" }}>
            &larr; Back to Guild Selection
          </a>
        </div>
      </main>
    );
  }

  const { status, botApplicationId } = res.data;

  const getBadgeColor = (st: string) => {
    switch (st) {
      case "ONLINE":
        return { bg: "#dcfce7", text: "#15803d" };
      case "ACTIVE_ASSIGNMENT":
        return { bg: "#e0e7ff", text: "#3730a3" };
      case "UNASSIGNED":
        return { bg: "#fef9c3", text: "#854d0e" };
      case "NOT_CONFIGURED":
        return { bg: "#f3f4f6", text: "#4b5563" };
      case "DEGRADED":
      case "OFFLINE":
      default:
        return { bg: "#fee2e2", text: "#991b1b" };
    }
  };

  const badgeStyle = getBadgeColor(status);

  return (
    <main style={{ padding: "2rem", maxWidth: "640px", margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>Guild Overview</h1>
        <a href="/guilds" style={{ color: "#2563eb", fontSize: "0.875rem" }}>&larr; Guilds</a>
      </div>

      <div
        id="guild-overview-card"
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
          padding: "1.5rem",
          boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        }}
      >
        <section style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "0.875rem", textTransform: "uppercase", color: "#6b7280", margin: "0 0 0.5rem 0" }}>
            Guild Identity
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: "0.5rem", fontSize: "0.875rem" }}>
            <span style={{ color: "#6b7280" }}>Discord Guild ID:</span>
            <strong id="overview-guild-id">{guildId}</strong>
            <span style={{ color: "#6b7280" }}>Tenant ID:</span>
            <code id="overview-tenant-id" style={{ backgroundColor: "#f3f4f6", padding: "0.125rem 0.25rem", borderRadius: "3px" }}>
              {tenantId}
            </code>
          </div>
        </section>

        <hr style={{ margin: "1.25rem 0", borderColor: "#f3f4f6" }} />

        <section style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "0.875rem", textTransform: "uppercase", color: "#6b7280", margin: "0 0 0.5rem 0" }}>
            Bot Application Status
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: "0.5rem", fontSize: "0.875rem" }}>
            <span style={{ color: "#6b7280" }}>Application:</span>
            <span id="overview-bot-app-status">
              {botApplicationId ? `Configured (${botApplicationId})` : "Not Configured"}
            </span>
            <span style={{ color: "#6b7280" }}>Credential:</span>
            <span id="overview-credential-status">
              {status === "NOT_CONFIGURED" ? "None" : "Stored & Encrypted"}
            </span>
          </div>
        </section>

        <hr style={{ margin: "1.25rem 0", borderColor: "#f3f4f6" }} />

        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "0.875rem", textTransform: "uppercase", color: "#6b7280", margin: "0 0 0.5rem 0" }}>
            Authoritative Runtime Status
          </h2>
          <div style={{ marginTop: "0.5rem" }}>
            <span
              id="overview-runtime-status-badge"
              data-status={status}
              style={{
                display: "inline-block",
                padding: "0.25rem 0.75rem",
                borderRadius: "9999px",
                fontSize: "0.875rem",
                fontWeight: 600,
                backgroundColor: badgeStyle.bg,
                color: badgeStyle.text,
              }}
            >
              {status}
            </span>
          </div>
        </section>

        <div id="setup-action-container" style={{ marginTop: "1.5rem" }}>
          {status === "NOT_CONFIGURED" ? (
            <a
              id="setup-bot-link"
              href={`/tenants/${tenantId}/guilds/${guildId}/setup`}
              style={{
                display: "inline-block",
                padding: "0.625rem 1.25rem",
                backgroundColor: "#2563eb",
                color: "white",
                textDecoration: "none",
                borderRadius: "4px",
                fontWeight: 600,
              }}
            >
              Configure Discord Bot &rarr;
            </a>
          ) : (
            <div id="bot-configured-notice" style={{ color: "#059669", fontSize: "0.875rem", fontWeight: 500 }}>
              ✓ Bot application configured and active.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
