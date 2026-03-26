import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  openGraph: { images: ["https://pflisxkcxbzboxwidywf.supabase.co/storage/v1/object/public/images/AHC%20droid%20head.webp"] },
  icons: { icon: "https://pflisxkcxbzboxwidywf.supabase.co/storage/v1/object/public/images/AHC%20droid%20head.webp", apple: "https://pflisxkcxbzboxwidywf.supabase.co/storage/v1/object/public/images/AHC%20droid%20head.webp" }, title: 'Bridge Worker Intake', description: 'T4H Bridge Execution Intake' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
