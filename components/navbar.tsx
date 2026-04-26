"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileJson, FileCode, Terminal } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    {
      name: "Converter",
      href: "/",
      icon: <FileCode className="h-4 w-4" />,
    },
    {
      name: "Manipulation",
      href: "/json-manipulation",
      icon: <Terminal className="h-4 w-4" />,
    },
  ];

  return (
    <header className="px-4 bg-background border-b w-full">
      <div className="container mx-auto flex h-14 items-center justify-between w-full">
        <div className="mr-4 flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <FileJson className="h-6 w-6 text-blue-500" />
            <span className="hidden font-bold sm:inline-block">
              JSON Master
            </span>
          </Link>
          <nav className="flex items-center gap-2 text-sm font-medium">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors px-3 py-1.5 h-9 gap-2",
                  pathname === item.href
                    ? "bg-slate-950 text-white border border-transparent dark:bg-white dark:text-slate-950"
                    : "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {item.icon}
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
