import "server-only";
import {
  countAtlasCollectionSaves,
  getAtlasCollectionLearningState,
  getPublicAtlasCollection,
  isAtlasPublicCollectionSaved,
  learnAtlasPublicCollectionItemsAtomically,
  saveAtlasPublicCollection,
  unsaveAtlasPublicCollection,
} from "../atlas-db";
import { atlasLimitsForTier, getAtlasTier } from "./entitlement";
import { hitRateLimit } from "../ratelimit";
import { createPublicCollectionModule } from "./public-collection";

export const livePublicCollectionModule = createPublicCollectionModule({
  persistence: {
    findApprovedBySlug: getPublicAtlasCollection,
    isBookmarked: isAtlasPublicCollectionSaved,
    saveBookmark: saveAtlasPublicCollection,
    removeBookmark: unsaveAtlasPublicCollection,
    bookmarkCount: countAtlasCollectionSaves,
    learningState: getAtlasCollectionLearningState,
    learnRemainingAtomically: learnAtlasPublicCollectionItemsAtomically,
  },
  rateLimiter: {
    hit: hitRateLimit,
  },
  capacity: {
    async savedItemsLimit(userId) {
      return atlasLimitsForTier(await getAtlasTier(userId)).savedItemsLimit;
    },
  },
});
