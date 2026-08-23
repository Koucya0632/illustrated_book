# Tuji 詞庫導入規範

更新日期：2026-08-24

## 1. 目的

詞庫資料服務：

- Web 公開詞庫。
- iOS Cards/Search/Word detail。
- Study queue 產卡。
- Admin 管理。

新增詞時要確保資料可被 iOS 正常顯示，也可產生學習卡。

## 2. 最小資料

```ts
{
  id: "fridge",
  word: "fridge",
  chinese: "冰箱",
  category: "kitchen",
  partOfSpeech: "noun",
  pronunciation: "/frɪdʒ/",
  imageUrl: "https://...",  // Storage 上一律是 .webp，見 §6
  examples: [
    { en: "Put the milk in the fridge.", zh: "把牛奶放進冰箱。" }
  ],
  status: "published"
}
```

要求：

- `id` 小寫 kebab-case，不能隨意改。
- `category` 必須存在。
- 至少一個例句。
- `imageUrl` 必須是 Supabase Storage `word-images` 的 URL（migrate 對非 Storage 圖會發 WARNING）。loremflickr 等外部佔位圖已全面停用。

## 3. 可選欄位

| 欄位 | 用途 |
|---|---|
| `alsoKnownAs` | 別名 |
| `collocations` | 搭配詞 |
| `relatedWords` | 相關詞 |
| `confusingWords` | 易混淆詞 |
| `note` | 人工撰寫的記憶撇步 |
| `cefrLevel` | A1-C2 |
| `audioUrl` | 自備音檔 |
| `etymology` | 人工整理的詞源 |
| `forms` | 人工整理的詞形變化 |

## 4. 導入方式

推薦：

1. 加到 seed/source data。
2. 跑 migration。
3. 讓 `generateCards` 產生 SRS cards。
4. 用 Web/iOS 檢查 Word detail 和 Study queue。

Admin 單筆新增適合臨時內容，但要確認是否已產生 cards；沒有 cards 的詞不會進入 Study。

## 5. 分類

分類由 `categories` 資料控制。新增分類時：

1. 先新增分類 definition。
2. 再新增引用該分類的詞。
3. 確認 `/api/categories` 與 iOS `CategoriesStore` 可顯示。

## 6. 圖片與 AI 生圖規範

詞庫圖片是 iOS Cards、Search、Word detail、Study 卡片的第一視覺線索。圖片要幫助辨識單字，不是裝飾圖。

### 6.1 圖片來源優先級

| 優先級 | 來源 | 使用時機 |
|---|---|---|
| 1 | 自有照片/自製圖 | 最穩定，適合核心詞 |
| 2 | 可授權照片 | 必須保留來源與授權 |
| 3 | AI 生圖 | 找不到穩定授權圖、或需要統一風格時 |
| 4 | 外部 hotlink | 不建議，只能作為暫存 |

正式 `imageUrl` 應落在 Supabase Storage：

```text
https://<project>.supabase.co/storage/v1/object/public/word-images/<id>.webp
```

**bucket 裡一律是 WebP。** 來源檔可以是 PNG/JPEG（生圖工具吐什麼都行），但所有寫入路徑都會先過 `lib/word-image-encode.ts` 轉成 1200px WebP 再上傳——admin 上傳、admin 遠端抓圖、四支批次腳本，七個寫入點共用同一個編碼器。路徑一律 `{id}.webp`。

這不是風格偏好：2026-08 這個 bucket 有 496 張平均 1.5MB 的 PNG、共 741MB，直接把專案的 egress 配額燒穿、服務被停權。重編碼後同一批內容是 20.6MB（28×）。詳見 `lib/word-image-encode.ts` 檔頭。

批量本地圖放在 `public/word-images/<id>.png`（或 .jpg/.webp）後跑上傳腳本，轉檔由腳本負責。

