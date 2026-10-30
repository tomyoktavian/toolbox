import { Metadata } from "next";
import { ToolGrid } from "@/components/home/tool-grid";

export const metadata: Metadata = {
  title: "Dev Toolbox",
  description: "Developer tools: convert data, test APIs, and more.",
};

export default function Home() {
  return (
    <div className="mx-auto max-w-[1120px] px-6 pt-12 pb-24">
      <ToolGrid />
    </div>
  );
}
