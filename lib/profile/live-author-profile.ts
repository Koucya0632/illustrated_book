import "server-only";
import {
  getAtlasAuthor,
  listAtlasAuthorCollections,
  listAtlasAuthorItems,
} from "@/lib/atlas-db";
import {
  serializeAtlasPublicCollectionCard,
  serializeAtlasPublicItem,
} from "@/lib/atlas/public-serialize";
import { createAuthorProfileModule } from "./author-profile";

export const authorProfile = createAuthorProfileModule({
  findAuthor: getAtlasAuthor,
  async listItems(userId) {
    return (await listAtlasAuthorItems(userId)).map(serializeAtlasPublicItem);
  },
  async listCollections(userId) {
    return (await listAtlasAuthorCollections(userId)).map(serializeAtlasPublicCollectionCard);
  },
});
