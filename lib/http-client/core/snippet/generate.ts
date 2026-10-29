// Pure code generators (no Node imports) so the browser can render every language from one
// SnippetRequest without another round trip.

export type SnippetBody =
  | { kind: 'raw'; text: string }
  | { kind: 'form'; fields: Array<[string, string]> };

export interface SnippetRequest {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body?: SnippetBody;
  /** Things the generated code cannot reproduce (for example request signing). */
  notes: string[];
}

export type SnippetLanguage = 'curl' | 'javascript' | 'python' | 'php' | 'go';

export const SNIPPET_LANGUAGES: ReadonlyArray<{ id: SnippetLanguage; label: string }> = [
  { id: 'curl', label: 'cURL' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'php', label: 'PHP' },
  { id: 'go', label: 'Go' },
];

export function generateSnippet(language: SnippetLanguage, request: SnippetRequest): string {
  switch (language) {
    case 'curl':
      return toCurlSnippet(request);
    case 'javascript':
      return toJavaScript(request);
    case 'python':
      return toPython(request);
    case 'php':
      return toPhp(request);
    case 'go':
      return toGo(request);
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** A double-quoted literal that JavaScript, Python and Go all read the same way. */
function dq(value: string): string {
  return JSON.stringify(value);
}

function phpQuote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function hasDuplicateHeaders(headers: ReadonlyArray<readonly [string, string]>): boolean {
  const seen = new Set<string>();
  for (const [name] of headers) {
    const lower = name.toLowerCase();
    if (seen.has(lower)) return true;
    seen.add(lower);
  }
  return false;
}

function toCurlSnippet(request: SnippetRequest): string {
  const lines = [`curl -X ${request.method} ${shellQuote(request.url)}`];
  for (const [name, value] of request.headers) lines.push(`-H ${shellQuote(`${name}: ${value}`)}`);
  if (request.body?.kind === 'raw') lines.push(`--data-raw ${shellQuote(request.body.text)}`);
  if (request.body?.kind === 'form') {
    // --form-string keeps values starting with @ or < from being read as files.
    for (const [name, value] of request.body.fields) {
      lines.push(`--form-string ${shellQuote(`${name}=${value}`)}`);
    }
  }
  return lines.join(' \\\n  ');
}

function jsText(text: string): string {
  if (!text.includes('\n')) return dq(text);
  const escaped = text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return `\`${escaped}\``;
}

function toJavaScript(request: SnippetRequest): string {
  const options: string[] = [`method: ${dq(request.method)}`];
  if (request.headers.length > 0) {
    if (hasDuplicateHeaders(request.headers)) {
      const rows = request.headers.map(([name, value]) => `    [${dq(name)}, ${dq(value)}],`);
      options.push(`headers: [\n${rows.join('\n')}\n  ]`);
    } else {
      const rows = request.headers.map(([name, value]) => `    ${dq(name)}: ${dq(value)},`);
      options.push(`headers: {\n${rows.join('\n')}\n  }`);
    }
  }

  const preamble: string[] = [];
  if (request.body?.kind === 'raw') {
    options.push(`body: ${jsText(request.body.text)}`);
  } else if (request.body?.kind === 'form') {
    preamble.push(
      'const formData = new FormData();',
      ...request.body.fields.map(([name, value]) => `formData.append(${dq(name)}, ${dq(value)});`),
      '',
    );
    options.push('body: formData');
  }

  return [
    ...preamble,
    `const response = await fetch(${dq(request.url)}, {`,
    options.map((option) => `  ${option}`).join(',\n') + ',',
    '});',
    '',
    'console.log(response.status);',
    'console.log(await response.text());',
  ].join('\n');
}

function pyText(text: string): string {
  if (!text.includes('\n') || text.endsWith('"')) return dq(text);
  return `"""${text.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}"""`;
}

function toPython(request: SnippetRequest): string {
  const lines = ['import requests', '', `url = ${dq(request.url)}`, ''];
  const args = [`${dq(request.method)}`, 'url'];

  if (request.headers.length > 0) {
    // requests takes a dict, so a header name cannot repeat; repeated ones are joined with ", ".
    const merged = new Map<string, [string, string[]]>();
    for (const [name, value] of request.headers) {
      const entry = merged.get(name.toLowerCase());
      if (entry) entry[1].push(value);
      else merged.set(name.toLowerCase(), [name, [value]]);
    }
    if (merged.size < request.headers.length) {
      lines.push('# requests cannot repeat a header name, so repeated ones are joined with ", ".');
    }
    lines.push(
      'headers = {',
      ...[...merged.values()].map(([name, values]) => `    ${dq(name)}: ${dq(values.join(', '))},`),
      '}',
      '',
    );
    args.push('headers=headers');
  }

  if (request.body?.kind === 'raw') {
    lines.push(`payload = ${pyText(request.body.text)}`, '');
    // http.client would send a str body as latin-1, which fails on other characters.
    args.push(/[^\x00-\xff]/.test(request.body.text) ? 'data=payload.encode("utf-8")' : 'data=payload');
  } else if (request.body?.kind === 'form') {
    lines.push(
      'files = [',
      ...request.body.fields.map(([name, value]) => `    (${dq(name)}, (None, ${dq(value)})),`),
      ']',
      '',
    );
    args.push('files=files');
  }

  lines.push(`response = requests.request(${args.join(', ')})`, '', 'print(response.status_code)', 'print(response.text)');
  return lines.join('\n');
}

function toPhp(request: SnippetRequest): string {
  const options: string[] = [
    `CURLOPT_URL => ${phpQuote(request.url)}`,
    'CURLOPT_RETURNTRANSFER => true',
    `CURLOPT_CUSTOMREQUEST => ${phpQuote(request.method)}`,
  ];
  if (request.headers.length > 0) {
    const rows = request.headers.map(([name, value]) => `    ${phpQuote(`${name}: ${value}`)},`);
    options.push(`CURLOPT_HTTPHEADER => [\n${rows.join('\n')}\n  ]`);
  }
  if (request.body?.kind === 'raw') {
    options.push(`CURLOPT_POSTFIELDS => ${phpQuote(request.body.text)}`);
  } else if (request.body?.kind === 'form') {
    const rows = request.body.fields.map(([name, value]) => `    ${phpQuote(name)} => ${phpQuote(value)},`);
    options.push(`CURLOPT_POSTFIELDS => [\n${rows.join('\n')}\n  ]`);
  }

  return [
    '<?php',
    '',
    '$curl = curl_init();',
    '',
    'curl_setopt_array($curl, [',
    options.map((option) => `  ${option}`).join(',\n') + ',',
    ']);',
    '',
    '$response = curl_exec($curl);',
    '$error = curl_error($curl);',
    'curl_close($curl);',
    '',
    'echo $error ?: $response;',
  ].join('\n');
}

function goText(text: string): string {
  // Raw strings cannot contain a backtick; fall back to an escaped literal.
  return text.includes('`') ? dq(text) : `\`${text}\``;
}

function toGo(request: SnippetRequest): string {
  const imports = ['"fmt"', '"io"', '"net/http"'];
  const setup: string[] = [];
  let payload = 'nil';
  let contentTypeFromWriter = false;

  if (request.body?.kind === 'raw') {
    imports.push('"strings"');
    payload = 'payload';
    setup.push(`\tpayload := strings.NewReader(${goText(request.body.text)})`, '');
  } else if (request.body?.kind === 'form') {
    imports.push('"bytes"', '"mime/multipart"');
    payload = 'payload';
    contentTypeFromWriter = true;
    setup.push(
      '\tpayload := &bytes.Buffer{}',
      '\twriter := multipart.NewWriter(payload)',
      ...request.body.fields.map(([name, value]) => `\t_ = writer.WriteField(${dq(name)}, ${dq(value)})`),
      '\tif err := writer.Close(); err != nil {',
      '\t\tfmt.Println(err)',
      '\t\treturn',
      '\t}',
      '',
    );
  }

  const headers = request.headers.map(([name, value]) => `\treq.Header.Add(${dq(name)}, ${dq(value)})`);
  if (contentTypeFromWriter) headers.push('\treq.Header.Set("Content-Type", writer.FormDataContentType())');

  return [
    'package main',
    '',
    'import (',
    ...[...imports].sort().map((entry) => `\t${entry}`),
    ')',
    '',
    'func main() {',
    `\turl := ${dq(request.url)}`,
    `\tmethod := ${dq(request.method)}`,
    '',
    ...setup,
    '\tclient := &http.Client{}',
    `\treq, err := http.NewRequest(method, url, ${payload})`,
    '\tif err != nil {',
    '\t\tfmt.Println(err)',
    '\t\treturn',
    '\t}',
    ...(headers.length > 0 ? ['', ...headers] : []),
    '',
    '\tres, err := client.Do(req)',
    '\tif err != nil {',
    '\t\tfmt.Println(err)',
    '\t\treturn',
    '\t}',
    '\tdefer res.Body.Close()',
    '',
    '\tbody, err := io.ReadAll(res.Body)',
    '\tif err != nil {',
    '\t\tfmt.Println(err)',
    '\t\treturn',
    '\t}',
    '\tfmt.Println(string(body))',
    '}',
  ].join('\n');
}
