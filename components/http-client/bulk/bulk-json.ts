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

