"use client";

import * as React from "react";
import {
  BookOpen,
  ChevronRight,
  Braces,
  Plus,
  Globe,
  Variable,
  Hash,
  Key,
  Eraser,
  RotateCcw,
  MousePointer2,
  ListOrdered,
  Type,
  Code2,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ManipulationHelp() {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          className="w-12 h-12 rounded-full shadow-lg hover:scale-110 transition-transform bg-primary text-primary-foreground"
        >
          <BookOpen className="w-6 h-6" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
        <DialogHeader className="p-8 pb-4 bg-primary/5 border-b border-primary/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-extrabold tracking-tight">
                Dokumentasi JSON Master
              </DialogTitle>
              <DialogDescription className="text-sm font-medium opacity-80">
                Panduan langkah-demi-langkah menguasai manipulasi data.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[calc(90vh-200px)] p-4 pt-0">
          <div className="space-y-12 pb-10">
            {/* TAHAP PERSIAPAN */}
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="px-2 py-1 bg-primary/10 text-primary border-primary/20"
                >
                  TAHAP 1
                </Badge>
                <h3 className="font-bold text-xl tracking-tight">
                  Input & Deteksi Otomatis
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-5 border-none bg-muted/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-primary" />
                    <p className="text-sm font-bold">1. Tempel JSON</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Tempelkan data asal Anda di panel **Input JSON**. Sistem
                    akan memvalidasi formatnya secara real-time.
                  </p>
                </Card>
                <Card className="p-5 border-none bg-muted/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <p className="text-sm font-bold">2. Deteksi Struktur</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Sistem akan otomatis mendeteksi apakah input Anda adalah
                    **Single Object** atau **Array**. Anda bisa merubahnya
                    manual di **Output Configuration**.
                  </p>
                </Card>
              </div>
            </section>

            {/* KONFIGURASI TIPE DATA */}
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="px-2 py-1 bg-primary/10 text-primary border-primary/20"
                >
                  TAHAP 2
                </Badge>
                <h3 className="font-bold text-xl tracking-tight">
                  Konfigurasi Per Tipe Data
                </h3>
              </div>

              <div className="space-y-8">
                {/* String, Number, Boolean */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Type className="w-5 h-5 text-primary" />
                    <h4 className="font-bold text-sm">
                      Tipe Primitif (String, Number, Boolean)
                    </h4>
                  </div>
                  <Card className="p-6 border-none bg-muted/20 space-y-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex gap-4">
                        <div className="h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                          A
                        </div>
                        <div>
                          <p className="text-xs font-bold mb-1">
                            Target Output Key
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Tuliskan nama field baru yang Anda inginkan pada
                            hasil akhir (output).
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                          B
                        </div>
                        <div>
                          <p className="text-xs font-bold mb-1">
                            Path Selector
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Gunakan tombol **Key** (objek) atau **Index**
                            (array) untuk memilih data asal dari JSON input.
                          </p>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Array (Nested) */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Braces className="w-5 h-5 text-blue-500" />
                    <h4 className="font-bold text-sm">
                      Tipe Array (Nested & Manual)
                    </h4>
                  </div>
                  <Card className="p-6 border-none bg-blue-500/5 border border-blue-500/10 space-y-6">
                    <div className="space-y-4">
                      <div className="p-4 rounded-lg bg-background border border-blue-500/20">
                        <p className="text-xs font-bold text-blue-600 mb-2 flex items-center gap-2">
                          <RotateCcw className="w-3 h-3" /> Opsi 1: Mode Loop
                          (Default)
                        </p>
                        <ol className="list-decimal pl-4 text-[11px] text-muted-foreground space-y-1.5">
                          <li>
                            Pilih **Source Array Path**: Jalur array di data
                            asal yang ingin Anda iterasi.
                          </li>
                          <li>
                            Klik **Add Nested Field**: Buat aturan baru yang
                            akan diterapkan pada **setiap item** di dalam array
                            tersebut.
                          </li>
                          <li>
                            Di dalam nested field, gunakan konteks **Item**
                            untuk mengambil data dari item yang sedang di-loop.
                          </li>
                        </ol>
                      </div>
                      <div className="p-4 rounded-lg bg-background border border-emerald-500/20">
                        <p className="text-xs font-bold text-emerald-600 mb-2 flex items-center gap-2">
                          <Plus className="w-3 h-3" /> Opsi 2: Mode Manual
                          (Construct)
                        </p>
                        <ol className="list-decimal pl-4 text-[11px] text-muted-foreground space-y-1.5">
                          <li>
                            Pilih mode **Manual** pada toggle di kanan atas.
                          </li>
                          <li>
                            Klik **Add Rule**: Tambahkan item baru ke array
                            hasil.
                          </li>
                          <li>
                            Setiap item bisa mengambil data dari **jalur
                            manapun** secara bebas, tidak terbatas pada satu
                            array asal.
                          </li>
                        </ol>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </section>

            {/* FITUR CANGGIH */}
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="px-2 py-1 bg-primary/10 text-primary border-primary/20"
                >
                  TAHAP 3
                </Badge>
                <h3 className="font-bold text-xl tracking-tight">
                  Optimasi & Finalisasi
                </h3>
              </div>
              <div className="space-y-4">
                <Card className="p-6 border-none bg-orange-500/5 border border-orange-500/10 space-y-4">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-orange-600" />
                    <p className="text-sm font-bold">
                      Teknik "Ambil Dari Mana Saja"
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Saat berada di dalam struktur nested, Anda seringkali butuh
                    data dari tingkat root. Gunakan tombol toggle:
                  </p>
                  <div className="flex gap-4">
                    <div className="flex-1 p-3 rounded bg-background border border-border text-[10px]">
                      <p className="font-bold mb-1 flex items-center gap-1.5 text-muted-foreground">
                        <Variable className="w-3 h-3" /> ITEM
                      </p>
                      Mencari data relatif terhadap item saat ini (untuk loop).
                    </div>
                    <div className="flex-1 p-3 rounded bg-background border border-border text-[10px]">
                      <p className="font-bold mb-1 flex items-center gap-1.5 text-primary">
                        <Globe className="w-3 h-3" /> ROOT
                      </p>
                      Mencari data langsung dari tingkat paling atas JSON utama.
                    </div>
                  </div>
                </Card>
              </div>
            </section>

            {/* RINGKASAN TOMBOL */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <ListOrdered className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg">Ringkasan Kontrol</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-border text-center space-y-1">
                  <Eraser className="w-4 h-4 mx-auto text-red-500" />
                  <p className="text-[9px] font-bold uppercase">Clear All</p>
                </div>
                <div className="p-3 rounded-lg border border-border text-center space-y-1">
                  <RotateCcw className="w-4 h-4 mx-auto text-orange-500" />
                  <p className="text-[9px] font-bold uppercase">Reset Config</p>
                </div>
                <div className="p-3 rounded-lg border border-border text-center space-y-1">
                  <MousePointer2 className="w-4 h-4 mx-auto text-blue-500" />
                  <p className="text-[9px] font-bold uppercase">Visual Path</p>
                </div>
                <div className="p-3 rounded-lg border border-border text-center space-y-1">
                  <Plus className="w-4 h-4 mx-auto text-emerald-500" />
                  <p className="text-[9px] font-bold uppercase">Add Field</p>
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
