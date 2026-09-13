import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadWebConfig } from "@creatorcore/config";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const config = loadWebConfig();

export const metadata: Metadata = {
  title: config.NEXT_PUBLIC_APP_NAME,
  description: "CreatorCore control-plane foundation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
