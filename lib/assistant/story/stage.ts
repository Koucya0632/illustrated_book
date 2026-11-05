/** Optional presentation hints. Story content never depends on their validity. */
const COMMON_ACTIONS = [
  "greet", "listen", "think", "confused", "surprised", "point", "nod", "goodbye",
] as const;

/** Asset IDs are scoped to a place; an unrelated place's cue is never forwarded. */
export const STORY_STAGES = {
  supermarket: {
    areas: ["general", "entrance", "produce", "checkout"],
    props: ["hold_apple", "carry_bag"],
    areasGuide: "entrance = actually at the store doors; produce = actually at a fruit/vegetable display; checkout = actually at the payment counter or its queue. Ordinary shelves, dairy, freezers, stock rooms and restocking milk are general. An ending or finished work is not evidence of checkout.",
    propsGuide: "hold_apple = Moira herself currently holding an apple; carry_bag = Moira herself currently carrying a grocery bag.",
  },
  office: {
    areas: ["general", "desk", "meeting", "breakroom"],
    props: ["read_document", "use_laptop"],
    areasGuide: "desk = actually at a workspace/desk; meeting = actually in a meeting room; breakroom = actually in the staff break room/kitchenette. Corridors, reception, unsupported rooms and uncertain locations are general. Discussing a meeting does not put them in the meeting room.",
    propsGuide: "read_document = Moira herself currently holding and reading a paper document; use_laptop = Moira herself currently using a laptop. Merely discussing a report, email or computer is insufficient.",
  },
  restaurant: {
    areas: ["general", "entrance", "dining", "checkout"],
    props: ["read_menu", "hold_cup"],
    areasGuide: "entrance = actually at the restaurant entrance/host stand; dining = actually at a dining table; checkout = actually at the register/payment counter. Kitchens, stock rooms and uncertain locations are general. Paying at a dining table stays dining; the ending alone does not mean checkout.",
    propsGuide: "read_menu = Moira herself currently holding and reading a menu; hold_cup = Moira herself currently holding a cup. Ordering food or a drink alone is insufficient; a plate, glass or bottle is not the cup sprite.",
  },
  station: {
    areas: ["general", "concourse", "gate", "platform"],
    props: ["hold_ticket", "check_map"],
    areasGuide: "concourse = actually in the central station hall/ticket machine area; gate = actually at the ticket gates; platform = actually on the platform. Trains, station offices, outside streets, unsupported areas and uncertain locations are general. Discussing a train or platform does not mean arriving there.",
    propsGuide: "hold_ticket = Moira herself currently holding a paper train ticket; check_map = Moira herself currently holding and consulting a paper route map. Looking at a wall sign, a phone, or the person's ticket is insufficient.",
  },
  home: {
    areas: ["general", "living", "kitchen", "bedroom"],
    props: ["read_book", "hold_cup"],
    areasGuide: "living = actually in the living room; kitchen = actually in the kitchen; bedroom = actually in the bedroom. Entry halls, bathrooms, balconies, unsupported rooms and uncertain locations are general. Talking about food, sleeping or a book does not by itself determine the room.",
    propsGuide: "read_book = Moira herself currently holding and reading a book; hold_cup = Moira herself currently holding a cup. A book on a shelf or a cup on a table is insufficient.",
  },
} as const;

function stageFor(sceneId: string) {
  return Object.hasOwn(STORY_STAGES, sceneId) ? STORY_STAGES[sceneId as keyof typeof STORY_STAGES] : undefined;
}

export function storyStageOptions(sceneId: string) {
  const stage = stageFor(sceneId);
  return stage ? { areas: stage.areas, actions: [...COMMON_ACTIONS, ...stage.props] } : undefined;
}

export interface StoryStageCue {
  areaId?: string;
  moiraAction?: string;
}

