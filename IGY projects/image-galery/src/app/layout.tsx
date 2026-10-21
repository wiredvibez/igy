import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "קולאז׳",
  description: "מסך משותף שאליו כולם מעלים תמונות מהטלפון.",
};

export const viewport: Viewport = {
  themeColor: "#8d095b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={rubik.variable}>
      <body>{children}</body>
    </html>
  );
}
