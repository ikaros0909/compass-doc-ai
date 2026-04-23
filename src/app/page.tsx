import { JobQueue } from "@/components/JobQueue";
import { FileJson2 } from "lucide-react";

export default function HomePage() {
  return (
    <main className="container mx-auto max-w-[1400px] py-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileJson2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Compass Doc AI</h1>
            <p className="text-xs text-muted-foreground">
              학생부 PDF → JSON 배치 변환 · opendataloader-pdf 기반
            </p>
          </div>
        </div>
      </header>
      <JobQueue />
    </main>
  );
}
