# 單詞導入格式與內容規範

本文件說明如何為這個圖鑑式英語單字 App 準備、導入一個單字的資料：欄位、必填/選填、允許值、導入方式，以及哪些內容會「自動生成、不必手寫」。

> 一句話：**最少**只要給 `id / word / chinese / category / partOfSpeech / pronunciation / imageUrl / 至少一句例句(en+zh)`，其餘可留空或交給 AI 補。

---

## 0. 最小範例（看這個就會了）

```ts
{
  id: "fridge",                       // 小寫 kebab，唯一，會變成網址 /word/fridge
  word: "fridge",                     // 英文單字
  chinese: "冰箱",                     // 中文意思（會存成 zh 釋義）
  category: "kitchen",                // 必須是下方 9 個分類 id 之一
  partOfSpeech: "noun",               // 詞性
  pronunciation: "/frɪdʒ/",          // 音標（IPA/KK 字串）
  imageUrl: "https://.../fridge.jpg", // 圖片網址
  examples: [                          // 至少一句，每句要有 en + zh
    { en: "Put the milk in the fridge.", zh: "把牛奶放進冰箱。" },
  ],
  // —— 以下全部選填 ——
  alsoKnownAs: ["refrigerator"],
  collocations: ["open the fridge", "empty fridge"],
  relatedWords: ["freezer", "kitchen"],
  confusingWords: [{ word: "refrigerator", note: "refrigerator 較正式，fridge 較口語。" }],
  note: "記憶撇步（可留空，之後用 AI 補）",
  cefrLevel: "A2",                    // A1–C2，可省略
  status: "published",               // 預設 published
}
```

---

## 1. 資料怎麼存（正規化 v2 表）

一個「單字」其實散落在多張表，但你導入時用上面的扁平物件即可，系統會自動拆解：

| 概念 | 對應表 | 說明 |
| --- | --- | --- |
| 主資料 | `words` | id, word, category, part_of_speech, pronunciation, image_url, cefr_level, status, collocations, note, **etymology, forms** |
| 中文/多語釋義 | `word_definitions` | 每筆 `(language, definition)`；`chinese` 會存成 `language='zh'` |
| 例句 | `word_examples` + `word_example_translations` | 英文句子 + 各語言翻譯（`zh`、可選 `ja`…） |
| 關聯詞 | `word_relations` | synonym/antonym/hypernym/hyponym/confusing/see-also |
| 標籤 | `word_tags`（+ `tags`） | 自由 slug |
| SRS 卡片 | `cards` | **自動生成**（見第 5 節） |

---

## 2. 欄位規格

| 欄位 | 必填 | 型別 | 說明 / 允許值 |
| --- | :---: | --- | --- |
| `id` | ✅ | string | 小寫 kebab-case，符合 `^[a-z0-9-]+$`，全站唯一。是網址與卡片的鍵，**不要事後改**。 |
| `word` | ✅ | string | 英文單字（顯示用，可含空格，如 `alarm clock`）。 |
| `chinese` | ✅ | string | 中文意思。多義可用「；」分隔。 |
| `category` | ✅ | enum | 9 個分類 id 之一（見第 3 節），且必須已存在。 |
| `partOfSpeech` | ✅ | string | 詞性，慣例：`noun` / `verb` / `adjective` / `noun / verb` / `noun (plural)`。 |
| `pronunciation` | ✅ | string | 音標字串，如 `/ˈer.pleɪn/`。播放發音用瀏覽器 TTS，不需音檔。 |
| `imageUrl` | ✅ | string(URL) | 代表圖。建議 Supabase Storage 公開網址或穩定外部圖。 |
| `examples` | ✅ | array | 至少 1 句；每句 `{ en, zh }` 皆必填（zh 會存進例句翻譯）。 |
| `alsoKnownAs` | ⬜ | string[] | 同物別名/同義拼法。 |
| `collocations` | ⬜ | string[] | 常見搭配，如 `open the fridge`。 |
| `relatedWords` | ⬜ | string[] | 會轉成 `see-also` 關聯。 |
| `confusingWords` | ⬜ | `{word,note}[]` | 會轉成 `confusing` 關聯（帶說明）。 |
| `note` | ⬜ | string | 記憶撇步；留空可由 AI 補（只在空時補）。 |
| `cefrLevel` | ⬜ | enum | `A1 A2 B1 B2 C1 C2`（其一），否則省略。 |
| `status` | ⬜ | enum | `published`（預設）/ `draft` / `archived`。只有 `published` 對外顯示。 |
| `audioUrl` | ⬜ | string | 自備發音音檔網址（目前多走 TTS，可不填）。 |
| `etymology` | ⬜ | string | 詞源/構詞拆解（繁中）。通常交給 AI 生成。 |
| `forms` | ⬜ | `{label,value}[]` | 詞形變化，如 `{label:"複數", value:"fridges"}`。通常交給 AI 生成。 |

