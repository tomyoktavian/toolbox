import {
  ArrowLeftRight,
  FileCode,
  GitCompare,
  KeyRound,
  Regex,
  Send,
  Sparkles,
  Terminal,
  Type,
  type LucideIcon,
} from "lucide-react";

export type ToolCategoryId = "data" | "api" | "ai" | "utility";

export interface ToolCategory {
  id: ToolCategoryId;
  label: string;
  /** Classes for the icon tile. */
  tile: string;
  /** Classes for the category label text. */
  text: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: ToolCategoryId;
  icon: LucideIcon;
  /** Route of the tool. A tool without a route is shown as a proposal. */
  href?: string;
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: "data",
    label: "Data",
    tile: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
    text: "text-blue-700 dark:text-blue-300",
  },
  {
    id: "api",
    label: "API",
    tile: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  {
    id: "ai",
    label: "AI",
    tile: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
    text: "text-violet-700 dark:text-violet-300",
  },
  {
    id: "utility",
    label: "Utilitas",
    tile: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
    text: "text-amber-800 dark:text-amber-300",
  },
];

export const TOOLS: Tool[] = [
  {
    id: "converter",
    name: "Converter",
    description:
      "Ubah JSON menjadi model TypeScript, Java, Flutter, Swift, Go, atau Kotlin.",
    category: "data",
    icon: FileCode,
    href: "/converter",
  },
  {
    id: "manipulation",
    name: "Manipulation",
    description: "Pilih path, atur tipe data tiap field, lalu hasilkan JSON baru.",
    category: "data",
    icon: Terminal,
    href: "/json-manipulation",
  },
  {
    id: "http-client",
    name: "HTTP Client",
    description:
      "Kirim request REST dan WebSocket, kelola environment, dan jelajahi respons.",
    category: "api",
    icon: Send,
    href: "/http-client",
  },
  {
    id: "prompt-tester",
    name: "Penguji Prompt",
    description:
      "Jalankan satu prompt di beberapa model dan bandingkan hasilnya.",
    category: "ai",
    icon: Sparkles,
  },
  {
    id: "token-counter",
    name: "Penghitung Token",
    description:
      "Perkirakan jumlah token dan biaya sebuah teks sebelum dikirim ke model.",
    category: "ai",
    icon: Type,
  },
  {
    id: "diff",
    name: "Diff",
    description: "Bandingkan dua teks atau dua JSON dan lihat perbedaannya.",
    category: "data",
    icon: GitCompare,
    href: "/diff",
  },
  {
    id: "jwt-decoder",
    name: "JWT Decoder",
    description:
      "Baca header, payload, dan masa berlaku token tanpa mengirimnya ke mana pun.",
    category: "api",
    icon: KeyRound,
  },
  {
    id: "regex-tester",
    name: "Regex Tester",
    description: "Uji ekspresi reguler terhadap teks contoh dengan sorotan hasil.",
    category: "utility",
    icon: Regex,
  },
  {
    id: "encode-decode",
    name: "Encode / Decode",
    description: "Base64, URL, dan HTML entity dalam satu tempat.",
    category: "utility",
    icon: ArrowLeftRight,
  },
];
