"use client";

import { useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  WifiOff,
  Cpu,
  FolderOpen,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  {
    icon: WifiOff,
    title: "완전 로컬 처리",
    body: "업로드한 학생부 PDF와 변환 결과(JSON · db3 · DB)는 전부 이 컴퓨터 안에서만 처리·저장됩니다. 외부 서버나 클라우드로 전송하지 않습니다.",
  },
  {
    icon: ShieldCheck,
    title: "인터넷 없이 동작",
    body: "네트워크가 차단된 환경에서도 변환·조회·내보내기가 정상 동작합니다. 직접 인터넷을 끊고 사용해 확인하실 수 있습니다.",
  },
  {
    icon: Cpu,
    title: "변환 엔진도 이 PC 안에서",
    body: "PDF 분석은 동봉된 엔진(opendataloader-pdf, Java)이 이 PC에서 직접 수행합니다. 외부 AI/클라우드 변환 서비스를 호출하지 않습니다.",
  },
  {
    icon: FolderOpen,
    title: "저장 위치 직접 확인",
    body: "모든 파일은 내 PC의 데이터 폴더에만 있습니다. 상단 메뉴 [도움말 → 데이터 폴더 열기]로 직접 확인·삭제할 수 있습니다.",
  },
  {
    icon: RefreshCw,
    title: "인터넷을 쓰는 유일한 경우",
    body: "오직 '업데이트 확인'뿐입니다. 그때도 학생부 파일이나 변환 데이터는 전송되지 않습니다.",
  },
];

export function OfflineBadge() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="개인정보 보호 방식 자세히 보기"
        className="group flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3 py-1.5 text-[11px] font-medium text-emerald-600 outline-none transition-colors hover:bg-emerald-500/10 focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:text-emerald-400"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        오프라인 · 로컬 전용
        <ChevronDown
          className={cn("h-3 w-3 opacity-60 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] origin-top-right animate-in fade-in-0 zoom-in-95 rounded-xl border bg-popover p-3.5 text-popover-foreground shadow-lg duration-150"
        >
          {/* 배지를 가리키는 작은 화살표 */}
          <div className="absolute -top-1.5 right-4 h-3 w-3 rotate-45 border-l border-t bg-popover" />

          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold">개인정보는 인터넷으로 나가지 않습니다</p>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            학생부는 민감한 개인정보입니다. 처음부터 끝까지{" "}
            <span className="font-medium text-foreground">내 PC 안에서만</span> 동작합니다.
          </p>

          <ul className="mt-3 space-y-2.5">
            {ITEMS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
