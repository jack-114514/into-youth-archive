import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "INTO / 青春纪事",
  description: "把青春留在风经过的地方——一个关于校园日常、照片与心事的私人青春档案。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "INTO / 青春纪事",
    description: "把青春留在风经过的地方",
    locale: "zh_CN",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "INTO / 青春纪事", description: "把青春留在风经过的地方" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
