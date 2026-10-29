import type { PreparedRequest } from './rest-runner';

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function toCurl(prepared: PreparedRequest): string {
  const lines = [`curl --location ${shellQuote(prepared.url)}`];
  if (prepared.method !== 'GET')
    lines[0] = `curl --location --request ${prepared.method} ${shellQuote(prepared.url)}`;
  for (const [key, value] of prepared.headers)
    lines.push(`--header ${shellQuote(`${key}: ${value}`)}`);
  if (prepared.body !== undefined && prepared.method !== 'GET' && prepared.method !== 'HEAD') {
    lines.push(`--data-raw ${shellQuote(prepared.body)}`);
  }
  return lines.join(' \\\n  ');
}
