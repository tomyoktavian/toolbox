"use client";

import { usePathname } from "next/navigation";
import { HeaderBar } from "@/components/header-bar";
import { HomeHeader } from "@/components/home/home-header";

/** Full width header for the tool pages; the home page has its own. */
export function Navbar() {
  const pathname = usePathname();

  if (pathname === "/") return <HomeHeader />;
  return <HeaderBar className="px-3" brand={false} />;
}
