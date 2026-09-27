import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Excogitare — Civ5 Map Viewer & Editor";
const description = "Open, generate, edit, and export Civilization V maps directly in your browser.";
const siteUrl = (process.env.NEXT_PUBLIC_EXCOGITARE_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const imageUrl = `${siteUrl}/og-editor.png`;
const basePath = process.env.NEXT_PUBLIC_EXCOGITARE_BASE_PATH ?? "";

export const viewport: Viewport = { themeColor: "#252c40" };

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Excogitare",
  openGraph: {
    title,
    description,
    type: "website",
    url: siteUrl,
    images: [{ url: imageUrl, width: 2400, height: 1260, alt: "Excogitare social card with a cropped isometric Civilization V map render and the gold Wayfinder compass" }],
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
      <head>
        {/* Keep browser assets on this deployment even when the social URL is unset. */}
        <link rel="icon" href={`${basePath}/favicon.ico`} sizes="16x16 32x32 48x48" type="image/x-icon" />
        <link rel="icon" href={`${basePath}/favicon.svg`} sizes="any" type="image/svg+xml" />
        <link rel="apple-touch-icon" href={`${basePath}/apple-touch-icon.png`} sizes="180x180" />
        <link rel="manifest" href={`${basePath}/site.webmanifest`} />
      </head>
      <body>{children}</body>
    </html>
  );
}
