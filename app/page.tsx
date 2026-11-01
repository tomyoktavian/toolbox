import { Metadata } from "next";
import { ToolGrid } from "@/components/home/tool-grid";
import { FloatingActions } from "@/components/home/floating-actions";

export const metadata: Metadata = {
  title: "Dev Toolbox",
  description: "Developer tools: convert data, test APIs, and more.",
};

export default function Home() {
  return (
    <div className="min-h-[calc(100dvh-var(--app-header))] bg-muted/40">
      <div className="relative mx-auto max-w-[1120px] px-6 pt-10 pb-32">
        <ToolGrid />
      </div>
      <FloatingActions />
    </div>
  );
}
