// 情境故事's wire contract and request handler — /api/assistant/story.
//
// GET offers the places, situations and difficulties (labelled in the
// interface language) beside the price range and the balance. POST writes one
// story around one to three picked items. The paid-step rules are `../paid`'s;
// what is added here is that a story which leaves out a picked item is not a
// story the person asked for, so it is recorded and not charged.

import { z } from "zod";
import { AssistantError } from "../contracts";
import { createPaidHandler, type PaidDependencies } from "../paid";
import { STORY_PRICING, usagePoints } from "../pricing";
import { STORY_LEVELS, findLevel } from "./levels";
import { missingWords, type StoryModelReply, type StoryModelRequest, type StoryWord } from "./model";
import { STORY_SCENES, findScene, type StoryUiLanguage } from "./scenes";

export const STORY_MAX_BODY_BYTES = 2048;
export const STORY_MAX_WORDS = 3;

const uiLanguage = z.enum(["zh-Hant", "zh-Hans", "ja", "en"]);
const learningDirection = z.enum(["zh-en", "zh-ja"]);
const ATLAS_ID = /^atlas:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A picked item: a catalogue id, or `atlas:<uuid>` for one of the person's own
 * cards. 物見 cards (`saved:`) belong to someone else and are not offered.
 */
const wordId = z.string().min(1).max(120).refine(id => {
  if (id.startsWith("saved:")) return false;
  return id.startsWith("atlas:") ? ATLAS_ID.test(id) : !id.includes(":");
});

export const storyInput = z.object({
  /** Client-generated. A resend under the same id is charged once. */
  requestId: z.string().uuid().transform(value => value.toLowerCase()),
  uiLanguage,
  learningDirection,
  wordIds: z.array(wordId).min(1).max(STORY_MAX_WORDS)
    .refine(ids => new Set(ids).size === ids.length),
  sceneId: z.string().max(40),
  situationId: z.string().max(40),
  levelId: z.string().max(40),
}).strict().refine(input => findScene(input.sceneId, input.situationId) && findLevel(input.levelId));
export type StoryInput = z.infer<typeof storyInput>;

export interface StoryDependencies extends PaidDependencies {
  /** The picked items, read from the catalogue and the person's own atlas. Unknown ids are left out. */
  loadWords: (input: Pick<StoryInput, "wordIds" | "uiLanguage" | "learningDirection">, userId: string) => Promise<StoryWord[]>;
  write: (request: StoryModelRequest) => Promise<StoryModelReply>;
}

/** The choices, labelled for one interface language. */
export function storyChoices(lang: StoryUiLanguage) {
  return {
    scenes: STORY_SCENES.map(scene => ({
      id: scene.id,
      label: scene.label[lang],
      situations: scene.situations.map(s => ({ id: s.id, label: s.label[lang] })),
    })),
    levels: STORY_LEVELS.map(level => ({ id: level.id, label: level.label[lang], hint: level.hint[lang] })),
  };
}

export function createStoryHandler(deps: StoryDependencies) {
  const handle = createPaidHandler<StoryInput>(deps, {
    feature: "story",
    pricingVersion: STORY_PRICING.version,
    pricing: { minPoints: STORY_PRICING.minPoints, maxPoints: STORY_PRICING.maxPoints },
    maxBodyBytes: STORY_MAX_BODY_BYTES,
    parse: raw => {
      const parsed = storyInput.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    chargeKey: requestId => `assistant-story:${requestId}`,
    offer: request => {
      const lang = uiLanguage.safeParse(new URL(request.url).searchParams.get("uiLanguage"));
      return storyChoices(lang.success ? lang.data : "zh-Hant");
    },
    produce: async (body, userId) => {
      const words = await deps.loadWords(body, userId);
      // Every id must resolve: a missing one is someone else's card, a deleted
      // one, or one from the other learning direction. Nothing has run yet.
      if (words.length !== body.wordIds.length) throw new AssistantError("invalid_assistant_request");
      const { scene, situation } = findScene(body.sceneId, body.situationId)!;
      const reply = await deps.write({
        uiLanguage: body.uiLanguage, learningDirection: body.learningDirection,
        words, scene, situation, level: findLevel(body.levelId)!,
      });
      if (missingWords(reply.story, words).length) return { usage: reply.usage, failed: "assistant_unavailable" };
      return {
        usage: reply.usage,
        billable: true,
        points: usagePoints(reply.usage, STORY_PRICING),
        body: { story: reply.story },
      };
    },
  });
  return (request: Request, action: "offer" | "write") => handle(request, action === "write" ? "run" : "offer");
}
