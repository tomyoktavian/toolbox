import { JsonPlayground } from "@/components/json-convert/json-playground";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "JSON Converter - JSON Master",
  description: "Convert JSON to TypeScript, Java, Flutter, Swift, Go, and Kotlin.",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <JsonPlayground />
    </main>
  );
}
