"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportDeleteButton({ id, fileName }: { id: string; fileName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const doDelete = async () => {
    if (busy) return;
    if (!confirm(`${fileName} 을 삭제할까요? (파일과 히스토리 모두 삭제됩니다)`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/exports/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        alert(`삭제 실패: ${res.status} ${body}`);
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        fileRemoved?: boolean;
        fileErrors?: string[];
      } | null;
      if (data && data.fileRemoved === false) {
        alert(
          `히스토리는 삭제되었지만 파일은 제거하지 못했습니다:\n${(
            data.fileErrors ?? []
          ).join("\n")}`
        );
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={doDelete}
      disabled={busy}
      className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      삭제
    </Button>
  );
}