進階（完整 v2 形態，取代上面的扁平欄位時）：
- `definitions: { language, definition, cefrLevel?, sortOrder }[]`（多語釋義；給了就不需 `chinese`）。
- `examples: { en, zh, translations?: {ja?:…}, cefrLevel?, sortOrder? }[]`（多語例句翻譯）。
- `relations: { wordId, type, note? }[]`（直接給 typed 關聯，取代 relatedWords/confusingWords）。
- `tags: string[]`。

---

## 3. 允許值清單

**分類 `category`（9 種，必須擇一）**

| id | 中文 |
| --- | --- |
| `kitchen` | 廚房 |
| `bathroom` | 浴室 |
| `bedroom` | 臥室 |
| `living-room` | 客廳 |
| `office` | 辦公室 |
| `street` | 街上 |
| `supermarket` | 超市 |
| `transportation` | 交通工具 |
| `seasonings` | 調味料 |

**CEFR**：`A1 A2 B1 B2 C1 C2`
**status**：`published` / `draft` / `archived`
**關聯類型 `relations[].type`**：`synonym`（同義）/ `antonym`（反義）/ `hypernym`（上位）/ `hyponym`（下位）/ `confusing`（易混淆）/ `see-also`（相關）
**語言碼**（definitions / 例句 translations）：ISO 639-1，如 `zh`、`ja`、`en`。
**關聯目標 `relations[].wordId`**：可填字典裡的 `id`（會變成可點連結），或任意英文詞（顯示為純文字 chip）。

---

## 4. 導入方式

### A.（推薦）種子檔 —— 可被學習、可批量
把單字加進 `lib/words.ts` 的 `rawWords`，或大批用 `lib/supplemental-words.json`（會 merge 進 `words`）。兩者都是 `LegacyWord` 形態（第 0 節那個物件）。部署時 `scripts/migrate.ts` 會：
1. **Seed 缺漏的字**：比對 DB 已有的 id，只插入「不在 DB 的 seed 詞」（idempotent，每次部署都跑，不再只在空表時 seed）。
2. **每次**都跑 `generateCards` + v2 backfill（皆 idempotent，`ON CONFLICT DO NOTHING`）。

→ 因此新增單字最穩的做法是加進 seed 再部署：words / 釋義 / 例句 / 關聯 / **SRS 卡片** 都會自動建好（含日後增量新增）。

### B. Admin 後台單筆新增 `/admin/words`
用 `WordForm` 填一筆 → `POST /api/admin/words`。適合臨時加一兩個字。
> ⚠️ **限制**：`generateCards` 只針對種子清單跑，**Admin 新增的字目前不會自動產生 SRS 卡片**，所以它會出現在「單字庫 / 搜尋 / 單字頁」，但**不會進入 /study 複習佇列**。要可複習，請走 A（加進種子）或日後補一個「為單字產卡」的流程。

### C. 程式化 JSON（`POST /api/admin/words`）
Body 就是上面的單字物件（v2 Word，可帶 legacy 鏡像欄位）。受 middleware 的 admin cookie 保護。批量導入可寫一次性 script 迴圈呼叫，或直接寫 DB（仿 `lib/words-db.ts` 的 `create`）。同樣有 B 的「不自動產卡」限制。

---

## 5. 會自動生成的內容（不必手寫）

- **SRS 卡片**（`scripts/migrate.ts` 的 `generateCards`）：每個（種子）單字產生
  - `recall-zh-en`（中→英）、`recall-en-zh`（英→中）、
  - `cloze-1`（填空；當某例句包含該單字才產生）。
  學習頁的「卡片類型」篩選即依這些 `deck_key`。
- **legacy → v2 轉換**：`chinese` → zh 釋義；`relatedWords` → see-also；`confusingWords` → confusing。
- **AI 豐富化**（選用，零必填）：`同義/反義/相關詞`、`詞形變化(forms)`、`記憶撇步(note，空才補)`、`詞源(etymology)`。
  - 批量：`AI_GATEWAY_API_KEY` 設好後 `npm run enrich`（撈 `etymology IS NULL` 的字）。
  - 單筆：Admin 單字頁「AI 生成補齊」鈕（`/api/admin/words/[id]/enrich`）。

---

## 6. 驗證規則（`lib/word-validate.ts`）

