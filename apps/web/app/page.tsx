import { loadWebConfig } from "@creatorcore/config";
import { getServerSession } from "../lib/api";
import { DiscordSignInButton, SignOutButton } from "./components/auth-buttons";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ArrowRight, Server, Shield } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = loadWebConfig();
  const session = await getServerSession();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-4 sm:p-8">
      {/* Top utility bar */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md shadow-md border-border">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-xl shadow-xs">
            C
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {config.NEXT_PUBLIC_APP_NAME}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            Control-plane foundation operational.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-2">
          {session ? (
            <div id="authenticated-view" className="space-y-4">
              <div className="rounded-md bg-muted/60 p-3 text-center">
                <p id="user-greeting" className="text-sm font-medium text-foreground">
                  Signed in as:{" "}
                  <strong id="user-display-name" className="text-foreground font-semibold">
                    {session.user.name}
                  </strong>
                </p>
                {session.user.email && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {session.user.email}
                  </p>
                )}
              </div>

              <div className="pt-1">
                <Button id="select-guild-link" asChild className="w-full">
                  <a href="/guilds" className="flex items-center justify-center gap-2">
                    <Server className="h-4 w-4" />
                    <span>Manage Discord Guilds</span>
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>

              <div className="flex justify-center pt-2">
                <SignOutButton />
              </div>
            </div>
          ) : (
            <div id="unauthenticated-view" className="space-y-4">
              <p className="text-sm text-muted-foreground text-center leading-relaxed">
                Sign in with your Discord account to manage your branded bots and server
                configurations.
              </p>

              <div className="pt-2">
                <DiscordSignInButton />
              </div>

              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-3 border-t border-border">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Requires Administrator permissions on Discord</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
