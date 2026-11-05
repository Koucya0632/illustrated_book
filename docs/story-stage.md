# Optional supermarket presentation

The existing story endpoint can return `stage?: { areaId?: string; moiraAction?: string }` on each segment. Opening/done event kinds, required story content, request IDs and payment rules are unchanged. No migration is needed.

Only supermarket generation requests the extra model fields; other places retain their original response schema. The same model call writes the story and the cues. Supermarket generation explicitly disables extra thinking before the opening, preserving responsive streaming and limiting annotation overhead. The stable supermarket guide is a separately cached system block.

Presentation metadata is parsed separately from required content. Only declared area/action IDs are forwarded, with each field checked independently. Non-object, unknown or missing cues are discarded without dropping a valid sentence. This same normalization runs on chunked streamed segments and the final story. Older clients ignore the additive field; newer clients can render old replies with generic artwork.

Scene IDs: general / entrance / produce / checkout. Dairy, freezer, ordinary shelf and stock-room scenes are general. Do not force a scene route or place an ending at checkout merely because it is an ending. Pose IDs: greet / listen / think / confused / surprised / point / nod / goodbye / hold_apple / carry_bag. Prop poses require Moira actually performing that action, not the person doing it or dialogue mentioning the object. Clients resolve any unsupported hint to generic art; they do not inspect multilingual text.

The language prompt has no fixed-language title/intro examples. Interface text is normalized to Simplified Chinese when requested, consistently in opening, narration, translations and final content. Model semantic annotations remain best effort and are checked with generated scenario samples in addition to deterministic contract tests.

Validation: `npx tsx --test tests/assistant-story.test.ts`, `npx tsc --noEmit`, `npm test`, `npm run test:credits:integration`, `npx next build`. Real samples cover four UI languages, two learning languages and the three existing situations, with varied picked words and difficulty. Review unsupported locations, actor/prop matching, area changes and language separation before release.
