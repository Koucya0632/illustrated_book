export interface CreditCandidate { id: string; label: string; zhHant: string; gloss: string | null; level: string }
export interface CreditOperation {
  id: string; state: string; feature: string; targetLanguage: "en" | "ja"; points: number;
  imageId: string; confirmedItemId: string | null; fulfillmentState: string; failureCode: string | null;
  result: { candidates: CreditCandidate[] } | null;
}
export interface CreditCatalog {
  billingMode: string; environment: string; purchaseEnabled: boolean; proNewPurchaseEnabled: boolean;
  operationsEnabled: boolean; monthlyEnabled: boolean; checkInEnabled: boolean;
}
/** A pause/auth failure says nothing about whether an earlier request committed. */
export const acceptanceRejected = (code: string) => ["quote_expired", "quote_not_found", "invalid_ai_request",
  "invalid_credit_request", "insufficient_credits", "capacity_full", "image_changed", "image_not_found",
  "operation_busy", "idempotency_conflict", "credits_reconciliation_required"].includes(code);
export const creditErrorMessage = (code: string) => ({
  insufficient_credits: "罐頭點數不足，請簽到取得贈點或加購。",
  capacity_full: "自製圖鑑容量已滿，請先整理卡片。",
  quote_expired: "報價已到期，請重新取得報價。",
  credits_reconciliation_required: "退款點數正在核對中，暫時無法新增 AI 工作。",
  credits_disabled: "罐頭點數功能暫停中，請稍後再試。",
  credits_unavailable: "暫時無法連線，請重試同步。",
  upload_limit: "未完成照片已達上限，請先完成或整理照片。",
  upload_busy: "這張照片正在上傳，請稍後再試。",
  operation_busy: "這張照片已有工作進行中，請先查看處理結果。",
  benefit_disabled: "這項贈點目前尚未開放。",
  benefit_ineligible: "這項功能需要有效永久會員。",
  check_in_requires_study: "今天學習一題後就能領取打卡點數。",
  unauthorized: "請重新登入。",
  invalid_upload: "請選擇 8 MB 以內的有效圖片。",
}[code] ?? "暫時無法完成，請重試同步。");
