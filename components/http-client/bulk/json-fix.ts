/**
 * Fix common JSON errors and format JSON properly
 * Handles:
 * - Trailing commas
 * - Unquoted keys (page: 1 -> "page": 1)
 * - Single quotes to double quotes
 * - Comments (single line and multi-line)
 * - Auto-wrapping fragments in object
 */
export function fixJsonString(jsonString: string): string {
  if (!jsonString || !jsonString.trim()) return "";

  // 1. Try standard JSON parse first
  try {
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    // Continue to permissive parsing
  }

  // 2. Use our permissive parser
  try {
    const parser = new PermissiveJsonParser(jsonString);
    const result = parser.parse();
    return JSON.stringify(result, null, 2);
  } catch (err) {
    console.warn("Permissive parse failed:", err);
    // Return original string if all else fails, or maybe partial fix?
    // For now, return original to avoid destroying data unexpected in edge cases
    return jsonString;
  }
}

/**
 * Beautify/format JSON string
 * Same as fixJsonString but emphasizes formatting
 */
export function beautifyJson(jsonString: string): string {
  return fixJsonString(jsonString);
}

/**
 * Validate if string is valid JSON
 */
export function isValidJson(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    // Check if our permissive parser can save it?
    // Maybe too aggressive for strict validation, let's keep it strict here.
    return false;
  }
}

/**
 * Safe JSON parse - returns null if invalid
 */
