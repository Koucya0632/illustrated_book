// How a 助手 step lays its system prompt out for the provider's cache.
//
// A step's rules are the same on every call, so they are sent as cached blocks:
// a cache read costs 0.1x of input where a fresh send costs 1x, and the 1.25x
// write is already paid back by the second call that shares the prefix. The
// rules every mode shares go in the first block and the mode's own rules in the
// next, so one entry serves every mode of a step rather than one entry per mode.
//
// Caching is a prefix match, so nothing in these blocks may vary per request —
// what varies belongs in the user message. A block shorter than the model's
// minimum cacheable prefix (512 tokens on Claude Haiku 5.5) silently does not
// cache, which costs nothing: the next breakpoint still covers the whole prefix.

import type Anthropic from "@anthropic-ai/sdk";

/**
 * `parts` in prompt order, each one a cache breakpoint. They are joined by the
 * same blank line a single prompt string used, so splitting a prompt here does
 * not change a byte of what the model reads.
 */
export function cachedSystem(...parts: string[]): Anthropic.TextBlockParam[] {
  return parts.map((text, index) => ({
    type: "text",
    text: index === parts.length - 1 ? text : `${text}\n\n`,
    cache_control: { type: "ephemeral" },
  }));
}
