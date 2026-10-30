/* eslint-disable no-useless-escape */
/**
 * Bulk Edit Utilities
 * Helper functions for parsing and converting between text and JSON formats
 * with support for nested structures using bracket notation
 */

// Helper: Auto-detect and convert value type
export function autoConvertType(value: string): any {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value === '') return '';
  
  // Try to convert to number
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') {
    return num;
  }
  
  return value;
}

/**
 * Set nested value in object using path (supports bracket notation)
 * Example: search[0][search_column] -> ["search", "0", "search_column"]
 */
export function setNestedValue(obj: any, path: string, value: any): void {
  // Parse bracket notation
  const keys = path.match(/[^\[\]]+/g) || [];
  
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];
    const isArrayIndex = /^\d+$/.test(nextKey);
    
    // Initialize property if it doesn't exist
    if (!(key in current)) {
      current[key] = isArrayIndex ? [] : {};
    }
    
    // If next key is an array index, ensure array exists and has enough elements
    if (isArrayIndex) {
      if (!Array.isArray(current[key])) {
        current[key] = [];
      }
      const index = parseInt(nextKey);
      while (current[key].length <= index) {
        current[key].push({});
      }
      current = current[key][index];
      i++; // Skip the next key since we already processed it
    } else {
      // Regular object property
      current = current[key];
    }
  }
  
  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}

/**
 * Flatten nested object/array to bracket notation
 * Example: {search: [{column: "status"}]} -> search[0][column]: "status"
 */
export function flattenObject(obj: any, prefix = ''): Array<{key: string, value: string}> {
  const result: Array<{key: string, value: string}> = [];
  
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const newPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
      if (typeof item === 'object' && item !== null) {
        result.push(...flattenObject(item, newPrefix));
      } else {
        result.push({ key: newPrefix, value: String(item) });
      }
    });
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      const newPrefix = prefix ? `${prefix}[${key}]` : key;
      if (typeof value === 'object' && value !== null) {
        result.push(...flattenObject(value, newPrefix));
      } else {
        result.push({ key: newPrefix, value: String(value) });
      }
    }
  } else {
    result.push({ key: prefix, value: String(obj) });
  }
  
  return result;
}

/**
 * Build nested object from flat key-value pairs with bracket notation
 * Example: [{key: "search[0][column]", value: "status"}] -> {search: [{column: "status"}]}
 */
export function buildNestedObject(items: Array<{key: string, value: string}>): any {
  const result: any = {};
  
  for (const item of items) {
    const value = autoConvertType(item.value);
    
    // Check if key contains brackets (nested structure)
    if (item.key.includes('[')) {
      setNestedValue(result, item.key, value);
    } else {
      // Simple key-value
      result[item.key] = value;
    }
  }
  
  return result;
}


/** `search[0][column]` -> ["search", "0", "column"], split the same way buildNestedObject does. */
function segmentsOf(key: string): string[] {
  return key.includes('[') ? (key.match(/[^\[\]]+/g) ?? []) : [key];
}

/** The bracket form flattenObject produces: first segment bare, the rest in brackets. */
export function flatKey(segments: readonly string[]): string {
  return segments.map((segment, index) => (index === 0 ? segment : `[${segment}]`)).join('');
}

function emit(value: unknown, path: string, indent: string, notes: ReadonlyMap<string, string>): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const inner = `${indent}  `;
  const entries: Array<[string | undefined, unknown, string]> = Array.isArray(value)
    ? value.map((item, index): [undefined, unknown, string] => [undefined, item, `${path}[${index}]`])
    : Object.entries(value).map(([key, item]): [string, unknown, string] => [
        JSON.stringify(key),
        item,
        path ? `${path}[${key}]` : key,
      ]);
  if (entries.length === 0) return Array.isArray(value) ? '[]' : '{}';
  const lines = entries.map(([keyText, item, childPath], index) => {
    const leaf = item === null || typeof item !== 'object';
    const note = leaf ? notes.get(childPath) : undefined;
    const comma = index < entries.length - 1 ? ',' : '';
    return `${inner}${keyText === undefined ? '' : `${keyText}: `}${emit(item, childPath, inner, notes)}${comma}${note ? ` // ${note}` : ''}`;
  });
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return `${open}\n${lines.join('\n')}\n${indent}${close}`;
}

/**
 * The JSON for a list of pairs, laid out like JSON.stringify(..., null, 2), with each description
 * after its value as a line comment: `"page": 1, // untuk pagination`.
 *
 * `structured` (query params) nests bracket keys and turns "1" / "true" into numbers and booleans.
 * Without it (headers) every key stays as written and every value stays text, so "1.10" is not
 * turned into 1.1 by opening the editor.
 */
export function toCommentedJson(
  items: ReadonlyArray<{ key: string; value: string; description?: string }>,
  structured = true,
): string {
  const notes = new Map<string, string>();
  for (const item of items) {
    const note = item.description?.replace(/\s*\r?\n\s*/g, ' ').trim();
    if (note) notes.set(structured ? flatKey(segmentsOf(item.key)) : item.key, note);
  }
  const tree = structured
    ? buildNestedObject([...items])
    : Object.fromEntries(items.map((item) => [item.key, item.value]));
  return emit(tree, '', '', notes);
}
