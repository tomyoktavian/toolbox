"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TOOLS,
  TOOL_CATEGORIES,
  type Tool,
  type ToolCategory,
  type ToolCategoryId,
} from "@/lib/tools";

const cardClass =
  "flex min-w-0 flex-col gap-3 rounded-[14px] border p-5";

function ToolCard({ tool, category }: { tool: Tool; category: ToolCategory }) {
  const Icon = tool.icon;
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-[10px]",
            category.tile,
          )}
        >
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        {tool.href ? (
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            Usulan
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{tool.name}</h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {tool.description}
        </p>
      </div>
      <p className={cn("mt-auto text-xs font-medium", category.text)}>
        {category.label}
      </p>
    </>
  );

  if (!tool.href) {
    return <div className={cn(cardClass, "border-dashed")}>{body}</div>;
  }

  return (
    <Link
      href={tool.href}
      className={cn(
        cardClass,
        "bg-card transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {body}
    </Link>
  );
}

export function ToolGrid() {
  const [filter, setFilter] = useState<ToolCategoryId | "all">("all");

  const filters: { id: ToolCategoryId | "all"; label: string }[] = [
    { id: "all", label: "Semua" },
    ...TOOL_CATEGORIES.map(({ id, label }) => ({ id, label })),
  ];
  const visible = TOOLS.filter(
    (tool) => filter === "all" || tool.category === filter,
  );

  return (
    <section aria-labelledby="judul-alat" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="judul-alat"
          className="text-xl font-semibold tracking-[-0.01em]"
        >
          Semua alat
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {filters.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={cn(
                "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
                filter === id
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {visible.map((tool) => {
          const category = TOOL_CATEGORIES.find((c) => c.id === tool.category)!;
          return <ToolCard key={tool.id} tool={tool} category={category} />;
        })}
      </div>
    </section>
  );
}
