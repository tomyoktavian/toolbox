import { DiffPlayground } from "@/components/diff/diff-playground";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Diff - Dev Toolbox",
  description: "Compare two texts or two JSON documents line by line.",
};

export default function DiffPage() {
  return (
    <main className="min-h-full bg-slate-50 dark:bg-slate-950">
      <DiffPlayground />
    </main>
  );
}
