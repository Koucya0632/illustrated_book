import type { CEFRLevel, Definition } from "@/types";
import batchA from "../data/professions-series-2026-09-batch-a.json";
import batchB from "../data/professions-series-2026-09-batch-b.json";
import batchC from "../data/professions-series-2026-09-batch-c.json";
import batchD from "../data/professions-series-2026-09-batch-d.json";
import batchE from "../data/professions-series-2026-09-batch-e.json";
import type { MainWordCorrection } from "./main-word-corrections";
import type { MainWordExamplePair } from "./main-word-example-pairs";

type ProfessionExample = {
  en: string;
  ja: string;
  zh: string;
  cefrLevel: CEFRLevel;
};

type ProfessionEntry = {
  id: string;
  word: string;
  chinese: string;
  chineseDefinition: string;
  category: "professions";
  partOfSpeech: "noun";
  pronunciation: string;
  definitions: Definition[];
  examples: [ProfessionExample, ProfessionExample];
  relatedWords: string[];
  ja: string;
  jaReading: string;
  jaReadingSegments: { text: string; ruby: string | null }[] | null;
};

const SOURCE_ENTRIES: ProfessionEntry[] = [
  ...(batchA.entries as unknown as ProfessionEntry[]),
  ...(batchB.entries as unknown as ProfessionEntry[]),
  ...(batchC.entries as unknown as ProfessionEntry[]),
  ...(batchD.entries as unknown as ProfessionEntry[]),
  ...(batchE.entries as unknown as ProfessionEntry[]),
];

const IMAGE_STORAGE_PATHS = {
  "convenience-store-clerk": "convenience-store-clerk-ai-6d451e38dc78.webp",
  "supermarket-clerk": "supermarket-clerk-ai-3728b1127101.webp",
  "sales-clerk": "sales-clerk-ai-8a4d703c35c6.webp",
  "department-store-clerk": "department-store-clerk-ai-5515cce4f9a6.webp",
  "bank-teller": "bank-teller-ai-068347f329ca.webp",
  "postal-clerk": "postal-clerk-ai-19dbc0bdc4a5.webp",
  "pharmacy-clerk": "pharmacy-clerk-ai-4083532b6ddb.webp",
  "florist": "florist-ai-a29f1281daee.webp",
  "butcher": "butcher-ai-77945c656a02.webp",
  "fishmonger": "fishmonger-ai-6730d3fbb238.webp",
  "chef": "chef-ai-52a89aebb6af.webp",
  "restaurant-cook": "restaurant-cook-ai-018435e16e00.webp",
  "restaurant-server": "restaurant-server-ai-d7a90671ee49.webp",
  "barista": "barista-ai-19f772479a2a.webp",
  "sushi-chef": "sushi-chef-ai-d626040f8f00.webp",
  "pastry-chef": "pastry-chef-ai-c9bb51e4ff6d.webp",
  "bartender": "bartender-ai-546fd5dbbcdc.webp",
  "hotel-receptionist": "hotel-receptionist-ai-65ccccbeaa8a.webp",
  "concierge": "concierge-ai-44244dc2228d.webp",
  "tour-guide": "tour-guide-ai-570e6247a279.webp",
  "doctor": "doctor-ai-cf291c23831e.webp",
  "nurse": "nurse-ai-915640a62338.webp",
  "dentist": "dentist-ai-b0e249b4ee54.webp",
  "dental-hygienist": "dental-hygienist-ai-dfe56158e554.webp",
  "pharmacist": "pharmacist-ai-6e4db526b8c1.webp",
  "veterinarian": "veterinarian-ai-81fc301ea453.webp",
  "paramedic": "paramedic-ai-9ac38de34826.webp",
  "physical-therapist": "physical-therapist-ai-ad1022e06c44.webp",
  "caregiver": "caregiver-ai-fa62698d268a.webp",
  "midwife": "midwife-ai-b95101af070c.webp",
  "teacher": "teacher-ai-fe7bb7f41cc5.webp",
  "nursery-teacher": "nursery-teacher-ai-ae26fb8926ff.webp",
  "kindergarten-teacher": "kindergarten-teacher-ai-4dff999fb903.webp",
  "school-nurse": "school-nurse-ai-68d3c22a66e6.webp",
  "librarian": "librarian-ai-92cd781c7549.webp",
  "cram-school-teacher": "cram-school-teacher-ai-257679717391.webp",
  "sports-coach": "sports-coach-ai-1fa70570138c.webp",
  "driving-instructor": "driving-instructor-ai-08490eb3ae72.webp",
  "swimming-instructor": "swimming-instructor-ai-91987dfd5c23.webp",
  "museum-guide": "museum-guide-ai-05849bd6203d.webp",
  "train-driver": "train-driver-ai-d37181cdd07d.webp",
  "train-conductor": "train-conductor-ai-9971501ebff9.webp",
  "station-attendant": "station-attendant-ai-8471fd4f12da.webp",
  "bus-driver": "bus-driver-ai-8965d384fd6d.webp",
  "taxi-driver": "taxi-driver-ai-ac2b1eead56a.webp",
  "truck-driver": "truck-driver-ai-8117a5d476a1.webp",
  "delivery-driver": "delivery-driver-ai-6eec63c2ebe5.webp",
  "mail-carrier": "mail-carrier-ai-1e78ba1a8981.webp",
  "pilot": "pilot-ai-e81facb9af0d.webp",
  "flight-attendant": "flight-attendant-ai-ec2701357836.webp",
  "police-officer": "police-officer-ai-312829a31fa8.webp",
  "firefighter": "firefighter-ai-7ba302c9985c.webp",
  "security-guard": "security-guard-ai-23776b067200.webp",
  "traffic-guard": "traffic-guard-ai-39a87b1ec35d.webp",
  "crossing-guard": "crossing-guard-ai-9992d7e90520.webp",
  "lifeguard": "lifeguard-ai-4a6fcccf40ec.webp",
  "coast-guard-officer": "coast-guard-officer-ai-42d40bf3fb6d.webp",
  "customs-officer": "customs-officer-ai-a113dedb0c97.webp",
  "parking-attendant": "parking-attendant-ai-789163d12b5e.webp",
  "rescue-worker": "rescue-worker-ai-b5afe3be65bc.webp",
  "construction-worker": "construction-worker-ai-af7a29a31a7f.webp",
  "carpenter": "carpenter-ai-185902620106.webp",
  "electrician": "electrician-ai-6fb4ab390dfa.webp",
  "plumber": "plumber-ai-039c5672ac53.webp",
  "painter": "painter-ai-14a160479bc1.webp",
  "plasterer": "plasterer-ai-6e3cabc9171f.webp",
  "roofer": "roofer-ai-8669cd741a31.webp",
  "welder": "welder-ai-b8c5d09782bc.webp",
  "crane-operator": "crane-operator-ai-056d0391cc46.webp",
  "surveyor": "surveyor-ai-73659a3948f4.webp",
  "building-cleaner": "building-cleaner-ai-03bdf08bda58.webp",
  "street-cleaner": "street-cleaner-ai-fa47fadc13d6.webp",
  "garbage-collector": "garbage-collector-ai-f10685bf1628.webp",
  "window-cleaner": "window-cleaner-ai-0adbb1b12ac7.webp",
  "hotel-housekeeper": "hotel-housekeeper-ai-5756e6092ca7.webp",
  "gardener": "gardener-ai-e1c8bc5ad24b.webp",
  "auto-mechanic": "auto-mechanic-ai-2cbb7e5ddc30.webp",
  "bicycle-mechanic": "bicycle-mechanic-ai-4e0e8017e489.webp",
  "appliance-repair-technician": "appliance-repair-technician-ai-55898c007810.webp",
  "pest-control-worker": "pest-control-worker-ai-1288fad3058e.webp",
  "hairdresser": "hairdresser-ai-b17fe8ed16dd.webp",
  "barber": "barber-ai-1b97d63a481f.webp",
  "beautician": "beautician-ai-a49e70f2cd45.webp",
  "nail-technician": "nail-technician-ai-27ab541c0136.webp",
  "makeup-artist": "makeup-artist-ai-130da6596f00.webp",
  "massage-therapist": "massage-therapist-ai-ea896d726272.webp",
  "fitness-trainer": "fitness-trainer-ai-37944268c9c5.webp",
  "yoga-instructor": "yoga-instructor-ai-d5b2d65e1b92.webp",
  "tailor": "tailor-ai-461c60c68ec8.webp",
  "shoe-repairer": "shoe-repairer-ai-0617a63a5877.webp",
  "farmer": "farmer-ai-90f6ad314d54.webp",
  "fisherman": "fisherman-ai-4eb791fbd54a.webp",
  "forestry-worker": "forestry-worker-ai-ffc990b1103a.webp",
  "factory-worker": "factory-worker-ai-b349e9dda7d7.webp",
  "food-factory-worker": "food-factory-worker-ai-002b674757ce.webp",
  "baker": "baker-ai-a07160317718.webp",
  "photographer": "photographer-ai-889c845fa15c.webp",
  "reporter": "reporter-ai-f535e32dd85f.webp",
  "musician": "musician-ai-250c27941593.webp",
  "manga-artist": "manga-artist-ai-82d793ce3adb.webp",
} as const;

