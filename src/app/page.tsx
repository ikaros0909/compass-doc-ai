import { JobQueue } from "@/components/JobQueue";
import { FileJson2 } from "lucide-react";
import { OfflineBadge } from "@/components/OfflineBadge";
import { LockButton } from "@/components/LockButton";

export default function HomePage() {
  return (
    <main className="container mx-auto flex h-screen max-w-[1400px] flex-col py-6">
      <header className="mb-6 flex shrink-0 items-center justify-between border-b border-border/50 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-inset ring-white/10">
            <FileJson2 className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <h1 className="text-xl font-bold tracking-tight">
              <span className="text-foreground">Compass</span>
              <span className="ml-1 font-medium text-muted-foreground">Doc AI</span>
            </h1>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">
              학생부를 안전하게 데이터로
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <OfflineBadge />
          <LockButton />
        </div>
      </header>
      <JobQueue />
    </main>
  );
}
