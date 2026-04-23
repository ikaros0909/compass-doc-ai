"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
interface JsonObject {
  [key: string]: JsonValue;
}
type JsonArray = JsonValue[];

interface JsonTreeViewerProps {
  data: JsonValue;
  defaultExpandDepth?: number;
}

export function JsonTreeViewer({ data, defaultExpandDepth = 2 }: JsonTreeViewerProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo<JsonValue>(() => {
    if (!search.trim()) return data;
    return filterJson(data, search.toLowerCase()) ?? data;
  }, [data, search]);

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="키 또는 값 검색…"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="rounded-md border bg-card p-3 font-mono text-xs leading-relaxed">
        <Node value={filtered} depth={0} defaultExpandDepth={defaultExpandDepth} keyName={null} />
      </div>
    </div>
  );
}

function Node({
  value,
  depth,
  defaultExpandDepth,
  keyName,
}: {
  value: JsonValue;
  depth: number;
  defaultExpandDepth: number;
  keyName: string | number | null;
}) {
  const [open, setOpen] = useState(depth < defaultExpandDepth);

  if (value === null) return <Leaf keyName={keyName} value="null" className="text-muted-foreground" />;
  if (typeof value === "string") return <Leaf keyName={keyName} value={JSON.stringify(value)} className="text-emerald-600 dark:text-emerald-400" />;
  if (typeof value === "number") return <Leaf keyName={keyName} value={String(value)} className="text-sky-600 dark:text-sky-400" />;
  if (typeof value === "boolean") return <Leaf keyName={keyName} value={String(value)} className="text-amber-600 dark:text-amber-400" />;

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as JsonArray).map((v, i) => [i, v] as const)
    : Object.entries(value as JsonObject);
  const count = entries.length;
  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 text-left hover:bg-accent/50"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        {keyName !== null && (
          <span className="text-purple-600 dark:text-purple-400">
            {typeof keyName === "number" ? `[${keyName}]` : JSON.stringify(keyName)}
          </span>
        )}
        {keyName !== null && <span className="text-muted-foreground">:</span>}
        <span className="text-muted-foreground">{bracketOpen}</span>
        {!open && (
          <span className="text-muted-foreground">
            {count} {isArray ? "items" : "keys"}
            {bracketClose}
          </span>
        )}
      </button>
      {open && (
        <div className={cn("ml-4 border-l border-border pl-3")}>
          {entries.map(([k, v]) => (
            <Node
              key={String(k)}
              keyName={k}
              value={v}
              depth={depth + 1}
              defaultExpandDepth={defaultExpandDepth}
            />
          ))}
          <div className="text-muted-foreground">{bracketClose}</div>
        </div>
      )}
    </div>
  );
}

function Leaf({
  keyName,
  value,
  className,
}: {
  keyName: string | number | null;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex gap-1">
      {keyName !== null && (
        <>
          <span className="text-purple-600 dark:text-purple-400">
            {typeof keyName === "number" ? `[${keyName}]` : JSON.stringify(keyName)}
          </span>
          <span className="text-muted-foreground">:</span>
        </>
      )}
      <span className={cn("break-all", className)}>{value}</span>
    </div>
  );
}

function filterJson(value: JsonValue, query: string): JsonValue | undefined {
  if (value === null || typeof value !== "object") {
    return String(value).toLowerCase().includes(query) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const kept = value
      .map((item) => filterJson(item, query))
      .filter((v): v is JsonValue => v !== undefined);
    return kept.length > 0 ? kept : undefined;
  }
  const next: JsonObject = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.toLowerCase().includes(query)) {
      next[k] = v;
      continue;
    }
    const kept = filterJson(v, query);
    if (kept !== undefined) next[k] = kept;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
