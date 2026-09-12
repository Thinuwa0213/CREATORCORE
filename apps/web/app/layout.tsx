import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadWebConfig } from "@creatorcore/config";
import "./globals.css";

const config = loadWebConfig();

export const metadata: Metadata = {
  title: config.NEXT_PUBLIC_APP_NAME,
  description: "CreatorCore control-plane foundation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
