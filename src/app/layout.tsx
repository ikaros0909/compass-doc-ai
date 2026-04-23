import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compass Doc AI — 학생부 PDF → JSON 변환",
  description:
    "학생부 PDF를 Drag & Drop으로 일괄 업로드하여 JSON으로 변환하고 목록/상세를 관리합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="h-screen overflow-hidden bg-background antialiased">{children}</body>
    </html>
  );
}