`POST/PATCH /api/admin/words` 會擋下不合法資料：
- `id` 必須小寫 kebab（`^[a-z0-9-]+$`）。
- `word / chinese / category / partOfSpeech / pronunciation / imageUrl` 皆必填。
- `examples` 至少 1 筆，且每筆都要有 `en` 與 `zh`。

---

## 7. 完整範例

**最小可用（legacy 扁平，種子/Admin 皆可）**
```ts
{
  id: "spoon",
  word: "spoon",
  chinese: "湯匙",
  category: "kitchen",
  partOfSpeech: "noun",
  pronunciation: "/spuːn/",
  imageUrl: "https://.../spoon.jpg",
  examples: [{ en: "Use a spoon to eat the soup.", zh: "用湯匙喝湯。" }],
}
```

**進階（完整 v2，多語 + typed 關聯）**
```ts
{
  id: "spoon",
  word: "spoon",
  category: "kitchen",
  partOfSpeech: "noun",
  pronunciation: "/spuːn/",
  imageUrl: "https://.../spoon.jpg",
  status: "published",
  cefrLevel: "A1",
  definitions: [
    { language: "zh", definition: "湯匙", sortOrder: 0 },
    { language: "ja", definition: "スプーン", sortOrder: 1 },
  ],
  examples: [
    { en: "Use a spoon to eat the soup.", zh: "用湯匙喝湯。",
      translations: { zh: "用湯匙喝湯。", ja: "スプーンでスープを飲む。" }, sortOrder: 0 },
  ],
  collocations: ["a spoonful of"],
  tags: ["tableware"],
  relations: [
    { wordId: "knife", type: "see-also" },
    { wordId: "bowl", type: "see-also" },
  ],
  note: "spoon 與 fork、knife 一組餐具。",
}
```

---

## 8. 注意事項

- **id 不可改**：它是網址、卡片、關聯目標的鍵；改名等於換一個字。
- **圖片**：用穩定可長期存取的網址（建議自家 Supabase Storage），避免熱連結失效。
- **發音**：填音標字串即可；實際朗讀走瀏覽器 TTS（口音由設定的美/英控制），不需音檔。
- **可學習 = 要有卡片**：走種子檔（A）並部署的字會自動 seed + 產 SRS 卡片（含增量新增）；Admin 單筆新增（B/C）目前仍不產卡。
- **idempotent**：migrate 與 enrich 都可重複執行；已存在的資料用 `ON CONFLICT DO NOTHING` / 「空才補」策略，不會覆蓋既有內容。
- **快取**：公開讀取走 `unstable_cache`（tag `words`，60s revalidate）。Admin 寫入會 `revalidateTag('words')`；直接改 DB（script）則約 60s 後生效。

---

## 9. AI 生成圖的 Prompt（動詞 / 形容詞 / 副詞）

名詞多半用實物照片即可；但**動詞、形容詞、副詞**這類動作或抽象概念，用吉祥物黑貓「演出」語意的插圖最清楚。把下面的 prompt 丟給生圖模型，填入 `[WORD]`、`[中文意思]`、`[具體動作/情境描述]`，產出的圖再上傳當該字的 `imageUrl`。

> 適用：**動詞、形容詞、副詞**（名詞通常用實物照片即可）。需附上吉祥物黑貓的 reference image 以維持角色一致。

```text
Create a clean, cute educational vocabulary illustration using the same black cat character as the reference image.

Character style:

A kawaii black cartoon cat with a round soft body, large yellow eyes, small pink paw pads, white whiskers, rounded ears, cute facial expression, simple smooth outlines, soft shading, and a friendly learning-app mascot feeling.

Scene:

The black cat is clearly demonstrating the meaning of the word: [WORD].

The action or emotion should be immediately understandable without any text.

For the word “[WORD]” meaning “[中文意思]”, show the cat [具體動作/情境描述].

Example:

For “squeeze” meaning “擠壓”, show the black cat using both paws to squeeze a soft yellow lemon. The lemon is visibly squashed, juice drops are splashing out, and the cat has a cute determined expression, with one eye closed and cheeks slightly tense.

Style:

cute, modern, clean, rounded, educational flashcard style, soft pastel accents, simple white or very light background, minimal composition, high clarity, suitable for a language learning app, consistent mascot design, no text, no letters, no captions, no watermark.

Composition:

Single centered character, full body or upper body visible, clear action, enough white space around the character, simple props only, bright and friendly visual.

Negative prompt:

Do not include any text, words, letters, numbers, labels, captions, logo, watermark, complicated background, realistic cat, scary expression, extra characters, messy details.
```
