import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type MappingRule, generateId } from "@/lib/json-transform";

interface ManipulationState {
  rawJson: string;
  mappings: MappingRule[];
  outputMode: "object" | "array";
  arraySourcePath: string;
  
  // Actions
  setRawJson: (json: string) => void;
  setMappings: (mappings: MappingRule[]) => void;
  setOutputMode: (mode: "object" | "array") => void;
  setArraySourcePath: (path: string) => void;
  
  addMapping: () => void;
  removeMapping: (id: string) => void;
  updateMapping: (id: string, updates: Partial<MappingRule>) => void;
  moveMapping: (id: string, direction: "up" | "down") => void;
  
  clearAll: () => void;
  resetConfig: () => void;
}

export const useManipulationStore = create<ManipulationState>()(
  persist(
    (set) => ({
      rawJson: "",
      mappings: [],
      outputMode: "object",
      arraySourcePath: ".",

      setRawJson: (rawJson) => set({ rawJson }),
      setMappings: (mappings) => set({ mappings }),
      setOutputMode: (outputMode) => set({ outputMode }),
      setArraySourcePath: (arraySourcePath) => set({ arraySourcePath }),

      addMapping: () => set((state) => ({
        mappings: [
          ...state.mappings,
          {
            id: generateId(),
            outputKey: "",
            sourceContext: "item",
            sourceType: "path",
            sourcePath: "",
            type: "string",
          },
        ],
      })),

      removeMapping: (id) => set((state) => ({
        mappings: state.mappings.filter((m) => m.id !== id),
      })),

      updateMapping: (id, updates) => set((state) => ({
        mappings: state.mappings.map((m) =>
          m.id === id ? { ...m, ...updates } : m
        ),
      })),

      moveMapping: (id, direction) => set((state) => {
        const index = state.mappings.findIndex((m) => m.id === id);
        if (index === -1) return state;
        
        const newIndex = direction === "up" ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= state.mappings.length) return state;
        
        const newMappings = [...state.mappings];
        [newMappings[index], newMappings[newIndex]] = [newMappings[newIndex], newMappings[index]];
        
        return { mappings: newMappings };
      }),

      clearAll: () => set({
        rawJson: "",
        mappings: [],
        outputMode: "object",
        arraySourcePath: ".",
      }),

      resetConfig: () => set({
        mappings: [],
        outputMode: "object",
        arraySourcePath: ".",
      }),
    }),
    {
      name: "json-manipulation-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
