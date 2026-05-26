import type { Category } from "@/types";

// IMPORTANT: This module is imported by client components (SearchClient,
// WordsTable, ProgressClient, etc.). It must stay server/client neutral —
// no Node-only imports. The DB-aware loader lives in `categories-db.ts`.

export const categories: Category[] = [
  {
    id: "kitchen",
    name: "Kitchen",
    nameZh: "廚房",
    emoji: "🍳",
    description: "煮飯做菜的好地方",
    color: "from-orange-100 to-rose-100",
    imageUrl:
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
  },
  {
    id: "bathroom",
    name: "Bathroom",
    nameZh: "浴室",
    emoji: "🛁",
    description: "盥洗與梳理的空間",
    color: "from-sky-100 to-cyan-100",
    imageUrl:
      "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800&q=80",
  },
  {
    id: "bedroom",
    name: "Bedroom",
    nameZh: "臥室",
    emoji: "🛏️",
    description: "休息與睡眠的角落",
    color: "from-purple-100 to-pink-100",
    imageUrl:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800&q=80",
  },
  {
    id: "living-room",
    name: "Living Room",
    nameZh: "客廳",
    emoji: "🛋️",
    description: "與家人相聚的空間",
    color: "from-amber-100 to-yellow-100",
    imageUrl:
      "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80",
  },
  {
    id: "office",
    name: "Office",
    nameZh: "辦公室",
    emoji: "💼",
    description: "工作與學習的環境",
    color: "from-slate-100 to-blue-100",
    imageUrl:
      "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80",
  },
  {
    id: "street",
    name: "Street",
    nameZh: "街上",
    emoji: "🚶",
    description: "走在城市的街道",
    color: "from-gray-100 to-stone-100",
    imageUrl:
      "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&q=80",
  },
  {
    id: "supermarket",
    name: "Supermarket",
    nameZh: "超市",
    emoji: "🛒",
    description: "日常採購的好夥伴",
    color: "from-emerald-100 to-lime-100",
    imageUrl:
      "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80",
  },
  {
    id: "transportation",
    name: "Transportation",
    nameZh: "交通工具",
    emoji: "🚗",
    description: "移動世界的方式",
    color: "from-indigo-100 to-blue-100",
    imageUrl:
      "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&q=80",
  },
  {
    id: "seasonings",
    name: "Seasonings",
    nameZh: "調味料",
    emoji: "🧂",
    description: "讓食物變美味的小幫手",
    color: "from-rose-100 to-amber-100",
    imageUrl:
      "https://images.unsplash.com/photo-1532336414038-cf19250c5757?w=800&q=80",
  },
];

export const getCategory = (id: string): Category | undefined =>
  categories.find((c) => c.id === id);
