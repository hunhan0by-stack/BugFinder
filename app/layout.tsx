import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Frontend Bug Finder",
  description: "A beginner-friendly frontend quality assurance scanner.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="bg-background text-foreground min-h-full font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