正式圖片以 `lib/image-urls.json` 為準（每次 prod deploy，migrate 會把它同步進 DB；Storage 圖不會被外部 URL 覆蓋）。凡是在 DB 端改了圖——admin 上傳新檔名、跑批量腳本——之後要跑 `npm run sync-image-urls` 回寫該檔並 commit，否則下次 deploy 會還原成舊值。新詞的 inline `imageUrl` 只是首次入庫的初始值。

### 6.2 AI 生圖適用範圍

可以用 AI 生圖：

- 通用物品：`spoon`、`pillow`、`traffic light`。
- 食材、調味料、工具、家具。
- 難以找到授權一致圖片的冷門詞。
- 需要保持同一批分類視覺一致時。

不應用 AI 生圖：

- 真實品牌、商標、包裝。
- 名人、真人肖像、兒童肖像。
- 醫療、危險、成人、暴力或政治敏感內容。
- 會誤導學習者的抽象概念。
- 需要精確文化/法律/安全含義的圖。

### 6.3 視覺規格

| 項目 | 規格 |
|---|---|
| 畫幅 | 1:1 正方形，建議 1024x1024 或以上 |
| 主體 | 單一清楚物件，佔畫面 70-85% |
| 背景 | 乾淨淺色或透明感背景，不要複雜場景 |
| 留白 | 四周約 12-18%，避免 iOS 卡片裁切 |
| 風格 | 寫實產品照或柔和 3D 實物感，整批保持一致 |
| 光線 | 明亮、柔和、無強烈陰影 |
| 文字 | 圖中不得出現文字、label、浮水印 |
| 人物 | 預設不出現人物；必要時只用無臉、非識別性情境 |
| 來源檔 | PNG 或 JPEG 皆可（上傳時一律轉 WebP，來源格式不影響結果） |
| 尺寸 | 產出 1024x1024 以上；上傳時會等比縮到寬邊 1200px |

Study 與 iOS 詞卡大量使用 `fit: contain`/等比例呈現。主體太小、背景太忙、邊緣被切掉，都會直接降低學習效果。

### 6.4 Prompt 模板

英文 prompt 建議：

```text
A clean educational vocabulary card image of a single {WORD}.
The object is centered, clearly recognizable, and isolated on a warm off-white background.
Soft natural lighting, realistic product photography, no text, no labels, no logo, no watermark.
Square composition, 15 percent margin around the object, suitable for a mobile language-learning app.
```

中文輔助說明可附在 prompt 後：

```text
Target meaning in Traditional Chinese: {中文意思}.
Do not show people unless the word cannot be understood without context.
Avoid brand names, packaging text, and decorative clutter.
```

情境詞範例：

```text
A clean educational vocabulary card image of a crosswalk.
Show a simple street crosswalk from a slightly elevated angle, clearly recognizable, no cars blocking it.
Warm daylight, minimal background, no readable signs, no people, no logos.
Square composition, 15 percent margin, suitable for a mobile language-learning app.
```

### 6.5 Negative prompt

```text
text, letters, label, logo, watermark, brand name, signature,
person, face, hands, messy background, dark lighting, dramatic shadows,
cropped object, multiple unrelated objects, duplicate object, surreal, cartoonish,
unsafe, violent, adult, political, medical procedure
```

如果生成器不支援 negative prompt，就把禁止項寫進主 prompt。

### 6.6 多義字必填特徵

多義字不能只把英文單字丟給模型，必須加 disambiguation。以下是目前常見風險詞：

| word | Prompt 必填特徵 |
|---|---|
| `scale` | bathroom weighing scale / digital body scale, not musical scale, not ruler |
| `coach` | long-distance coach bus, not sports coach |
| `glass` | drinking glass / tumbler, not window glass |
| `mouse` | computer mouse, not animal |
| `fan` | electric fan with blades and stand, not sports fan |
| `monitor` | computer monitor screen, not a person monitoring |
| `station` | transit station entrance or platform, not radio station |
| `sale` | discount tag or sale shelf, no readable text |
| `MRT` | metro train or rapid transit station, no letters |
| `shelf` | storage shelf, not cliff or ledge |

範例：

