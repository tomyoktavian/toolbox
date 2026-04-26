import { ManipulationPlayground } from "@/components/json-manipulation/manipulation-playground";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "JSON Manipulation - JSON Master",
  description: "Format, minify, and sort your JSON data easily.",
};

export default function ManipulationPage() {
  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <ManipulationPlayground />
    </div>
  );
}
