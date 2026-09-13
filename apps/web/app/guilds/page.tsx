import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../lib/api";
import { GuildCard, type GuildItem } from "../components/guild-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Server, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function GuildsPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/");
  }

  const res = await callApiServer<{ guilds: GuildItem[] }>("/app/guilds");

  if (!res.ok || !res.data) {
    return (
      <main className="min-h-screen bg-background p-4 sm:p-8 flex items-center justify-center">
        <div className="w-full max-w-lg rounded-lg border border-destructive/20 bg-destructive/5 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <h1 className="text-lg font-semibold">Guild Selection Error</h1>
          </div>
          <p id="guilds-error-message" className="text-sm text-destructive mt-1">
            Failed to load manageable guilds: {res.error ?? "Access denied or Discord unavailable"}
          </p>
          <div className="mt-6 pt-4 border-t border-destructive/15">
            <Button variant="outline" size="sm" asChild>
              <a href="/" className="flex items-center gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Home</span>
              </a>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const guilds = res.data.guilds;

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navbar */}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 sm:px-8 backdrop-blur-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-black text-sm">
            C
          </div>
          <span className="font-bold text-base tracking-tight">CreatorCore</span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <UserMenu user={session.user} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-border">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Manageable Discord Guilds
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Select a guild to connect or manage its branded bot.
            </p>
          </div>

          <Button variant="ghost" size="sm" asChild>
            <a
              href="/"
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Home</span>
            </a>
          </Button>
        </div>

        {guilds.length === 0 ? (
          <div
            id="no-guilds-message"
            className="rounded-lg border border-dashed border-border bg-card/50 p-10 text-center"
          >
            <Server className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">
              No manageable Discord guilds found for your account.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Ensure you have Administrator or Manage Server permissions on Discord.
            </p>
          </div>
        ) : (
          <ul id="manageable-guilds-list" className="p-0 m-0">
            {guilds.map((guild) => (
              <GuildCard key={guild.id} guild={guild} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