export function storyStageCue(raw: unknown, sceneId: string): StoryStageCue | undefined {
  const stage = stageFor(sceneId);
  if (!stage || !raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const cue = raw as Record<string, unknown>;
  const areaId = typeof cue.areaId === "string" && stage.areas.some(id => id === cue.areaId) ? cue.areaId : undefined;
  const moiraAction = typeof cue.moiraAction === "string" && [...COMMON_ACTIONS, ...stage.props].some(id => id === cue.moiraAction)
    ? cue.moiraAction : undefined;
  return areaId || moiraAction ? { ...(areaId ? { areaId } : {}), ...(moiraAction ? { moiraAction } : {}) } : undefined;
}

/** Proof stays inside the model reply, never in the public segment contract.
 * A prop must be established by the current narration before spoken lines can
 * continue it. A later narration without that proof clears it conservatively.
 * No multilingual keyword matching is used to interpret story content.
 */
export function createStoryStageResolver(sceneId: string) {
  let area: string | undefined;
  let prop: string | undefined;
  return (raw: unknown, speaker: string, text: string): StoryStageCue | undefined => {
    const cue = storyStageCue(raw, sceneId);
    const stage = stageFor(sceneId);
    const action = cue?.moiraAction;
    const isProp = stage?.props.some(id => id === action) ?? false;
    if (speaker === "narrator") {
      const evidence = raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>).propEvidence : undefined;
      prop = isProp && typeof evidence === "string" && evidence.length >= 8
        && evidence.includes("Moira") && text.includes(evidence) ? action : undefined;
    }
    if (!cue) {
      area = "general";
      return;
    }
    // A spoken suggestion cannot transport the actors to a different area.
    // The first line may establish a setting already described by the intro.
    if (cue.areaId) {
      if (!area || speaker === "narrator") area = cue.areaId;
      else cue.areaId = area;
    } else {
      area = "general";
    }
    if (isProp && prop !== action) delete cue.moiraAction;
    return Object.keys(cue).length ? cue : undefined;
  };
}

export function storyStageGuide(sceneId: string): string | undefined {
  const stage = stageFor(sceneId);
  if (!stage) return;
  return `Presentation hints for ${sceneId}:
- Write the story naturally first. Never force a route, a prop, an action or a purchase to fit the artwork.
- Moira is the same black cat with golden eyes, a white chest tuft and white paw tips, never a human with hair. Keep her cat identity in narration without forcing the story's activities.
- For EVERY segment, stage describes the current complete visual state: areaId and moiraAction.
- areaId must be one of ${stage.areas.join(", ")}. Maintain the current area through conversation until the story actually moves. A suggestion or future plan to go somewhere does NOT move the scene yet; use the destination only when they actually arrive. Use general for unsupported or uncertain locations. Do not force the story through all available areas.
- Area meanings are literal: ${stage.areasGuide}
- Areas describe the physical surroundings, never the type of object mentioned or picked up. In particular, picking up a bag of frozen vegetables in front of a freezer stays general, NOT produce. Produce requires an actual fresh fruit/vegetable display; a vegetable package or a discussion of fruit does not establish that location.
- Resolve the location from where Moira and the person ARE, not from any location mentioned in passing. A noise from the hallway while they work at a desk stays desk. Standing up at a desk stays desk. A character saying "Let's go to X" stays in the previous area; change only on a narration establishing arrival at X (or a spoken line clearly saying they are already there). Walking toward X without arriving uses the previous area, or general while explicitly in an unsupported corridor/stairs. Never anticipate the next segment's location.
- moiraAction describes MOIRA, even when the person is speaking. Choose greet, listen, think, confused, surprised, point, nod or goodbye to suit her behavior. Use listen for listening and think when uncertain. Never act out the person's actions with Moira.
- The only prop actions available here are ${stage.props.join(", ")}: ${stage.propsGuide} Use them ONLY when the story explicitly establishes Moira herself currently performing that action. Mere mention, intention, seeing, wanting or buying an object, or the person holding it, is insufficient. Stop the prop pose when she puts it down. Otherwise use a common gesture without props.
- Prop examples: "You hold an apple" -> listen, NOT hold_apple. "We put apples in the bag" -> nod, NOT hold_apple or carry_bag. "Moira puts her apple in the bag" -> nod, NOT hold_apple. "Moira carries her shopping bag" -> carry_bag. "The waiter gives us menus" or "Let's look at the menu" -> think, NOT read_menu until Moira is explicitly reading a menu she holds. A map lying open on a counter is NOT check_map; Moira must hold the paper map. Use a common gesture whenever unsure. Do not invent an action or change the text to justify a prop.
- propEvidence is internal verification, never story text: for a prop action on a narrator segment, quote the exact COMPLETE clause from that segment's text that explicitly names Moira and establishes her currently holding/using that prop. Do not quote an intention, a put-down, unrelated text, or a group action. If there is no such clause use an empty string and a common gesture. On spoken segments use an empty string; a prop can continue only if a previous narration established it and no later narration cleared it. Never add narration just to justify an artwork choice.
- Change areaId only on narration establishing actual arrival. Spoken lines maintain the preceding area; a spoken suggestion to go somewhere must never change it. The first segment may establish the location described in the intro.
- Complete both stage fields on EVERY line, including cat and you lines. Never use null, empty strings, localized labels, or IDs outside the lists above. Repeating an unchanged area is required; the client does not infer it from earlier lines.
- These are optional display hints, not instructions to change the story. Do not mention them in the story text.`;
}
