import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoganGPT",
  description: "Ask anything about Logan",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="text-white h-full antialiased">{children}</body>
    </html>
  );
}
