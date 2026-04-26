export type FieldType = "string" | "number" | "boolean" | "array" | "object";

export interface ArrayConfig {
  mode: "loop" | "manual";
  sourcePath: string; // Digunakan sebagai base path di mode loop, atau diabaikan di mode manual
  itemMappings: MappingRule[];
}

export interface ObjectConfig {
  itemMappings: MappingRule[];
}

export interface MappingRule {
  id: string;
  outputKey: string;
  sourceContext?: "item" | "root";
  sourceType?: "path" | "custom";
  sourcePath: string;
  customValue?: string;
  type: FieldType;
  arrayConfig?: ArrayConfig;
  objectConfig?: ObjectConfig;
}

export function getValueByPath(obj: any, path: string): any {
  if (obj === null || obj === undefined) return undefined;
  if (!path || path === "." || path === "$") return obj;

  // Normalisasi notasi [index] menjadi .index (misal: items[0] -> items.0)
  const normalizedPath = path.replace(/\[(\d+)\]/g, ".$1");
  const parts = normalizedPath.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (part === "" || part === "$") continue;
    current = current[part];
  }

  return current;
}

export function coerceValue(value: any, type: FieldType): any {
  if (value === null || value === undefined) return null;

  switch (type) {
    case "string":
      return String(value);
    case "number":
      const num = Number(value);
      return isNaN(num) ? null : num;
    case "boolean":
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value.toLowerCase() === "true";
      return Boolean(value);
    case "array":
      return Array.isArray(value) ? value : [value];
    default:
      return value;
  }
}

export function applyMapping(
  data: any,
  mappings: MappingRule[],
): any {
  if (!data || mappings.length === 0) return null;

  const rootData = data;
  
  if (Array.isArray(data)) {
    return data.map((item) => applySingleMapping(item, mappings, rootData));
  }

  return applySingleMapping(data, mappings, rootData);
}

function applySingleMapping(
  item: any,
  mappings: MappingRule[],
  rootData: any,
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const rule of mappings) {
    try {
      let value: any;
      const contextData = rule.sourceContext === "root" ? rootData : item;

      if (rule.sourceType === "custom") {
        value = rule.customValue;
      } else {
        if (rule.type === "array" && rule.arrayConfig) {
          if (rule.arrayConfig.mode === "manual") {
            value = rule.arrayConfig.itemMappings.map((subRule) => {
              const subContext = subRule.sourceContext === "root" ? rootData : item;
              const val = subRule.sourceType === "custom" 
                ? subRule.customValue 
                : getValueByPath(subContext, subRule.sourcePath);
              return coerceValue(val, subRule.type);
            });
          } else {
            const arraySource = getValueByPath(contextData, rule.arrayConfig.sourcePath);
            if (!Array.isArray(arraySource)) {
              value = [];
            } else {
              value = arraySource.map((subItem) => {
                return applySingleMapping(subItem, rule.arrayConfig!.itemMappings, rootData);
              });
            }
          }
        } else if (rule.type === "object" && rule.objectConfig) {
          // Recursive call for nested object
          value = applySingleMapping(contextData, rule.objectConfig.itemMappings, rootData);
        } else {
          value = getValueByPath(contextData, rule.sourcePath);
        }
      }

      result[rule.outputKey] = coerceValue(value, rule.type);
    } catch (error) {
      console.error(`Error mapping field ${rule.outputKey}:`, error);
      result[rule.outputKey] = null;
    }
  }

  return result;
}

export function formatJson(json: any): string {
  return JSON.stringify(json, null, 2);
}

export function parseJson(jsonString: string): {
  data: any | null;
  error: string | null;
} {
  try {
    const data = JSON.parse(jsonString);
    return { data, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return { data: null, error: message };
  }
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}
