"use client";

import { useMemo, useEffect, useState } from "react";
import {
  Copy,
  Plus,
  Trash2,
  HelpCircle,
  BookOpen,
  ListFilter,
  Settings2,
  ChevronRight,
  Braces,
  Globe,
  Variable,
  RotateCcw,
  Eraser,
  Type,
  Box,
  Pencil,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CodeEditor from "@/components/json-convert/code-editor/Code-Editor";
import { Empty, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { PathSelector } from "./path-selector";
import { ManipulationHelp } from "./manipulation-help";
import { useManipulationStore } from "@/lib/store";

import {
  type MappingRule,
  type FieldType,
  applyMapping,
  formatJson,
  parseJson,
  getValueByPath,
  generateId,
} from "@/lib/json-transform";

const FIELD_TYPE_ITEMS: Record<FieldType, string> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  object: "Object",
  array: "Array",
};

const OUTPUT_MODE_ITEMS = {
  object: "Single Object",
  array: "Array of Objects",
};

// --- Recursive Component for Mapping Rules ---

interface MappingRuleItemProps {
  mapping: MappingRule;
  onUpdate: (updates: Partial<MappingRule>) => void;
  onRemove: () => void;
  onMove: (direction: "up" | "down") => void;
  isFirst: boolean;
  isLast: boolean;
  contextData: any;
  rootData: any;
}

function MappingRuleItem({ mapping, onUpdate, onRemove, onMove, isFirst, isLast, contextData, rootData }: MappingRuleItemProps) {
  // --- Handlers for Array ---
  const handleAddArrayMapping = () => {
    const newSubMapping: MappingRule = {
      id: generateId(),
      outputKey: "",
      sourceContext: "item",
      sourceType: "path",
      sourcePath: "",
      type: "string",
    };
    
    const currentMappings = mapping.arrayConfig?.itemMappings || [];
    onUpdate({
      arrayConfig: {
        mode: mapping.arrayConfig?.mode || "loop",
        sourcePath: mapping.arrayConfig?.sourcePath || ".",
        itemMappings: [...currentMappings, newSubMapping],
      }
    });
  };

  const handleUpdateArrayMapping = (subId: string, updates: Partial<MappingRule>) => {
    const currentMappings = mapping.arrayConfig?.itemMappings || [];
    onUpdate({
      arrayConfig: {
        ...mapping.arrayConfig!,
        itemMappings: currentMappings.map(m => m.id === subId ? { ...m, ...updates } : m),
      }
    });
  };

  const handleRemoveArrayMapping = (subId: string) => {
    const currentMappings = mapping.arrayConfig?.itemMappings || [];
    onUpdate({
      arrayConfig: {
        ...mapping.arrayConfig!,
        itemMappings: currentMappings.filter(m => m.id !== subId),
      }
    });
  };

  const handleMoveArrayMapping = (subId: string, direction: "up" | "down") => {
    const currentMappings = [...(mapping.arrayConfig?.itemMappings || [])];
    const index = currentMappings.findIndex(m => m.id === subId);
    if (index === -1) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= currentMappings.length) return;

    [currentMappings[index], currentMappings[newIndex]] = [currentMappings[newIndex], currentMappings[index]];
    onUpdate({
      arrayConfig: {
        ...mapping.arrayConfig!,
        itemMappings: currentMappings,
      }
    });
  };

  // --- Handlers for Object ---
  const handleAddObjectMapping = () => {
    const newSubMapping: MappingRule = {
      id: generateId(),
      outputKey: "",
      sourceContext: "item",
      sourceType: "path",
      sourcePath: "",
      type: "string",
    };
    
    const currentMappings = mapping.objectConfig?.itemMappings || [];
    onUpdate({
      objectConfig: {
        itemMappings: [...currentMappings, newSubMapping],
      }
    });
  };

  const handleUpdateObjectMapping = (subId: string, updates: Partial<MappingRule>) => {
    const currentMappings = mapping.objectConfig?.itemMappings || [];
    onUpdate({
      objectConfig: {
        ...mapping.objectConfig!,
        itemMappings: currentMappings.map(m => m.id === subId ? { ...m, ...updates } : m),
      }
    });
  };

  const handleRemoveObjectMapping = (subId: string) => {
    const currentMappings = mapping.objectConfig?.itemMappings || [];
    onUpdate({
      objectConfig: {
        ...mapping.objectConfig!,
        itemMappings: currentMappings.filter(m => m.id !== subId),
      }
    });
  };

  const handleMoveObjectMapping = (subId: string, direction: "up" | "down") => {
    const currentMappings = [...(mapping.objectConfig?.itemMappings || [])];
    const index = currentMappings.findIndex(m => m.id === subId);
    if (index === -1) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= currentMappings.length) return;

    [currentMappings[index], currentMappings[newIndex]] = [currentMappings[newIndex], currentMappings[index]];
    onUpdate({
      objectConfig: {
        itemMappings: currentMappings,
      }
    });
  };

  const subContextData = useMemo(() => {
    if (mapping.type === "array" && mapping.arrayConfig && mapping.arrayConfig.mode === "loop") {
      const baseData = mapping.sourceContext === "root" ? rootData : contextData;
      const arrayData = getValueByPath(baseData, mapping.arrayConfig.sourcePath);
      return Array.isArray(arrayData) && arrayData.length > 0 ? arrayData[0] : {};
    }
    return contextData;
  }, [contextData, rootData, mapping.type, mapping.sourceContext, mapping.arrayConfig?.mode, mapping.arrayConfig?.sourcePath]);

  return (
    <Card className="overflow-hidden border border-border shadow-sm hover:border-primary/40 transition-all group">
      <div className="p-4 space-y-4 bg-background">
        <div className="flex items-center justify-between gap-4">
           <div className="flex-1 grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Target Output Key</Label>
              <Input
                value={mapping.outputKey}
                onChange={(e) => onUpdate({ outputKey: e.target.value })}
                placeholder="Key name"
                className="text-xs h-8"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Type</Label>
              <Select
                items={FIELD_TYPE_ITEMS}
                value={mapping.type}
                onValueChange={(type) => onUpdate({ type: type as FieldType })}
              >
                <SelectTrigger className="text-[10px] h-8 bg-muted/30 border-none ring-0 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="string" className="text-xs font-medium">String</SelectItem>
                  <SelectItem value="number" className="text-xs font-medium">Number</SelectItem>
                  <SelectItem value="boolean" className="text-xs font-medium">Boolean</SelectItem>
                  <SelectItem value="object" className="text-xs font-medium">
                    <div className="flex items-center gap-1.5">
                      <Box className="w-3 h-3 text-orange-500" /> Object
                    </div>
                  </SelectItem>
                  <SelectItem value="array" className="text-xs font-medium">
                    <div className="flex items-center gap-1.5">
                      <Braces className="w-3 h-3 text-blue-500" /> Array
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex flex-col gap-1">
            <Button 
              onClick={() => onMove("up")} 
              disabled={isFirst} 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-muted-foreground hover:text-primary"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
            <Button 
              onClick={() => onMove("down")} 
              disabled={isLast} 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-muted-foreground hover:text-primary"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Source Selection Area */}
        <div className="space-y-3 p-3 rounded-lg bg-muted/20 border border-border/50">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Data Source</Label>
            <div className="flex gap-1">
               <Button 
                onClick={() => onUpdate({ sourceType: "path" })} 
                variant={mapping.sourceType === "path" ? "secondary" : "ghost"}
                size="sm" 
                className="h-5 px-1.5 text-[8px] uppercase font-bold"
              >
                Path
              </Button>
              <Button 
                onClick={() => onUpdate({ sourceType: "custom" })} 
                variant={mapping.sourceType === "custom" ? "secondary" : "ghost"}
                size="sm" 
                className="h-5 px-1.5 text-[8px] uppercase font-bold"
              >
                Custom
              </Button>
            </div>
          </div>

          {mapping.sourceType === "custom" ? (
            <div className="flex items-center gap-2">
              <Pencil className="w-3 h-3 text-muted-foreground" />
              <Input
                value={mapping.customValue || ""}
                onChange={(e) => onUpdate({ customValue: e.target.value })}
                placeholder="Enter custom value..."
                className="text-xs h-8 bg-background"
              />
            </div>
          ) : (
            <div className="space-y-2">
              {(mapping.type !== "array" && mapping.type !== "object") && (
                <div className="flex justify-end gap-1 mb-1">
                   <Button 
                    onClick={() => onUpdate({ sourceContext: "item" })} 
                    variant={mapping.sourceContext !== "root" ? "secondary" : "ghost"}
                    size="sm" 
                    className="h-5 px-1.5 text-[8px] uppercase font-bold"
                  >
                    <Variable className="w-2.5 h-2.5 mr-1" /> Item
                  </Button>
                  <Button 
                    onClick={() => onUpdate({ sourceContext: "root" })} 
                    variant={mapping.sourceContext === "root" ? "secondary" : "ghost"}
                    size="sm" 
                    className="h-5 px-1.5 text-[8px] uppercase font-bold"
                  >
                    <Globe className="w-2.5 h-2.5 mr-1" /> Root
                  </Button>
                </div>
              )}
              
              {mapping.type === "array" ? (
                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
                        <Braces className="w-3 h-3" /> Array Setup
                      </Label>
                      <Tabs 
                        value={mapping.arrayConfig?.mode || "loop"} 
                        onValueChange={(v) => onUpdate({ 
                          arrayConfig: { 
                            ...mapping.arrayConfig!, 
                            mode: v as any,
                            sourcePath: mapping.arrayConfig?.sourcePath || "."
                          } 
                        })}
                        className="h-7"
                      >
                        <TabsList className="h-full p-0.5 bg-muted/50">
                          <TabsTrigger value="loop" className="text-[9px] px-2 h-full">Loop</TabsTrigger>
                          <TabsTrigger value="manual" className="text-[9px] px-2 h-full">Manual</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>

                    {(mapping.arrayConfig?.mode || "loop") === "loop" && (
                      <div className="space-y-2">
                         <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                            <ChevronRight className="w-3 h-3" /> Source Array Path
                          </Label>
                          <div className="flex gap-1">
                            <Button 
                              onClick={() => onUpdate({ sourceContext: "item" })} 
                              variant={mapping.sourceContext !== "root" ? "secondary" : "ghost"}
                              size="sm" 
                              className="h-5 px-1.5 text-[8px] uppercase font-bold"
                            >
                              Item
                            </Button>
                            <Button 
                              onClick={() => onUpdate({ sourceContext: "root" })} 
                              variant={mapping.sourceContext === "root" ? "secondary" : "ghost"}
                              size="sm" 
                              className="h-5 px-1.5 text-[8px] uppercase font-bold"
                            >
                              Root
                            </Button>
                          </div>
                        </div>
                        <PathSelector 
                          data={mapping.sourceContext === "root" ? rootData : contextData} 
                          value={mapping.arrayConfig?.sourcePath || "."} 
                          onChange={(path) => onUpdate({ 
                            arrayConfig: { 
                              ...mapping.arrayConfig!, 
                              sourcePath: path 
                            } 
                          })}
                        />
                      </div>
                    )}

                    <div className="space-y-3 pl-4 border-l-2 border-blue-200/50">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          {(mapping.arrayConfig?.mode || "loop") === "loop" ? "Item Rules" : "Manual Items"}
                        </Label>
                        <Button onClick={handleAddArrayMapping} size="sm" variant="ghost" className="h-6 text-[10px] hover:bg-blue-500/10 text-blue-600">
                          <Plus className="w-3 h-3 mr-1" /> Add Rule
                        </Button>
                      </div>
                      
                      <div className="space-y-3">
                        {(mapping.arrayConfig?.itemMappings || []).map((subMapping, idx, arr) => (
                          <MappingRuleItem
                            key={subMapping.id}
                            mapping={subMapping}
                            onUpdate={(updates) => handleUpdateArrayMapping(subMapping.id, updates)}
                            onRemove={() => handleRemoveArrayMapping(subMapping.id)}
                            onMove={(dir) => handleMoveArrayMapping(subMapping.id, dir)}
                            isFirst={idx === 0}
                            isLast={idx === arr.length - 1}
                            contextData={subContextData}
                            rootData={rootData}
                          />
                        ))}
                      </div>
                    </div>
                 </div>
              ) : mapping.type === "object" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold text-orange-600 uppercase tracking-widest flex items-center gap-1.5">
                      <Box className="w-3 h-3" /> Object Setup
                    </Label>
                    <div className="flex gap-1">
                      <Button 
                        onClick={() => onUpdate({ sourceContext: "item" })} 
                        variant={mapping.sourceContext !== "root" ? "secondary" : "ghost"}
                        size="sm" 
                        className="h-5 px-1.5 text-[8px] uppercase font-bold"
                      >
                        Item
                      </Button>
                      <Button 
                        onClick={() => onUpdate({ sourceContext: "root" })} 
                        variant={mapping.sourceContext === "root" ? "secondary" : "ghost"}
                        size="sm" 
                        className="h-5 px-1.5 text-[8px] uppercase font-bold"
                      >
                        Root
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3 pl-4 border-l-2 border-orange-200/50">
                    <div className="flex items-center justify-between mb-2">
                       <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Fields</Label>
                       <Button onClick={handleAddObjectMapping} size="sm" variant="ghost" className="h-6 text-[10px] hover:bg-orange-500/10 text-orange-600">
                        <Plus className="w-3 h-3 mr-1" /> Add Field
                      </Button>
                    </div>
                    {(mapping.objectConfig?.itemMappings || []).map((subMapping, idx, arr) => (
                      <MappingRuleItem
                        key={subMapping.id}
                        mapping={subMapping}
                        onUpdate={(updates) => handleUpdateObjectMapping(subMapping.id, updates)}
                        onRemove={() => handleRemoveObjectMapping(subMapping.id)}
                        onMove={(dir) => handleMoveObjectMapping(subMapping.id, dir)}
                        isFirst={idx === 0}
                        isLast={idx === arr.length - 1}
                        contextData={mapping.sourceContext === "root" ? rootData : contextData}
                        rootData={rootData}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <PathSelector 
                  data={mapping.sourceContext === "root" ? rootData : contextData} 
                  value={mapping.sourcePath} 
                  onChange={(path) => onUpdate({ sourcePath: path })}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-border/50 pt-2 -mx-4 px-4 -mb-4 pb-4">
           <Button
            onClick={onRemove}
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] text-destructive hover:bg-destructive/10 gap-1.5"
          >
            <Trash2 className="w-3 h-3" /> Remove Field
          </Button>
        </div>
      </div>
    </Card>
  );
}

// --- Main Playground Component ---

export function ManipulationPlayground() {
  const {
    rawJson,
    mappings,
    outputMode,
    arraySourcePath,
    setRawJson,
    setOutputMode,
    setArraySourcePath,
    addMapping,
    removeMapping,
    updateMapping,
    moveMapping,
    clearAll,
    resetConfig,
  } = useManipulationStore();

  const [isHydrated, setIsHydrated] = useState(false);

  // Handle Hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const { data: parsedJson, error: parseError } = useMemo(
    () => parseJson(rawJson),
    [rawJson],
  );

  // Auto-detect output mode based on input JSON structure (only on change, not on hydration)
  useEffect(() => {
    if (parsedJson && isHydrated) {
      if (Array.isArray(parsedJson)) {
        setOutputMode("array");
      } else if (typeof parsedJson === "object" && parsedJson !== null) {
        setOutputMode("object");
      }
    }
  }, [parsedJson, isHydrated, setOutputMode]);

  const outputJson = useMemo(() => {
    if (!parsedJson || (outputMode === "object" && mappings.length === 0)) return null;

    if (outputMode === "object") {
      return applyMapping(parsedJson, mappings);
    } else {
      const arrayData = getValueByPath(parsedJson, arraySourcePath || ".");
      if (!Array.isArray(arrayData)) return null;
      return applyMapping(arrayData, mappings);
    }
  }, [parsedJson, mappings, outputMode, arraySourcePath]);

  const handleFormatJson = () => {
    const result = parseJson(rawJson);
    if (result.data) {
      setRawJson(formatJson(result.data));
    } else {
      toast.error("Invalid JSON cannot be formatted");
    }
  };

  const handleCopyOutput = () => {
    if (outputJson) {
      navigator.clipboard.writeText(formatJson(outputJson));
      toast.success("Copied to clipboard!");
    }
  };

  if (!isHydrated) return null; // Avoid mismatch during hydration

  return (
    <div className="flex flex-col h-[calc(100vh-var(--app-header))] bg-background">
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        {/* Input Panel */}
        <ResizablePanel defaultSize={35} minSize={20}>
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <Label className="text-sm font-semibold">Input JSON</Label>
              <div className="flex gap-2">
                {parseError ? (
                  <Badge variant="destructive" className="text-xs">
                    Invalid
                  </Badge>
                ) : rawJson ? (
                  <Badge variant="default" className="text-xs bg-green-600">
                    Valid
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <CodeEditor
                value={rawJson}
                onChange={setRawJson}
                placeholder='// Paste your JSON here...'
                height="100%"
                language="json"
              />
            </div>

            <div className="px-4 py-3 border-t border-border flex gap-2">
              <Button onClick={handleFormatJson} variant="outline" size="sm" disabled={!rawJson}>
                Format
              </Button>
              <Button onClick={clearAll} variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" disabled={!rawJson && mappings.length === 0}>
                <Eraser className="w-3 h-3 mr-1" /> Clear All
              </Button>
            </div>

            {parseError && (
              <div className="px-4 py-2 bg-destructive/10">
                <p className="text-xs text-destructive">{parseError}</p>
              </div>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Mapping Panel */}
        <ResizablePanel defaultSize={35} minSize={25}>
          <div className="flex flex-col h-full border-x">
            {/* Output Configuration Section */}
            <div className="px-4 py-4 border-b border-border bg-muted/10 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-bold uppercase tracking-tight">Output Configuration</Label>
                </div>
                <Button onClick={resetConfig} variant="ghost" size="sm" className="h-7 text-[10px] text-muted-foreground hover:text-foreground">
                  <RotateCcw className="w-3 h-3 mr-1" /> Reset Config
                </Button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Result Type</Label>
                    <Select items={OUTPUT_MODE_ITEMS} value={outputMode} onValueChange={(v) => setOutputMode(v as any)}>
                      <SelectTrigger className="h-8 text-xs bg-background border-border shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="object" className="text-xs font-medium">Single Object</SelectItem>
                        <SelectItem value="array" className="text-xs font-medium">Array of Objects</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {outputMode === "array" && (
                  <div className="space-y-2 p-3 bg-background rounded-lg border border-border shadow-inner">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                      Source Array Path <span className="lowercase font-normal opacity-60">(where to loop)</span>
                    </Label>
                    <PathSelector 
                      data={parsedJson} 
                      value={arraySourcePath} 
                      onChange={setArraySourcePath}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-primary" />
                <Label className="text-xs font-bold uppercase text-muted-foreground">Mapping Rules</Label>
              </div>
              <Button 
                onClick={addMapping} 
                size="sm" 
                variant="default" 
                className="h-8 text-xs px-4 bg-primary hover:bg-primary/90"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Field
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {mappings.length === 0 ? (
                  <Empty className="py-12 border-2 border-dashed rounded-xl border-border/50 bg-muted/5">
                    <EmptyTitle className="text-muted-foreground">Ready to transform</EmptyTitle>
                    <EmptyDescription>Define how you want to restructure your data here.</EmptyDescription>
                  </Empty>
                ) : (
                  mappings.map((mapping, idx) => (
                    <MappingRuleItem
                      key={mapping.id}
                      mapping={mapping}
                      onUpdate={(updates) => updateMapping(mapping.id, updates)}
                      onRemove={() => removeMapping(mapping.id)}
                      onMove={(dir) => moveMapping(mapping.id, dir)}
                      isFirst={idx === 0}
                      isLast={idx === mappings.length - 1}
                      contextData={(() => {
                        if (outputMode === "array") {
                          const arrayData = getValueByPath(parsedJson, arraySourcePath);
                          return Array.isArray(arrayData) && arrayData.length > 0 ? arrayData[0] : {};
                        }
                        return parsedJson;
                      })()}
                      rootData={parsedJson}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Output Panel */}
        <ResizablePanel defaultSize={30} minSize={20}>
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/5">
              <Label className="text-sm font-semibold">Output JSON</Label>
              <Button onClick={handleCopyOutput} size="sm" variant="outline" disabled={!outputJson}>
                <Copy className="w-4 h-4 mr-1" />
                Copy
              </Button>
            </div>

            <div className="flex-1 overflow-hidden">
              {!outputJson ? (
                <Empty className="h-full">
                  <EmptyTitle>Transforming...</EmptyTitle>
                  <EmptyDescription>
                    Your results will appear here in real-time.
                  </EmptyDescription>
                </Empty>
              ) : (
                <CodeEditor
                  value={formatJson(outputJson)}
                  readOnly
                  height="100%"
                  language="json"
                />
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Floating Help Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <ManipulationHelp />
      </div>
    </div>
  );
}
