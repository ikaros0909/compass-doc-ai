import type { Metadata } from "next";
import "./globals.css";
import { UpdaterToast } from "@/components/UpdaterToast";
import { SecurityGate } from "@/components/SecurityGate";

export const metadata: Metadata = {
  title: "Compass Doc AI — 학생부를 안전하게 데이터로",
  description:
    "학생부 PDF를 내 PC에서 안전하게 데이터(JSON·db3)로 변환합니다. 완전 오프라인·로컬 처리.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="h-screen overflow-hidden bg-background antialiased">
        <SecurityGate>{children}</SecurityGate>
        <UpdaterToast />
      </body>
    </html>
  );
}
