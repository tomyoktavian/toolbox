import { HttpClientApp } from "@/components/http-client/http-client-app";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "HTTP Client - JSON Master",
  description: "Send HTTP requests and manage API collections, environments, and workspaces.",
};

export const dynamic = "force-dynamic";

export default function HttpClientPage() {
  return (
    <div className="h-[calc(100dvh-var(--app-header)-1px)]">
      <HttpClientApp />
    </div>
  );
}
