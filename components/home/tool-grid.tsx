"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TOOLS,
  TOOL_CATEGORIES,
  type Tool,
  type ToolCategory,
  type ToolCategoryId,
} from "@/lib/tools";

const cardClass =
  "group relative flex min-h-[240px] flex-col rounded-[20px] border bg-card p-4 transition-all hover:border-foreground/30 hover:shadow-[0_12px_32px_rgba(15,23,42,0.06)] md:min-h-[300px] md:rounded-[24px] md:p-6 dark:hover:shadow-[0_12px_32px_rgba(0,0,0,0.4)]";

function ToolCard({ tool, category }: { tool: Tool; category: ToolCategory }) {
  const Icon = tool.icon;
  const proposed = !tool.href;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2 md:gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-[-0.01em] md:text-lg">{tool.name}</h3>
          <p
            className={cn(
              "mt-0.5 text-[11px] font-medium md:text-xs",
              proposed ? "text-muted-foreground" : category.text,
            )}
          >
            {proposed ? `Usulan · ${category.label}` : category.label}
          </p>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background md:size-10">
          <Icon className="size-3.5 text-muted-foreground md:size-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-6 md:gap-4 md:pt-10">
        <p className="text-[13px] leading-relaxed text-foreground/80 md:text-sm">{tool.description}</p>
        {proposed ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground md:size-12">
            <Plus className="size-4 md:size-5" aria-hidden="true" />
          </span>
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform group-hover:scale-105 md:size-12">
            <ArrowUpRight className="size-4 md:size-5" aria-hidden="true" />
          </span>
        )}
      </div>
    </>
  );

  if (!tool.href) {
    return <div className={cn(cardClass, "border-dashed opacity-90")}>{body}</div>;
  }

  return (
    <Link
      href={tool.href}
      className={cn(
        cardClass,
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {body}
    </Link>
  );
}

export function ToolGrid() {
  const [filter, setFilter] = useState<ToolCategoryId | "all">("all");

  const tabs: { id: ToolCategoryId | "all"; label: string }[] = [
    { id: "all", label: "Semua" },
    ...TOOL_CATEGORIES.map(({ id, label }) => ({ id, label })),
  ];
  const visible = TOOLS.filter(
    (tool) => filter === "all" || tool.category === filter,
  );

  return (
    <section aria-labelledby="judul-alat" className="flex flex-col gap-8">
      <h1 id="judul-alat" className="text-5xl font-bold tracking-[-0.03em] sm:text-6xl">
        Dev <span className="text-muted-foreground/50">Toolbox</span>
      </h1>

      <div className="scrollbar-hide -mx-6 flex gap-6 overflow-x-auto border-b border-border/70 px-6">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={cn(
              "relative shrink-0 pb-2.5 text-sm font-medium transition-colors",
              filter === id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {filter === id && (
              <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-foreground" />
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
        {visible.map((tool) => {
          const category = TOOL_CATEGORIES.find((c) => c.id === tool.category)!;
          return <ToolCard key={tool.id} tool={tool} category={category} />;
        })}
      </div>
    </section>
  );
}
