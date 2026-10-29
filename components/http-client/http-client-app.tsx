"use client";

import dynamic from "next/dynamic";
import "./http-client.css";

// The host restores open tabs from localStorage, so the workbench only renders in the browser.
const Workbench = dynamic(() => import("./shell/workbench").then((mod) => mod.Workbench), {
  ssr: false,
});

export function HttpClientApp() {
  return <Workbench />;
}
