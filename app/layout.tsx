import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GT corpus — local chat",
  description: "Ask the UK Tech Nation Visa Forum corpus, locally.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