const PROFESSION_ENTRIES = SOURCE_ENTRIES.map((entry) => {
  const storagePath =
    IMAGE_STORAGE_PATHS[entry.id as keyof typeof IMAGE_STORAGE_PATHS];
  if (!storagePath) {
    throw new Error(`Missing reviewed profession image for ${entry.id}`);
  }
  return {
    ...entry,
    imageUrl: `https://img.nexflow.team/word-images/${storagePath}`,
  };
});

if (PROFESSION_ENTRIES.length !== Object.keys(IMAGE_STORAGE_PATHS).length) {
  throw new Error("Profession source and publish-plan image counts differ");
}

export const MAIN_WORD_PROFESSIONS_WORDS = PROFESSION_ENTRIES.map(
  ({ ja: _ja, jaReading: _jaReading, jaReadingSegments: _segments, ...word }) =>
    word,
);

export const MAIN_WORD_PROFESSIONS_CORRECTIONS: MainWordCorrection[] =
  PROFESSION_ENTRIES.map(
    ({ id, definitions, ja, jaReading, jaReadingSegments }) => {
      const seededJaDefinition = definitions.find(
        ({ language }) => language === "ja",
      )!.definition;
      return {
        id,
        oldJa: seededJaDefinition,
        ja,
        oldJaReading: jaReading,
        jaReading,
        jaReadingSegments,
        jaDefinition: {
          old: seededJaDefinition,
          value: seededJaDefinition,
        },
      };
    },
  );

export const MAIN_WORD_PROFESSIONS_EXAMPLE_PAIRS: MainWordExamplePair[] =
  PROFESSION_ENTRIES.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], sortOrder: 0 },
      { ...examples[1], sortOrder: 1 },
    ],
  }));

export const MAIN_WORD_PROFESSIONS_IDS = PROFESSION_ENTRIES.map(({ id }) => id);

