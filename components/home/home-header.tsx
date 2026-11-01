"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutGrid, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";

/** Header of the home page: borderless, sitting on the soft blue wash like the reference. */
export function HomeHeader() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <header className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(110%_80%_at_55%_-15%,rgba(186,210,247,0.9),rgba(219,231,248,0.4)_45%,transparent_78%)] dark:bg-[radial-gradient(110%_80%_at_55%_-15%,rgba(59,130,246,0.18),rgba(59,130,246,0.06)_45%,transparent_78%)]"
      />
      <div className="relative mx-auto flex h-(--app-header) max-w-[1120px] items-center justify-between px-6">
        <Link
          href="/"
          aria-label="Dev Toolbox"
          className="flex size-10 items-center justify-center rounded-full border bg-card shadow-sm transition-colors hover:bg-muted"
        >
          <LayoutGrid className="size-[18px] text-blue-700 dark:text-blue-300" aria-hidden="true" />
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden h-10 items-center gap-2 rounded-full border bg-card pr-3 pl-4 text-[13px] text-muted-foreground shadow-sm transition-colors hover:bg-muted sm:flex"
          >
            <Search className="size-3.5" aria-hidden="true" />
            <span className="flex-1 text-left">Cari alat atau aksi</span>
            <span className="rounded-full border bg-muted px-2 py-0.5 font-mono text-[11px]">⌘K</span>
          </button>
          <button
            type="button"
            aria-label="Cari alat atau aksi"
            onClick={() => setPaletteOpen(true)}
            className="flex size-10 items-center justify-center rounded-full border bg-card text-foreground shadow-sm transition-colors hover:bg-muted sm:hidden"
          >
            <Search className="size-4" aria-hidden="true" />
          </button>
          <ThemeToggle />
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
