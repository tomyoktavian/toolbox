"use client";

import * as React from "react";
import { ChevronRight, Hash, Key } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PathSelectorProps {
  data: any;
  value: string;
  onChange: (path: string) => void;
  className?: string;
}

export function PathSelector({
  data,
  value,
  onChange,
  className,
}: PathSelectorProps) {
  // Normalize value for internal processing
  const pathParts = React.useMemo(() => {
    if (!value || value === "." || value === "$") return [];
    return value
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .filter(Boolean);
  }, [value]);

  const segments = React.useMemo(() => {
    const result: {
      key: string;
      options: string[];
      type: "object" | "array";
      fullPath: string;
      length?: number;
    }[] = [];
    let currentData = data;
    let currentPath = "";

    for (let i = 0; i <= pathParts.length; i++) {
      if (currentData === null || currentData === undefined) break;

      const isArray = Array.isArray(currentData);
      const isObject =
        typeof currentData === "object" && currentData !== null && !isArray;
      const options = isObject ? Object.keys(currentData) : [];
      const key = pathParts[i] || "";

      // Jangan tambahkan segment kosong jika data saat ini bukan objek atau array
      if (i === pathParts.length && !isArray && !isObject) break;

      result.push({
        key,
        options,
        type: isArray ? "array" : "object",
        fullPath: currentPath,
        length: isArray ? currentData.length : undefined,
      });

      if (i < pathParts.length) {
        currentData = currentData[pathParts[i]];
        currentPath = currentPath
          ? `${currentPath}.${pathParts[i]}`
          : pathParts[i];
      } else {
        break;
      }
    }
    return result;
  }, [data, pathParts]);

  const handleSegmentChange = (index: number, newKey: string) => {
    const newParts = pathParts.slice(0, index);
    if (newKey) {
      newParts.push(newKey);
    }
    onChange(newParts.join("."));
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <div
        className="flex items-center justify-center h-7 w-7 rounded-md bg-muted/50 border border-border cursor-pointer hover:bg-muted"
        onClick={() => onChange(".")}
        title="Root"
      >
        <span className="text-[10px] font-bold text-muted-foreground">.</span>
      </div>

      {segments.map((segment, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
          )}

          {segment.type === "object" ? (
            <Select
              value={segment.key}
              onValueChange={(val) => handleSegmentChange(index, val)}
            >
              <SelectTrigger className="h-7 min-w-[90px] w-auto text-[10px] bg-background border-border flex gap-1.5 px-2">
                <Key className="w-3 h-3 text-primary/70" />
                <SelectValue placeholder="Key" />
              </SelectTrigger>
              <SelectContent>
                {segment.options.map((opt) => (
                  <SelectItem key={opt} value={opt} className="text-[10px]">
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select
              value={segment.key}
              onValueChange={(val) => handleSegmentChange(index, val)}
            >
              <SelectTrigger className="h-7 min-w-[60px] w-auto text-[10px] bg-background border-border flex gap-1.5 px-2">
                <Hash className="w-3 h-3 text-blue-500/70" />
                <SelectValue placeholder="Idx" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: segment.length || 0 }).map((_, i) => (
                  <SelectItem
                    key={i}
                    value={i.toString()}
                    className="text-[10px]"
                  >
                    Index {i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </React.Fragment>
      ))}

      {/* Show next selector if current segment has children but no key is selected yet */}
      {segments.length > 0 && segments[segments.length - 1].key && (
        <div className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
          <div className="h-7 px-2 flex items-center rounded-md border border-dashed border-border bg-muted/20 text-[10px] text-muted-foreground cursor-pointer hover:bg-muted/30 animate-pulse">
            Next...
          </div>
        </div>
      )}
    </div>
  );
}
