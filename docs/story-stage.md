# Optional story presentation for all current places

The existing story endpoint can return `stage?: { areaId?: string; moiraAction?: string }` on each segment. Opening/done event kinds, required story content, request IDs and payment rules are unchanged. No migration is needed.

All five current places request the extra model fields in the same story call. Each place has its own allowed area and prop IDs in `STORY_STAGES`; the generated schema requires complete snapshots using those IDs. The public fields remain optional and are normalized lossily, so old replies and bad presentation metadata still keep their sentences. Generation disables extra thinking before the opening, preserving responsive streaming. Each stable place guide is a separately cached system block. Unsupported future places retain the base response schema until their artwork is bundled.

Presentation metadata is parsed separately from required content. Only declared area/action IDs are forwarded, with each field checked independently. Non-object, unknown or missing cues are discarded without dropping a valid sentence. This same normalization runs on chunked streamed segments and the final story. Older clients ignore the additive field; newer clients can render old replies with generic artwork.

| Place | Areas | Extra Moira actions |
| --- | --- | --- |
| supermarket | general, entrance, produce, checkout | hold_apple, carry_bag |
| office | general, desk, meeting, breakroom | read_document, use_laptop |
| restaurant | general, entrance, dining, checkout | read_menu, hold_cup |
| station | general, concourse, gate, platform | hold_ticket, check_map |
| home | general, living, kitchen, bedroom | read_book, hold_cup |

Every place also supports greet / listen / think / confused / surprised / point / nod / goodbye. Areas and props cannot leak between unrelated places. `general` represents unsupported or uncertain locations. Dairy shelves, freezers and stock rooms remain general; restaurant kitchens and train interiors also remain general. Talking about another room, hearing noise from a corridor, standing up, or suggesting a move does not establish arrival. No fixed route is imposed. Prop poses require Moira actually performing the action; mentioning an object, the person holding it, a future intention, or putting it away is insufficient. Clients resolve unsupported hints to generic art without inspecting multilingual story text.

The language prompt has no fixed-language title/intro examples. Interface text is normalized to Simplified Chinese when requested, consistently in opening, narration, translations and final content. Model semantic annotations remain best effort and are checked with generated scenario samples in addition to deterministic contract tests.

The provider's requested schema is stricter than response acceptance: the SDK parser validates required story fields while accepting arbitrary optional stage metadata, which is then resolved separately. A provider returning an unknown action can therefore never reject an otherwise valid completed story. Tests exercise this SDK parsing boundary as well as the streamed scanner. Narration and speech have separate generation schema branches; a model-only `narrationLanguage` anchor immediately precedes narration text and is stripped from the public reply.

Validation: `npx tsx --test tests/assistant-story.test.ts`, `npx tsc --noEmit`, `npm test`, `npm run test:credits:integration`, `npx next build`. Real samples cover all five places, four UI languages, two learning languages and the three existing situations (120 stories), with varied picked words and difficulty. Review unsupported locations, actor/prop matching, area changes and language separation before release.


The model-only `propEvidence` field quotes the current narration before selecting a prop action. The backend checks that the quote is verbatim, names Moira, and belongs to that narration. Spoken lines may continue only an already established prop; the next narration clears it unless it supplies fresh evidence. The quote is stripped before streaming or returning a segment, preserving the public two-field stage shape. This is a conservative display guard, not natural-language verification. The same stateful resolver processes streamed and final segments in order; spoken suggestions cannot change the established area. Unknown or missing area hints still fall back to general.
