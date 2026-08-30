import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alphamax | Where Every Moment Becomes a Masterpiece",
  description:
    "A premium wedding venue where timeless elegance meets natural beauty. Discover Alphamax.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <link
          rel="preload"
          as="video"
          href="/videos/wedding-venue-hero.mp4"
          type="video/mp4"
          fetchPriority="high"
        />
        {/* Early prioritized timeline-video loading — media-gated so each
            device fetches exactly its own aspect-crop set. Clip 1 (the back
            half of the 20s timeline) is still prepared in the background but
            at low priority so it never competes with clip 0 or the hero. */}
        <link
          rel="preload"
          as="video"
          href="/videos/VIDEO 2 MOBILE - scrub.mp4"
          type="video/mp4"
          media="(max-width: 767px)"
          fetchPriority="high"
        />
        <link
          rel="preload"
          as="video"
          href="/videos/VIDEO 2 - scrub.mp4"
          type="video/mp4"
          media="(min-width: 768px)"
          fetchPriority="high"
        />
        <link
          rel="preload"
          as="video"
          href="/videos/VIDEO 3 MOBILE - scrub.mp4"
          type="video/mp4"
          media="(max-width: 767px)"
          fetchPriority="low"
        />
        <link
          rel="preload"
          as="video"
          href="/videos/VIDEO 3 - scrub.mp4"
          type="video/mp4"
          media="(min-width: 768px)"
          fetchPriority="low"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
