/** Proposed Australia-only topic and assignment, held until independent
 * review. It is written alongside all six rental words in one transaction. */
export const AUSTRALIAN_HOUSING_CATEGORY = {
  id: "australia-housing",
  name: "Housing and Shared Rentals",
  nameZh: "租屋與合租",
  nameJa: "賃貸・シェアハウス",
  emoji: "🏠",
  description: "認識租屋、合租及入住時常見的詞彙。",
  descriptionEn: "Learn common words for renting and sharing a home.",
  descriptionJa: "住まいを借りたりシェアしたりするときの言葉。",
  color: "from-amber-100 to-orange-100",
  /** The reviewed share-house word image is reused as the proposed cover. */
  imageOwner: "share-house",
} as const;
export const AUSTRALIAN_CATEGORY_ASSIGNMENTS: Record<string, string> = {
  "share-house": "australia-housing", "view-a-room": "australia-housing", "bills-included": "australia-housing",
  "rental-bond": "australia-housing", "condition-report": "australia-housing", "tenancy-agreement": "australia-housing",
  availability: "office", "casual-employee": "office", "trial-shift": "office", roster: "office",
  "shift-handover": "office", "pay-slip": "office", "payment-terminal": "restaurant",
  "tax-file-number": "identity-documents", superannuation: "bank", orientation: "campus",
  "student-services-desk": "campus", "student-portal": "campus", "proof-of-enrolment": "campus",
};
