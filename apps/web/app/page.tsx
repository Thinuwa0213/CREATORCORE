import { loadWebConfig } from "@creatorcore/config";

export default function HomePage() {
  const config = loadWebConfig();

  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          {config.NEXT_PUBLIC_APP_NAME}
        </h1>
        <p style={{ marginTop: "0.5rem", color: "GrayText" }}>
          Control-plane foundation operational.
        </p>
      </div>
    </main>
  );
}
