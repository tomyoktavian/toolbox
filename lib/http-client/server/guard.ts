const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * The server runs request scripts in node:vm (not a security boundary) and can reach any URL,
 * so it is off in production builds unless HTTP_CLIENT_SERVER=on says otherwise.
 */
export function httpClientServerEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.HTTP_CLIENT_SERVER === "on";
}

function allowedHosts(): string[] {
  const extra = (process.env.HTTP_CLIENT_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return [...LOCAL_HOSTS, ...extra];
}

/** Returns a response to send instead of handling the request, or null when it may proceed. */
export function rejectHttpClientRequest(request: Request, requireHeader: boolean): Response | null {
  if (!httpClientServerEnabled()) {
    return Response.json({ error: "HTTP client server is disabled." }, { status: 404 });
  }
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
