#!/usr/bin/env node
// Toolbox Local Proxy
//
// Meneruskan request HTTP ke localhost / 127.0.0.1 / [::1] di komputer ini atas nama HTTP client
// yang berjalan di server. Server tidak bisa menjangkau komputer Anda, jadi proxy ini yang menyambung
// keluar ke server dan mengambil pekerjaannya; tidak ada port yang dibuka di komputer Anda.
//
//   node toolbox-proxy.mjs --server https://alamat-server --token TOKEN
//
// Proxy ini HANYA mau menjangkau alamat lokal. Alamat lain (termasuk jaringan kantor/rumah) ditolak,
// juga bila sebuah service lokal mengarahkan redirect ke sana.
//
// Butuh Node.js 18 atau lebih baru. Tanpa dependency.

import { parseArgs } from "node:util";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 20;
const POLL_TIMEOUT_MS = 35_000;

const HELP = `Toolbox Local Proxy

Pemakaian:
  node toolbox-proxy.mjs --server <alamat server> --token <token>

Opsi:
  --server   Alamat aplikasi, mis. https://toolbox.example.com   (atau env TOOLBOX_SERVER)
  --token    Token dari dialog "Local Proxy" di aplikasi          (atau env TOOLBOX_TOKEN)
  --verbose  Tampilkan setiap request yang diteruskan
  --help     Tampilkan bantuan ini
`;

const { values } = parseArgs({
  options: {
    server: { type: "string" },
    token: { type: "string" },
    verbose: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  strict: false,
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

const server = (values.server ?? process.env.TOOLBOX_SERVER ?? "").replace(/\/+$/, "");
const token = values.token ?? process.env.TOOLBOX_TOKEN ?? "";
if (!server || !token) {
  console.error("Alamat server dan token wajib diisi.\n");
  console.error(HELP);
  process.exit(1);
}
try {
  new URL(server);
} catch {
  console.error(`Alamat server tidak valid: ${server}`);
  process.exit(1);
}
if (typeof fetch !== "function") {
  console.error("Butuh Node.js 18 atau lebih baru.");
  process.exit(1);
}

const verbose = Boolean(values.verbose);
const authHeaders = { "x-http-client": "1", "x-http-client-agent": token };

const stamp = () => new Date().toLocaleTimeString("id-ID", { hour12: false });
const log = (message) => console.log(`[${stamp()}] ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function describe(error) {
  const parts = [];
  for (let current = error, depth = 0; current && depth < 4; depth++, current = current.cause) {
    const text = [current.message, current.code].filter(Boolean).join(" ");
    if (text && parts[parts.length - 1] !== text) parts.push(text);
  }
  return parts.join(" — ") || String(error);
}

function isLocal(url) {
  return (url.protocol === "http:" || url.protocol === "https:") && LOCAL_HOSTS.has(url.hostname.toLowerCase());
}

function toHeaders(pairs) {
  const headers = new Headers();
  for (const [key, value] of pairs) {
    // The length is recomputed for the body that is really sent.
    if (key.toLowerCase() === "content-length") continue;
    try {
      headers.append(key, value);
    } catch {
      // A header name or value the platform refuses; skipping it beats failing the request.
    }
  }
  return headers;
}

/** Runs one job against a local address. Redirects are followed here, and only to local addresses. */
async function execute(job) {
  const deadline = AbortSignal.timeout(job.timeoutMs || 120_000);
  let url = new URL(job.url);
  let method = job.method;
  let pairs = job.headers;
  let body = job.bodyBase64 ? Buffer.from(job.bodyBase64, "base64") : undefined;
  let redirected = false;

  if (!isLocal(url)) {
    throw new Error(
      `Local Proxy hanya meneruskan ke localhost, 127.0.0.1, dan [::1] (bukan ${url.hostname || url.protocol}).`,
    );
  }

  for (let hops = 0; ; hops++) {
    const response = await fetch(url, {
      method,
      headers: toHeaders(pairs),
      redirect: "manual",
      signal: deadline,
      ...(body && method !== "GET" && method !== "HEAD" ? { body } : {}),
    });

    const location = response.headers.get("location");
    if (job.redirect === "follow" && REDIRECT_STATUSES.has(response.status) && location) {
      if (hops >= MAX_REDIRECTS) throw new Error(`Terlalu banyak redirect (>${MAX_REDIRECTS}).`);
      const next = new URL(location, url);
      // A redirect out of this machine is not followed; the 3xx is returned as it is.
      if (isLocal(next)) {
        await response.arrayBuffer();
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
          pairs = pairs.filter(([key]) => !/^content-(type|length)$/i.test(key));
        }
        if (next.origin !== url.origin) {
          pairs = pairs.filter(([key]) => !/^(authorization|cookie)$/i.test(key));
        }
        url = next;
        redirected = true;
        continue;
      }
    }

    const headers = [];
    // fetch has already decoded the body, so these two would now be wrong.
    for (const [key, value] of response.headers) {
      if (key !== "content-encoding" && key !== "content-length") headers.push([key, value]);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      id: job.id,
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers,
      bodyBase64: bytes.toString("base64"),
      url: url.toString(),
      redirected,
    };
  }
}

async function respond(result) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${server}/api/http-client/agent/respond`, {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify(result),
      });
      // 410: the server stopped waiting (cancelled or timed out); nothing more to do.
      if (response.ok || response.status === 410) return;
    } catch {
      // Try again below.
    }
    await sleep(500 * (attempt + 1));
  }
  log(`Hasil request ${result.id} tidak bisa dikirim ke server.`);
}

async function handle(job) {
  const started = Date.now();
  let result;
  try {
    result = await execute(job);
    if (verbose) log(`${job.method} ${job.url} → ${result.status} (${Date.now() - started} ms)`);
  } catch (error) {
    const message = describe(error);
    result = { id: job.id, ok: false, error: message };
    log(`${job.method} ${job.url} → gagal: ${message}`);
  }
  await respond(result);
}

async function main() {
  log(`Menyambung ke ${server} …`);
  let backoff = 1000;
  let connected = false;
  for (;;) {
    try {
      // The first call after (re)connecting is answered at once, so "terhubung" shows without a wait.
      const response = await fetch(`${server}/api/http-client/agent/poll${connected ? "" : "?wait=0"}`, {
        headers: authHeaders,
        signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
      });
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        const detail = await response.text().catch(() => "");
        console.error(
          `Server menolak sambungan (${response.status}). Periksa alamat server dan token.${detail ? `\n${detail.slice(0, 200)}` : ""}`,
        );
        process.exit(1);
      }
      if (!response.ok) throw new Error(`Server menjawab ${response.status}`);
      if (!connected) {
        connected = true;
        log("Terhubung. Request ke localhost akan diteruskan dari komputer ini. Tekan Ctrl+C untuk berhenti.");
      }
      backoff = 1000;
      if (response.status === 204) continue;
      const { job } = await response.json();
      if (job) void handle(job);
    } catch (error) {
      if (connected) log(`Sambungan terputus: ${describe(error)}`);
      connected = false;
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 15_000);
    }
  }
}

process.on("SIGINT", () => {
  console.log("\nBerhenti.");
  process.exit(0);
});

await main();
