"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { TOOLS } from "@/lib/tools";
import { cn } from "@/lib/utils";

/**
 * Header content shared by the home and tool pages. `className` sets how the
 * content sits in the header (centered or full width).
 */
export function HeaderBar({
  className,
  brand = true,
}: {
  className?: string;
  /** Show the logo and the Beranda link. Without them the name of the current tool is shown. */
  brand?: boolean;
}) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const currentTool = TOOLS.find((tool) => tool.href === pathname);
  const CurrentIcon = currentTool?.icon;

  return (
    <header className="w-full border-b bg-background">
      <div
        className={cn(
          "flex h-(--app-header) items-center justify-between gap-3",
          className,
        )}
      >
        <div className="flex items-center gap-5">
          {brand ? (
            <>
              <Link
                href="/"
                className="flex items-center gap-2 text-sm font-semibold"
              >
                <LayoutGrid className="size-[18px] text-blue-700 dark:text-blue-300" />
                <span className="hidden sm:inline">Dev Toolbox</span>
              </Link>
              <nav aria-label="Navigasi utama">
                <Link
                  href="/"
                  aria-current={pathname === "/" ? "page" : undefined}
                  className="inline-flex h-8 items-center rounded-lg bg-muted px-2.5 text-[13px] font-medium text-foreground"
                >
                  Beranda
                </Link>
              </nav>
            </>
          ) : (
            currentTool &&
            CurrentIcon && (
              <span className="flex items-center gap-2 text-sm font-semibold">
                <CurrentIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                {currentTool.name}
              </span>
            )
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden h-[34px] min-w-58 items-center gap-2 rounded-lg border bg-card pr-2 pl-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted sm:flex"
          >
            <Search className="size-3.5" aria-hidden="true" />
            <span className="flex-1 text-left">Cari alat atau aksi</span>
            <span className="rounded-[5px] border bg-muted px-1.5 py-px font-mono text-xs">
              ⌘K
            </span>
          </button>
          <button
            type="button"
            aria-label="Cari alat atau aksi"
            onClick={() => setPaletteOpen(true)}
            className="flex size-[34px] items-center justify-center rounded-lg border bg-card text-foreground transition-colors hover:bg-muted sm:hidden"
          >
            <Search className="size-3.5" aria-hidden="true" />
          </button>
          <ThemeToggle />
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