export function safeJsonParse<T = any>(jsonString: string): T | null {
  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

/** Parses JSON, also the loose kind, and returns the `// note` written after a value, by its key path. */
export function parseLooseJson(
  text: string,
): { value: any; notes: Map<string, string> } | undefined {
  if (!text.trim()) return undefined;
  try {
    return { value: JSON.parse(text), notes: new Map() };
  } catch {
    // Not strict JSON (comments, trailing commas, ...): fall through to the permissive parser.
  }
  try {
    const parser = new PermissiveJsonParser(text);
    const value = parser.parse();
    return { value, notes: parser.notes };
  } catch {
    return undefined;
  }
}

class PermissiveJsonParser {
  private input: string;
  private index: number;
  private length: number;
  /** Line comments that follow a value on the same line, keyed like `search[0][column]`. */
  readonly notes = new Map<string, string>();
  private readonly segments: string[] = [];

  constructor(input: string) {
    this.input = input;
    this.index = 0;
    this.length = input.length;
  }

  /** Looks ahead (without moving) from the end of a value for `, // note` on the same line. */
  private captureTrailingNote(): void {
    let at = this.index;
    const skipBlanks = (): void => {
      while (this.input[at] === " " || this.input[at] === "\t") at++;
    };
    skipBlanks();
    if (this.input[at] === ",") {
      at++;
      skipBlanks();
    }
    if (this.input[at] !== "/" || this.input[at + 1] !== "/") return;
    let end = at + 2;
    while (end < this.length && this.input[end] !== "\n") end++;
    const note = this.input.slice(at + 2, end).trim();
    if (!note) return;
    this.notes.set(
      this.segments.map((segment, index) => (index === 0 ? segment : `[${segment}]`)).join(""),
      note,
    );
  }

  parse(): any {
    this.skipWhitespace();

    // Auto-detect if root is object fragment or array/object
    const char = this.peek();

    if (char === "{") {
      return this.parseObject();
    }
    if (char === "[") {
      return this.parseArray();
    }

    // If it looks like a key (starts with quote or char), treat as object fragment
    if (char === '"' || char === "'" || /[a-zA-Z_$]/.test(char)) {
      // Check if it's just a single value?
      // If it's key: value, treat as object.
      const start = this.index;
      try {
        // Try parsing as value first
        const val = this.parseValue();
        this.skipWhitespace();
        if (this.index >= this.length) {
          return val; // Just a single scalar value
        }
        // If more content, and we started with key-like, assume object fragment
        this.index = start; // Backtrack
        return this.parseObjectContent();
      } catch {
        // Backtrack and try object content
        this.index = start;
        return this.parseObjectContent();
      }
    }

    return this.parseValue();
  }

  private peek(): string {
    return this.input[this.index] || "";
  }

  private next(): string {
    return this.input[this.index++] || "";
  }

  private skipWhitespace() {
    while (this.index < this.length) {
      const char = this.input[this.index];

      // Comments handling
      if (char === "/") {
        const nextChar = this.input[this.index + 1];
        if (nextChar === "/") {
          // Single line comment
          this.index += 2;
          while (this.index < this.length && this.input[this.index] !== "\n") {
            this.index++;
          }
          continue;
        } else if (nextChar === "*") {
          // Multi-line comment
          this.index += 2;
          while (this.index < this.length) {
            if (
              this.input[this.index] === "*" &&
              this.input[this.index + 1] === "/"
            ) {
              this.index += 2;
              break;
            }
            this.index++;
          }
          continue;
        }
      }

      if (/\s/.test(char)) {
        this.index++;
      } else {
        break;
      }
    }
  }

  private parseObject(): any {
    this.index++; // skip '{'
    return this.parseObjectContent();
  }

  private parseObjectContent(): any {
    const obj: any = {};

    while (this.index < this.length) {
      this.skipWhitespace();
      const char = this.peek();

      if (char === "}") {
        this.index++;
        return obj;
      }
      if (char === "") break; // EOF (implicit close)
      if (char === ",") {
        this.index++; // Trailing comma handling
        continue;
      }

      // Parse Key
      let key = "";
      if (char === '"' || char === "'") {
        key = this.parseString();
      } else {
        key = this.parseUnquotedKey();
      }

      this.skipWhitespace();
      if (this.peek() === ":") {
        this.index++; // skip ':'
      } else {
        // Missing colon? infer it?
      }

      this.skipWhitespace();
      this.segments.push(key);
      const value = this.parseValue();
      obj[key] = value;
      this.captureTrailingNote();
      this.segments.pop();

      this.skipWhitespace();
      if (this.peek() === ",") {
        this.index++;
      }
    }
    return obj;
  }

  private parseArray(): any[] {
    this.index++; // skip '['
    const arr: any[] = [];

    while (this.index < this.length) {
      this.skipWhitespace();
      const char = this.peek();

      if (char === "]") {
        this.index++;
        return arr;
      }
      if (char === "") break; // EOF
      if (char === ",") {
        this.index++;
        continue;
      }

      this.segments.push(String(arr.length));
      const value = this.parseValue();
      arr.push(value);
      this.captureTrailingNote();
      this.segments.pop();

      this.skipWhitespace();
      if (this.peek() === ",") {
        this.index++;
      }
    }
    return arr;
  }

  private parseValue(): any {
    this.skipWhitespace();
    const char = this.peek();

    if (char === "{") return this.parseObject();
    if (char === "[") return this.parseArray();
    if (char === '"' || char === "'") return this.parseString();
    if (char === "-" || /[0-9]/.test(char)) return this.parseNumber();
    if (char === "t") {
      this.index += 4;
      return true;
    } // true
    if (char === "f") {
      this.index += 5;
      return false;
    } // false
    if (char === "n") {
      this.index += 4;
      return null;
    } // null

    // Fallback: unquoted string or number?
    return this.parseUnquotedString();
  }

  private parseString(): string {
    const quote = this.next(); // ' or "
    let str = "";

    while (this.index < this.length) {
      const char = this.next();
      if (char === "\\") {
        const escape = this.next();
        if (escape === "u") {
          // simple unicode handling
          const hex = this.input.substr(this.index, 4);
          str += String.fromCharCode(parseInt(hex, 16));
          this.index += 4;
        } else if (escape === "n") str += "\n";
        else if (escape === "r") str += "\r";
        else if (escape === "t") str += "\t";
        else if (escape === "b") str += "\b";
        else if (escape === "f") str += "\f";
        else str += escape;
      } else if (char === quote) {
        break;
      } else {
        str += char;
      }
    }
    return str;
  }

  private parseUnquotedKey(): string {
    const start = this.index;
    while (this.index < this.length) {
      const char = this.peek();
      if (char === ":" || /\s/.test(char)) break;
      this.index++;
    }
    return this.input.substring(start, this.index);
  }

  private parseNumber(): number {
    const start = this.index;
    if (this.peek() === "-") this.index++;
    while (/[0-9]/.test(this.peek())) this.index++;
    if (this.peek() === ".") {
      this.index++;
      while (/[0-9]/.test(this.peek())) this.index++;
    }
    // scientific notation
    if (this.peek().toLowerCase() === "e") {
      this.index++;
      if (this.peek() === "+" || this.peek() === "-") this.index++;
      while (/[0-9]/.test(this.peek())) this.index++;
    }

    const numStr = this.input.substring(start, this.index);
    return Number(numStr);
  }

  private parseUnquotedString(): any {
    // Read until separator
    const start = this.index;
    while (this.index < this.length) {
      const char = this.peek();
      if (char === "," || char === "}" || char === "]" || char === ":") break;
      if (/\s/.test(char)) break; // stop at space?
      this.index++;
    }
    const val = this.input.substring(start, this.index);

    // Check if it's a number
    if (!isNaN(Number(val)) && val.trim() !== "") return Number(val);
    if (val === "true") return true;
    if (val === "false") return false;
    if (val === "null") return null;
    return val;
  }
}
