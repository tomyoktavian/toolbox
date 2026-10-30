export const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Whether a request URL points at this machine (the one the Local Proxy runs on). */
export function isLocalTarget(url: string): boolean {
  try {
    return LOCAL_HOSTS.includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

// The server runs request scripts in node:vm (not a security boundary) and can reach any URL, so it
// only answers callers that reach it through one of these hosts (plus HTTP_CLIENT_ALLOWED_HOSTS).
function allowedHosts(): string[] {
  const extra = (process.env.HTTP_CLIENT_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return [...LOCAL_HOSTS, ...extra];
}

/** Returns a response to send instead of handling the request, or null when it may proceed. */
export function rejectHttpClientRequest(request: Request, requireHeader: boolean): Response | null {
  // Other sites must not drive this endpoint from a visitor's browser (CSRF, DNS rebinding).
  const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
  if (!allowedHosts().includes(host)) {
    return Response.json({ error: `Host ${host} is not allowed.` }, { status: 403 });
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }
  // A custom header forces a CORS preflight, which this route never answers.
  if (requireHeader && request.headers.get("x-http-client") !== "1") {
    return Response.json({ error: "Missing x-http-client header." }, { status: 403 });
  }
  return null;
}
