import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../lib/api";
import { GuildCard, type GuildItem } from "../components/guild-card";

export const dynamic = "force-dynamic";

export default async function GuildsPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/");
  }

  const res = await callApiServer<{ guilds: GuildItem[] }>("/app/guilds");

  if (!res.ok || !res.data) {
    return (
      <main style={{ padding: "2rem", maxWidth: "640px", margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
        <h1>Guild Selection</h1>
        <div id="guilds-error-message" style={{ color: "#b91c1c", marginTop: "1rem" }}>
          Failed to load manageable guilds: {res.error ?? "Access denied or Discord unavailable"}
        </div>
        <div style={{ marginTop: "1.5rem" }}>
          <a href="/" style={{ color: "#2563eb" }}>&larr; Back to Home</a>
        </div>
      </main>
    );
  }

  const guilds = res.data.guilds;

  return (
    <main style={{ padding: "2rem", maxWidth: "640px", margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>Manageable Discord Guilds</h1>
          <p style={{ margin: "0.25rem 0 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
            Select a guild to connect or manage its branded bot.
          </p>
        </div>
        <a href="/" style={{ color: "#6b7280", fontSize: "0.875rem", textDecoration: "none" }}>Home</a>
      </div>

      {guilds.length === 0 ? (
        <div id="no-guilds-message" style={{ padding: "2rem", textAlign: "center", border: "1px dashed #d1d5db", borderRadius: "6px" }}>
          No manageable Discord guilds found for your account.
        </div>
      ) : (
        <ul id="manageable-guilds-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {guilds.map((guild) => (
            <GuildCard key={guild.id} guild={guild} />
          ))}
        </ul>
      )}
    </main>
  );
}
