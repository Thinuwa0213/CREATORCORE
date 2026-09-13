import { loadWebConfig } from "@creatorcore/config";
import { getServerSession } from "../lib/api";
import { DiscordSignInButton, SignOutButton } from "./components/auth-buttons";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = loadWebConfig();
  const session = await getServerSession();

  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          width: "100%",
          padding: "2rem",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
          {config.NEXT_PUBLIC_APP_NAME}
        </h1>
        <p style={{ marginTop: "0.5rem", color: "#6b7280" }}>
          Control-plane foundation operational.
        </p>

        <hr style={{ margin: "1.5rem 0", borderColor: "#f3f4f6" }} />

        {session ? (
          <div id="authenticated-view">
            <p id="user-greeting" style={{ margin: "0 0 1rem 0", fontWeight: 500 }}>
              Signed in as: <strong id="user-display-name">{session.user.name}</strong>
            </p>
            <div style={{ margin: "1rem 0" }}>
              <a
                id="select-guild-link"
                href="/guilds"
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
                Manage Discord Guilds &rarr;
              </a>
            </div>
            <SignOutButton />
          </div>
        ) : (
          <div id="unauthenticated-view">
            <p style={{ margin: "0 0 1.25rem 0", color: "#4b5563" }}>
              Sign in with your Discord account to manage your branded bots and server configurations.
            </p>
            <DiscordSignInButton />
          </div>
        )}
      </div>
    </main>
  );
}
