const TOKEN_KEY = "http-client:agent-token";

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // base64url: letters, digits, "-" and "_" only, so it is safe in a header and on a command line.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The token that pairs this browser with a Local Proxy on the same machine. It is made once and kept,
 * so the proxy keeps working across reloads. Undefined where there is no localStorage to keep it in.
 */
export function agentToken(): string | undefined {
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) return stored;
    const created = randomToken();
    localStorage.setItem(TOKEN_KEY, created);
    return created;
  } catch {
    return undefined;
  }
}
