export type CategoryId =
  | "kitchen"
  | "bathroom"
  | "bedroom"
  | "living-room"
  | "office"
  | "street"
  | "supermarket"
  | "transportation"
  | "seasonings";

export interface Category {
  id: CategoryId;
  name: string;
  nameZh: string;
  emoji: string;
  description: string;
  color: string;
  imageUrl: string;
}

export interface Example {
  en: string;
  zh: string;
}

export interface ConfusingWord {
  word: string;
  note: string;
}

export interface Word {
  id: string;
  word: string;
  alsoKnownAs?: string[];
  chinese: string;
  category: CategoryId;
  partOfSpeech: string;
  pronunciation: string;
  imageUrl: string;
  collocations?: string[];
  examples: Example[];
  relatedWords?: string[];
  confusingWords?: ConfusingWord[];
  note?: string;
}

export type QuizType = "image" | "chinese" | "spelling";

export interface QuizResult {
  type: QuizType;
  total: number;
  correct: number;
  wrongIds: string[];
  date: string;
}

export interface Progress {
  learnedIds: string[];
  favoriteIds: string[];
  quizHistory: QuizResult[];
  lastCategoryVisited?: CategoryId;
}
