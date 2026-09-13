import { redirect } from "next/navigation";
import { getServerSession } from "../../../../../../lib/api";
import { BotSetupForm } from "../../../../../components/bot-setup-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    tenantId: string;
    guildId: string;
  }>;
}

export default async function BotSetupPage({ params }: PageProps) {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  const { tenantId, guildId } = await params;

  return (
    <main style={{ padding: "2rem", maxWidth: "560px", margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <a
          href={`/tenants/${tenantId}/guilds/${guildId}`}
          style={{ color: "#2563eb", fontSize: "0.875rem", textDecoration: "none" }}
        >
          &larr; Back to Guild Overview
        </a>
      </div>

      <BotSetupForm tenantId={tenantId} guildId={guildId} />
    </main>
  );
}
