import { HttpClientApp } from "@/components/http-client/http-client-app";
import { httpClientServerEnabled } from "@/lib/http-client/server/guard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "HTTP Client - JSON Master",
  description: "Send HTTP requests and manage API collections, environments, and workspaces.",
};

export const dynamic = "force-dynamic";

export default function HttpClientPage() {
  if (!httpClientServerEnabled()) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem-1px)] items-center justify-center p-6 text-center text-sm text-muted-foreground">
        HTTP Client hanya aktif saat dijalankan lokal (next dev), karena server menjalankan script
        request dan bisa mengakses URL mana pun. Set HTTP_CLIENT_SERVER=on untuk mengaktifkannya di
        build produksi.
      </div>
    );
  }
  return (
    <div className="h-[calc(100dvh-3.5rem-1px)]">
      <HttpClientApp />
    </div>
  );
}
