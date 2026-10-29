"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileJson, FileCode, Terminal, Send } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    {
      name: "Converter",
      href: "/",
      icon: <FileCode className="h-3.5 w-3.5" />,
    },
    {
      name: "Manipulation",
      href: "/json-manipulation",
      icon: <Terminal className="h-3.5 w-3.5" />,
    },
    {
      name: "HTTP Client",
      href: "/http-client",
      icon: <Send className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <header className="w-full border-b bg-background px-3">
      <div className="flex h-(--app-header) items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <FileJson className="h-4 w-4 text-blue-500" />
            <span className="hidden text-sm font-semibold sm:inline-block">
              JSON Master
            </span>
          </Link>
          <nav className="flex items-center gap-0.5">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  {item.icon}
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
