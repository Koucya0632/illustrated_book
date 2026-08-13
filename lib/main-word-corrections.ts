import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

type ExampleCorrection = {
  sortOrder: number;
  oldEn: string;
  en: string;
  oldZh: string;
  zh: string;
};

type MainWordCorrection = {
  id: string;
  oldWord?: string;
  word?: string;
  oldZh?: string;
  zh?: string;
  oldJa?: string;
  ja?: string;
  oldCategory?: string;
  category?: string;
  oldPronunciation?: string;
  pronunciation?: string;
  examples?: ExampleCorrection[];
};

export const MAIN_WORD_CORRECTIONS: MainWordCorrection[] = [
  {
    id: "electric-cooker",
    oldWord: "electric cooker",
    word: "slow cooker",
    oldZh: "電鍋",
    zh: "慢燉鍋",
    oldJa: "電気調理器",
    ja: "スロークッカー",
    oldPronunciation: "/ɪˌlek.trɪk ˈkʊk.ɚ/",
    pronunciation: "/ˈsloʊ ˌkʊk.ɚ/",
    examples: [
      {
        sortOrder: 0,
        oldEn: "I use the electric cooker in the kitchen.",
        en: "I use the slow cooker in the kitchen.",
        oldZh: "我在廚房使用電鍋。",
        zh: "我在廚房使用慢燉鍋。",
      },
    ],
  },
  {
    id: "toilet-seat",
    oldZh: "馬桶蓋",
    zh: "馬桶座圈",
    examples: [
      {
        sortOrder: 0,
        oldEn: "The toilet seat is in the bathroom.",
        en: "The toilet seat is in the bathroom.",
        oldZh: "馬桶蓋在浴室裡。",
        zh: "馬桶座圈在浴室裡。",
      },
    ],
  },
  {
    id: "deodorant",
    oldZh: "除臭劑",
    zh: "體香劑",
    oldJa: "制汗剤",
    ja: "デオドラント",
    examples: [
      {
        sortOrder: 0,
        oldEn: "The deodorant is in the bathroom.",
        en: "The deodorant is in the bathroom.",
        oldZh: "除臭劑在浴室裡。",
        zh: "體香劑在浴室裡。",
      },
    ],
  },
  { id: "lotion", oldJa: "ローション", ja: "ボディローション" },
  {
    id: "eraser",
    oldWord: "eraser",
    word: "whiteboard eraser",
    oldZh: "板擦",
    zh: "白板擦",
    oldJa: "消しゴム",
    ja: "ホワイトボード用イレーザー",
    oldPronunciation: "/ɪˈreɪ.sɚ/",
    pronunciation: "/ˈwaɪt.bɔːrd ɪˌreɪ.sɚ/",
    examples: [
      {
        sortOrder: 0,
        oldEn: "I need the eraser at the office.",
        en: "I need the whiteboard eraser at the office.",
        oldZh: "我在辦公室需要板擦。",
        zh: "我在辦公室需要白板擦。",
      },
    ],
  },
  { id: "bathroom-cabinet", oldJa: "洗面台収納", ja: "洗面所の収納棚" },
  { id: "nightstand", oldJa: "ナイトスタンド", ja: "ベッドサイドテーブル" },
  { id: "display-cabinet", oldJa: "ディスプレイキャビネット", ja: "飾り棚" },
  { id: "wall-art", oldJa: "壁面アート", ja: "壁飾り" },
  { id: "footstool", oldJa: "フットスツール", ja: "足置き" },
  { id: "computer", oldJa: "コンピューター", ja: "パソコン" },
  { id: "paper-clip", oldJa: "ペーパークリップ", ja: "クリップ" },
  {
    id: "reception-desk",
    oldJa: "受付",
    ja: "受付カウンター",
  },
  {
    id: "cashier",
    oldZh: "收銀員 / 收銀台",
    zh: "收銀員",
    oldJa: "レジ",
    ja: "レジ係",
    examples: [
      {
        sortOrder: 0,
        oldEn: "Pay at the cashier.",
        en: "The cashier scanned my groceries.",
        oldZh: "在收銀台付款。",
        zh: "收銀員掃描了我買的商品。",
      },
      {
        sortOrder: 1,
        oldEn: "The cashier was friendly.",
        en: "The cashier was friendly.",
        oldZh: "收銀員很親切。",
        zh: "收銀員很親切。",
      },
      {
        sortOrder: 2,
        oldEn: "There's a long line at the cashier.",
        en: "The cashier gave me the receipt.",
        oldZh: "收銀台排了長長的隊伍。",
        zh: "收銀員把收據交給我。",
      },
    ],
  },
  {
    id: "invoice",
    oldZh: "發票",
    zh: "請款單",
    oldCategory: "supermarket",
    category: "office",
    examples: [
      {
        sortOrder: 0,
        oldEn: "I found the invoice at the supermarket.",
        en: "I received the invoice at the office.",
        oldZh: "我在超市找到發票。",
        zh: "我在辦公室收到請款單。",
      },
    ],
  },
  {
    id: "mailbox",
    oldZh: "信箱",
    zh: "郵筒",
    examples: [
      {
        sortOrder: 0,
        oldEn: "Drop the letter in the mailbox.",
        en: "Drop the letter in the mailbox.",
        oldZh: "把信投進信箱。",
        zh: "把信投進郵筒。",
      },
      {
        sortOrder: 1,
        oldEn: "The mailbox is red.",
        en: "The mailbox is red.",
        oldZh: "信箱是紅色的。",
        zh: "郵筒是紅色的。",
      },
      {
        sortOrder: 2,
        oldEn: "Check your mailbox tomorrow.",
        en: "The mailbox is on the corner.",
        oldZh: "明天去看信箱。",
        zh: "郵筒在街角。",
      },
    ],
  },
  {
    id: "pedestrian-button",
    oldJa: "押しボタン式信号",
    ja: "歩行者用押しボタン",
  },
  {
    id: "roadblock",
    oldWord: "roadblock",
    word: "barricade",
    oldJa: "路上の障害物",
    ja: "バリケード",
    oldPronunciation: "/ˈroʊd.blɑːk/",
    pronunciation: "/ˌber.əˈkeɪd/",
    examples: [
      {
        sortOrder: 0,
        oldEn: "You can see the roadblock on the street.",
        en: "You can see the barricade on the street.",
        oldZh: "你可以在街上看到路障。",
        zh: "你可以在街上看到路障。",
      },
    ],
  },
  {
    id: "street-vendor",
    oldWord: "street vendor",
    word: "food cart",
    oldZh: "路邊攤",
    zh: "餐車",
    oldJa: "屋台",
    ja: "屋台",
    oldPronunciation: "/ˈstriːt ˌven.dɚ/",
    pronunciation: "/ˈfuːd ˌkɑːrt/",
    examples: [
      {
        sortOrder: 0,
        oldEn: "You can see the street vendor on the street.",
        en: "You can see the food cart on the street.",
        oldZh: "你可以在街上看到路邊攤。",
        zh: "你可以在街上看到餐車。",
      },
    ],
  },
  {
    id: "vendor",
    oldWord: "vendor",
    word: "market stall",
    oldZh: "攤販",
    zh: "市場攤位",
    oldJa: "売り手",
    ja: "露店",
    oldPronunciation: "/ˈven.dɚ/",
    pronunciation: "/ˈmɑːr.kɪt ˌstɔːl/",
    examples: [
      {
        sortOrder: 0,
        oldEn: "You can see the vendor on the street.",
        en: "You can see the market stall on the street.",
        oldZh: "你可以在街上看到攤販。",
        zh: "你可以在街上看到市場攤位。",
      },
    ],
  },
  { id: "dark-soy-sauce", oldJa: "濃口醤油（老抽）", ja: "老抽" },
  { id: "light-soy-sauce", oldJa: "薄口醤油（生抽）", ja: "生抽" },
  { id: "white-vinegar", oldJa: "穀物酢", ja: "ホワイトビネガー" },
  {
    id: "cinnamon-bark",
    oldWord: "cinnamon bark",
    word: "cinnamon sticks",
    oldZh: "桂皮",
    zh: "肉桂棒",
    oldJa: "シナモンスティック",
    ja: "シナモンスティック",
    oldPronunciation: "/ˈsɪn.ə.mən bɑːrk/",
    pronunciation: "/ˈsɪn.ə.mən ˌstɪks/",
    examples: [
      {
        sortOrder: 0,
        oldEn: "Add some cinnamon bark to the dish.",
        en: "Add some cinnamon sticks to the dish.",
        oldZh: "在這道菜裡加一些桂皮。",
        zh: "在這道菜裡加一些肉桂棒。",
      },
    ],
  },
  {
    id: "cornstarch",
    oldZh: "玉米粉",
    zh: "玉米澱粉",
    examples: [
      {
        sortOrder: 0,
        oldEn: "Add some cornstarch to the dish.",
        en: "Add some cornstarch to the dish.",
        oldZh: "在這道菜裡加一些玉米粉。",
        zh: "在這道菜裡加一些玉米澱粉。",
      },
    ],
  },
];

