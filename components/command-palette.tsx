"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LayoutGrid, Moon, Search, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TOOLS, TOOL_CATEGORIES } from "@/lib/tools";
import { cn } from "@/lib/utils";

interface Entry {
  id: string;
  group: "Alat" | "Aksi";
  label: string;
  hint: string;
  icon: LucideIcon;
  tile: string;
  searchText: string;
  /** Proposed tools cannot be opened yet. */
  disabled?: boolean;
  run?: () => void;
}

const kbdClass =
  "rounded-[5px] border bg-muted px-1.5 py-px font-mono text-xs text-muted-foreground";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active, query]);

  const close = () => {
    setQuery("");
    setActive(0);
    onOpenChange(false);
  };

  const entries: Entry[] = [
    ...TOOLS.map((tool): Entry => {
      const category = TOOL_CATEGORIES.find((c) => c.id === tool.category)!;
      return {
        id: tool.id,
        group: "Alat",
        label: tool.name,
        hint: category.label,
        icon: tool.icon,
        tile: category.tile,
        searchText: `${tool.name} ${tool.description} ${category.label}`,
        disabled: !tool.href,
        run: tool.href ? () => router.push(tool.href!) : undefined,
      };
    }),
    {
      id: "home",
      group: "Aksi",
      label: "Buka Beranda",
      hint: "Halaman",
      icon: LayoutGrid,
      tile: "bg-muted text-muted-foreground",
      searchText: "beranda home halaman utama semua alat",
      run: () => router.push("/"),
    },
    {
      id: "toggle-theme",
      group: "Aksi",
      label: theme === "dark" ? "Ganti ke tema terang" : "Ganti ke tema gelap",
      hint: "Tema",
      icon: Moon,
      tile: "bg-muted text-muted-foreground",
      searchText: "ganti tema gelap terang theme dark light",
      run: () => setTheme(theme === "dark" ? "light" : "dark"),
    },
  ];

  const needle = query.trim().toLowerCase();
  const results = entries.filter(
    (entry) => !needle || entry.searchText.toLowerCase().includes(needle),
  );
  // Proposed tools are listed last and skipped by the keyboard.
  const selectable = results.filter((entry) => !entry.disabled);
  const activeEntry = selectable[Math.min(active, selectable.length - 1)];

  const choose = (entry: Entry | undefined) => {
    if (!entry?.run) return;
    entry.run();
    close();
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (selectable.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + selectable.length) % selectable.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(activeEntry);
    }
  };

  const groups = (["Alat", "Aksi"] as const)
    .map((group) => ({
      group,
      items: [
        ...results.filter((e) => e.group === group && !e.disabled),
        ...results.filter((e) => e.group === group && e.disabled),
      ],
    }))
    .filter(({ items }) => items.length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent
        showCloseButton={false}
        className="top-24 translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[660px]"
      >
        <DialogTitle className="sr-only">Pencarian cepat</DialogTitle>
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Search className="size-[18px] text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Cari alat atau aksi"
            aria-label="Cari alat atau aksi"
            className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <span className={kbdClass}>esc</span>
        </div>

        <div className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
          {groups.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Tidak ada hasil untuk &ldquo;{query}&rdquo;.
            </p>
          )}
          {groups.map(({ group, items }) => (
            <div key={group} className="flex flex-col gap-0.5 pb-2 last:pb-0">
              <p className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                {group}
              </p>
              {items.map((entry) => {
                const Icon = entry.icon;
                const isActive = entry === activeEntry;
                return (
                  <button
                    key={entry.id}
                    ref={isActive ? activeRef : undefined}
                    type="button"
                    disabled={entry.disabled}
                    onClick={() => choose(entry)}
                    onMouseMove={() => {
                      const index = selectable.indexOf(entry);
                      if (index >= 0) setActive(index);
                    }}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left text-sm",
                      isActive && "bg-muted",
                      entry.disabled && "cursor-default",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg",
                        entry.tile,
                      )}
                    >
                      <Icon className="size-[15px]" aria-hidden="true" />
                    </span>
                    <span className="flex-1 font-medium">{entry.label}</span>
                    {entry.disabled && (
                      <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        Usulan
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{entry.hint}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t bg-muted/60 px-4 py-2.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className={kbdClass}>↑↓</span>Pilih
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={kbdClass}>↵</span>Buka
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={kbdClass}>esc</span>Tutup
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
