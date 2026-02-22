import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalentInfra | a fair hiring network powered by Zynd Protocol",
  description:
    "Human-first, bias-aware hiring operations powered by a multi-agent verification pipeline.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased bg-[var(--bg)] text-[var(--text)] min-h-screen">{children}</body>
    </html>
  );
}