```text
A clean educational vocabulary card image of a computer mouse.
Show a single wireless computer mouse, centered on a warm off-white background.
Do not show an animal mouse. No logo, no brand, no text.
Square composition, 15 percent margin, suitable for a mobile language-learning app.
```

### 6.7 動詞/形容詞/副詞的吉祥物圖

動作、情緒、狀態類單字不一定適合用單一物件圖。這類詞可以用 Tuji 黑貓吉祥物演出語意，但要保持「教育插圖」而不是貼圖表情包。

適用：

- 動詞：`squeeze`、`pour`、`wipe`。
- 形容詞：`messy`、`empty`、`heavy`。
- 副詞或狀態短語：只在圖片能清楚表達時使用。

Prompt 模板：

```text
Create a clean educational vocabulary illustration using the same Tuji black cat mascot style.

Word:
{WORD}

Meaning:
{中文意思}

Scene:
The black cat is clearly demonstrating the meaning of "{WORD}".
Show the cat {具體動作/情境描述}. The action or state must be immediately understandable without any text.

Character style:
A cute black cat mascot with a round soft body, large warm eyes, small pink paw pads, white whiskers, rounded ears, simple smooth outlines, soft shading, friendly language-learning app feeling.

Style:
clean modern educational flashcard illustration, soft pastel accents, white or very light background, minimal props, clear silhouette, no text, no labels, no logo, no watermark.

Composition:
single centered character, clear action, enough white space, square image, 15 percent margin.
```

範例：

```text
Create a clean educational vocabulary illustration using the same Tuji black cat mascot style.
Word: squeeze
Meaning: 擠壓
Scene: The black cat uses both paws to squeeze a soft yellow lemon. The lemon is visibly squashed, a few juice drops splash out, and the cat has a cute determined expression.
No text, no labels, no logo, no watermark. Square image, warm off-white background, 15 percent margin.
```

限制：

- 不要讓吉祥物替代可直接拍清楚的名詞。`spoon` 應該是湯匙，不是貓拿湯匙。
- 不要出現多隻角色或複雜故事。
- 不要把字母或單字寫在畫面裡。

### 6.8 審核清單

AI 圖進詞庫前必須人工檢查：

- [ ] 一眼能看出目標單字。
- [ ] 沒有文字、logo、商標、浮水印。
- [ ] 沒有真人可識別特徵。
- [ ] 沒有不當、安全或審核敏感內容。
- [ ] 圖片不會讓學習者誤解詞義。
- [ ] 在 iOS 小卡、詳情大圖、Study 卡片中都不被裁切。
- [ ] 已上傳到 `word-images` bucket，`imageUrl` 使用 Storage public URL。
- [ ] 如果保留來源欄位，`image_license` 可標為 `ai-generated`，`image_credit` 記錄模型/日期/批次。

### 6.9 命名、上傳與落庫

建議文件命名（來源檔，副檔名不拘）：

```text
public/word-images/<id>.png
```

例：

```text
public/word-images/soy-sauce.png
public/word-images/traffic-light.png
```

上傳後在 Storage 上會變成 `soy-sauce.webp`、`traffic-light.webp`。

上傳流程：

```bash
cd tuji-web

# dry run，先看會上傳哪些檔案
npx tsx scripts/upload-local-images.ts

# 確認後上傳到 Supabase Storage 並更新 DB image_url
npx tsx scripts/upload-local-images.ts --apply
```

落庫規則：

- `words.image_url`：Supabase Storage public URL，副檔名一定是 `.webp`。
- `words.image_source_url`：若是 AI 圖，可留空或記錄內部生成批次。
- `words.image_license`：建議填 `ai-generated`。
- `words.image_credit`：建議填模型名稱、生成日期、人工審核者。

## 7. 驗證

```bash
npm run build
npm run verify:atlas
```

手工檢查：

- `/api/words`
- `/api/words/:id`
- Web word page。
- iOS Cards/Search/Word detail。
- Study queue 是否出現對應 cards。
- AI 生圖是否符合第 6 節規範。
