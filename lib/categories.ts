import type { Category } from "@/types";

// IMPORTANT: This module is imported by client components (SearchClient,
// WordsTable, ProgressClient, etc.). It must stay server/client neutral —
// no Node-only imports. The DB-aware loader lives in `categories-db.ts`.
//
// This list is the source of truth for the display fields, but **nothing here
// reaches a user until migrate.ts syncs it into the `categories` table** —
// `/api/categories` serves DB rows and only falls back to this array when
// there is no database or no rows. Editing a name here and deploying is not
// enough on its own; `seedCategoriesIntoDb` has to run (prod deploys only).
// It used to not even be enough then: the upsert ignored every display field.
//
// ---- Cover images ----
// Every `imageUrl` here is self-hosted in the `word-images` bucket as
// `category-<id>.webp`. They used to hotlink `images.unsplash.com`, which meant
// a shipped iOS app's category heroes depended on a photo a stranger could
// delete at any time. Rehosted 2026-08-24; the originals were:
//
//   kitchen        photo-1556909114-f6e7ad7d3136
//   bathroom       photo-1552321554-5fefe8c9ef14
//   bedroom        photo-1505693416388-ac5ce068fe85
//   living-room    photo-1586023492125-27b2c045efd7
//   office         photo-1497366216548-37526070297c
//   street         photo-1449824913935-59a10b8d2000
//   supermarket    photo-1542838132-92c53300491e
//   transportation photo-1502877338535-766e1452684a
//
// (Unsplash License. seasonings / zodiac were already ours.) Only iOS renders
// these — `CategoryView.categoryArtwork`, which special-cases `kitchen` to a
// bundled asset, so kitchen's URL is currently unused but kept consistent.

export const categories: Category[] = [
  {
    id: "custom",
    name: "Custom",
    nameZh: "自定義",
    emoji: "🧩",
    description: "用自己的照片建立的學習卡片",
    descriptionEn: "Cards you built from your own photos",
    color: "from-teal-100 to-yellow-100",
    imageUrl: "",
  },
  {
    // Saved 公開圖鑑 items (docs/COMMUNITY_ATLAS_PLAN.md). A source rather than
    // a topic, same shortcut as "custom" above — it rides the existing theme
    // machinery instead of adding a parallel deck concept. Unlike "custom" it
    // is strictly opt-in: the study queue only includes it when explicitly
    // selected, so users who have saved nothing never study an empty theme.
    //
    // 物見 is the iOS UI name for the public half (the third tab); the id stays
    // "community" because it is a wire value stored on user rows. The
    // description deliberately does *not* name the tab: this string ships ahead
    // of the iOS rename, so it has to read correctly to someone whose app still
    // calls that tab 社群.
    id: "community",
    name: "Sightings",
    nameZh: "物見",
    emoji: "🌏",
    description: "你從其他人公開的圖鑑收藏的卡片",
    descriptionEn: "Cards you saved from other people's atlases",
    color: "from-teal-100 to-sky-100",
    imageUrl: "",
  },
  {
    id: "kitchen",
    name: "Kitchen",
    nameZh: "廚房",
    emoji: "🍳",
    description: "煮飯做菜的好地方",
    descriptionEn: "Where the cooking happens",
    color: "from-orange-100 to-rose-100",
    imageUrl:
      "https://img.nexflow.team/word-images/category-kitchen.webp",
  },
  {
    id: "bathroom",
    name: "Bathroom",
    nameZh: "浴室",
    emoji: "🛁",
    description: "盥洗與梳理的空間",
    descriptionEn: "Washing up and getting ready",
    color: "from-sky-100 to-cyan-100",
    imageUrl:
      "https://img.nexflow.team/word-images/category-bathroom.webp",
  },
  {
    id: "bedroom",
    name: "Bedroom",
    nameZh: "臥室",
    emoji: "🛏️",
    description: "休息與睡眠的角落",
    descriptionEn: "The corner for rest and sleep",
    color: "from-purple-100 to-pink-100",
    imageUrl:
      "https://img.nexflow.team/word-images/category-bedroom.webp",
  },
  {
    id: "living-room",
    name: "Living Room",
    nameZh: "客廳",
    emoji: "🛋️",
    description: "與家人相聚的空間",
    descriptionEn: "Where the family gathers",
    color: "from-amber-100 to-yellow-100",
    imageUrl:
      "https://img.nexflow.team/word-images/category-living-room.webp",
  },
  {
    id: "office",
    name: "Office",
    nameZh: "辦公室",
    emoji: "💼",
    description: "工作與學習的環境",
    descriptionEn: "Where you work and study",
    color: "from-slate-100 to-blue-100",
    imageUrl:
      "https://img.nexflow.team/word-images/category-office.webp",
  },
  {
    id: "street",
    name: "Street",
    nameZh: "街上",
    emoji: "🚶",
    description: "走在城市的街道",
    descriptionEn: "Out walking the city streets",
    color: "from-gray-100 to-stone-100",
    imageUrl:
      "https://img.nexflow.team/word-images/category-street.webp",
  },
  {
    id: "supermarket",
    name: "Supermarket",
    nameZh: "超市",
    emoji: "🛒",
    description: "日常採購的好夥伴",
    descriptionEn: "Your everyday shopping run",
    color: "from-emerald-100 to-lime-100",
    imageUrl:
      "https://img.nexflow.team/word-images/category-supermarket.webp",
  },
  {
    id: "transportation",
    name: "Transportation",
    nameZh: "交通工具",
    emoji: "🚗",
    description: "移動世界的方式",
    descriptionEn: "Ways of getting around",
    color: "from-indigo-100 to-blue-100",
    imageUrl:
      "https://img.nexflow.team/word-images/category-transportation.webp",
  },
  {
    id: "seasonings",
    name: "Seasonings",
    nameZh: "調味料",
    emoji: "🧂",
    description: "讓食物變美味的小幫手",
    descriptionEn: "The little helpers that make food taste good",
    color: "from-rose-100 to-amber-100",
    imageUrl:
      "https://img.nexflow.team/word-images/category-seasonings.webp",
  },
  {
    id: "zodiac",
    name: "Zodiac",
    nameZh: "星座",
    emoji: "⭐",
    description: "十二星座與英文名稱",
    descriptionEn: "The twelve signs and their English names",
    color: "from-cyan-100 to-violet-100",
    imageUrl:
      "https://img.nexflow.team/word-images/category-zodiac.webp",
  },
];

export const getCategory = (id: string): Category | undefined =>
  categories.find((c) => c.id === id);
