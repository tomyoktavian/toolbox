"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function FloatingActions() {
  return (
    <div className="fixed bottom-5 left-5 z-20">
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Tentang Dev Toolbox"
              className="flex size-10 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
            />
          }
        >
          <Info className="size-4" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-64 text-xs leading-relaxed">
          Kumpulan alat pengembangan yang berjalan sepenuhnya di browser — data JSON tidak
          dikirim ke mana pun kecuali alat yang memang menjaring, seperti HTTP Client.
        </PopoverContent>
      </Popover>
    </div>
  );
}
