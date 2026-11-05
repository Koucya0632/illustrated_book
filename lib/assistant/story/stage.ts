/** Optional presentation hints. Story content never depends on their validity. */
export const STORY_AREAS = ["general", "entrance", "produce", "checkout"] as const;
export const MOIRA_ACTIONS = [
  "greet", "listen", "think", "confused", "surprised", "point", "nod", "goodbye", "hold_apple", "carry_bag",
] as const;

export interface StoryStageCue {
  areaId?: string;
  moiraAction?: string;
}

export function storyStageCue(raw: unknown, sceneId: string): StoryStageCue | undefined {
  if (sceneId !== "supermarket" || !raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const cue = raw as Record<string, unknown>;
  const areaId = typeof cue.areaId === "string" && STORY_AREAS.some(id => id === cue.areaId) ? cue.areaId : undefined;
  const moiraAction = typeof cue.moiraAction === "string" && MOIRA_ACTIONS.some(id => id === cue.moiraAction)
    ? cue.moiraAction : undefined;
  return areaId || moiraAction ? { ...(areaId ? { areaId } : {}), ...(moiraAction ? { moiraAction } : {}) } : undefined;
}

export const STAGE_GUIDE = `Presentation hints for the supermarket only:
- Write the story naturally first. Never force a route, a prop, an action or a purchase to fit the artwork.
- For EVERY segment, stage describes the current complete visual state: areaId and moiraAction.
- areaId is general, entrance, produce or checkout. Maintain the current area through conversation until the story actually moves. A suggestion or future plan to go somewhere does NOT move the scene yet; use the destination only when they actually arrive. Use general for unsupported areas such as dairy or frozen foods, or when the location is uncertain. Do not force the story through all available areas.
- Area meanings are literal: entrance = the store doors; produce = a fruit/vegetable display; checkout = actually at the payment counter or its queue. Ordinary shelves, back rooms, restocking milk, dairy coolers and freezers are ALL general, never produce. A story ending or work being finished is NOT evidence of being at checkout. When a line says only "shelves", use general rather than inventing fruit. For example, Moira carrying a carton of milk to a shelf stays general; looking at apples at the fruit display is produce.
- moiraAction describes MOIRA, even when the person is speaking. Choose greet, listen, think, confused, surprised, point, nod or goodbye to suit her behavior. Use listen for listening and think when uncertain. Never act out the person's actions with Moira.
- hold_apple is allowed ONLY when the story explicitly establishes that Moira herself is currently holding an apple; merely mentioning, seeing, wanting or buying apples is insufficient. carry_bag is allowed ONLY when Moira herself is carrying a grocery bag. Otherwise use a general gesture without props.
- These are optional display hints, not instructions to change the story. Do not mention them in the story text.`;
