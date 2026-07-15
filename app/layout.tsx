import type { Metadata } from "next";
import "./globals.css";

const title = "Excogitare — Civ5 Map Viewer & Editor";
const description = "Open, generate, edit, and export Civilization V maps directly in your browser.";
const siteUrl = (process.env.NEXT_PUBLIC_EXCOGITARE_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const imageUrl = `${siteUrl}/og-editor.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    url: siteUrl,
    images: [{ url: imageUrl, width: 2400, height: 1260, alt: "Excogitare social card with a cropped isometric Civilization V map render" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [imageUrl],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
