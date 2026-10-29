import { nodeFetch } from '../runner/node-fetch';

const ACCEPT = 'application/json, text/plain;q=0.8, */*;q=0.5';

export function normalizeSpecUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('The spec URL is empty.');
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Not a valid URL: ${trimmed}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Only http:// and https:// spec URLs are supported, got "${parsed.protocol}".`);
  }
  return parsed.toString();
}

export async function fetchSpecText(url: string): Promise<string> {
  const target = normalizeSpecUrl(url);
  const response = await nodeFetch(target, { headers: { accept: ACCEPT } });
  if (!response.ok) {
    throw new Error(`Fetching ${target} failed — HTTP ${response.status} ${response.statusText}.`);
  }
  const text = await response.text();
  if (looksLikeHtml(text)) {
    throw new Error(
      `${target} returned an HTML page, not a document — point at the raw spec (for example /v3/api-docs, /swagger.json, or /openapi.json).`,
    );
  }
  return text;
}

function looksLikeHtml(text: string): boolean {
  const head = text.trim().slice(0, 200).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}