/**
 * Applies curated corrections only while a field is still at the known old
 * value (or already at the corrected value). Later admin edits are preserved.
 */
export async function applyMainWordCorrections(sql: Sql): Promise<number> {
  const touched = new Set<string>();

  await sql.begin(async (tx) => {
    for (const correction of MAIN_WORD_CORRECTIONS) {
      const rows = await tx`
        UPDATE words
        SET
          word = CASE
            WHEN ${correction.word ?? null}::text IS NOT NULL
             AND word IN (${correction.oldWord ?? null}, ${correction.word ?? null})
              THEN ${correction.word ?? null}
            ELSE word
          END,
          category = CASE
            WHEN ${correction.category ?? null}::text IS NOT NULL
             AND category IN (${correction.oldCategory ?? null}, ${correction.category ?? null})
              THEN ${correction.category ?? null}
            ELSE category
          END,
          pronunciation = CASE
            WHEN ${correction.pronunciation ?? null}::text IS NOT NULL
             AND pronunciation IN (
               ${correction.oldPronunciation ?? correction.pronunciation ?? null},
               ${correction.pronunciation ?? null}
             )
              THEN ${correction.pronunciation ?? null}
            ELSE pronunciation
          END,
          updated_at = now()
        WHERE id = ${correction.id}
          AND deleted_at IS NULL
        RETURNING id
      `;
      if (rows.length === 0) continue;
      touched.add(correction.id);

      if (correction.zh) {
        await tx`
          UPDATE word_definitions
          SET definition = ${correction.zh}, updated_at = now()
          WHERE word_id = ${correction.id}
            AND language = 'zh'
            AND sort_order = (
              SELECT min(sort_order) FROM word_definitions
              WHERE word_id = ${correction.id} AND language = 'zh'
            )
            AND definition IN (${correction.oldZh ?? correction.zh}, ${correction.zh})
        `;
      }

      if (correction.ja) {
        await tx`
          INSERT INTO word_terms (word_id, language, term)
          VALUES (${correction.id}, 'ja', ${correction.ja})
          ON CONFLICT (word_id, language) DO UPDATE SET
            term = EXCLUDED.term,
            updated_at = now()
          WHERE word_terms.term IN (${correction.oldJa ?? correction.ja}, ${correction.ja})
        `;
      }

      if (correction.word) {
        await tx`
          INSERT INTO word_terms (word_id, language, term, pronunciation)
          SELECT id, 'en', word, pronunciation FROM words WHERE id = ${correction.id}
          ON CONFLICT (word_id, language) DO UPDATE SET
            term = EXCLUDED.term,
            pronunciation = EXCLUDED.pronunciation,
            updated_at = now()
          WHERE word_terms.term IN (${correction.oldWord ?? correction.word}, ${correction.word})
        `;
      }

      for (const example of correction.examples ?? []) {
        const exampleRows = await tx`
          UPDATE word_examples
          SET sentence = ${example.en}
          WHERE id = (
            SELECT id FROM word_examples
            WHERE word_id = ${correction.id} AND sort_order = ${example.sortOrder}
            ORDER BY id
            LIMIT 1
          )
            AND sentence IN (${example.oldEn}, ${example.en})
          RETURNING id
        `;
        if (exampleRows.length === 0) continue;
        const exampleId = exampleRows[0].id;
        await tx`
          INSERT INTO word_example_translations (example_id, language, translation)
          VALUES (${exampleId}, 'zh', ${example.zh})
          ON CONFLICT (example_id, language) DO UPDATE SET
            translation = EXCLUDED.translation
          WHERE word_example_translations.translation IN (${example.oldZh}, ${example.zh})
        `;
      }

      if (correction.word || correction.zh || correction.pronunciation) {
        await tx`
          UPDATE cards c
          SET
            back = w.word,
            explanation = concat(w.word, ' ', w.pronunciation, ' — ', d.definition)
          FROM words w
          JOIN LATERAL (
            SELECT definition
            FROM word_definitions
            WHERE word_id = w.id AND language = 'zh'
            ORDER BY sort_order
            LIMIT 1
          ) d ON true
          WHERE c.word_id = w.id
            AND c.word_id = ${correction.id}
            AND c.deck_key = 'image-en'
        `;
      }
    }
  });

  return touched.size;
}
