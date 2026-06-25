"use client";

export function speak(text: string, lang = "en-US", rate = 0.95) {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = rate;
  const voices = synth.getVoices();
  const preferred =
    voices.find((v) => v.lang === lang && /female|samantha|google/i.test(v.name)) ||
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang.startsWith(lang.split("-")[0]));
  if (preferred) utter.voice = preferred;
  synth.speak(utter);
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// The currently-playing pre-generated clip, kept module-level so a new tap
// can stop the previous one instead of overlapping.
let currentAudio: HTMLAudioElement | null = null;

/**
 * Play a pre-generated pronunciation clip (Chirp 3 HD, served from our CDN),
 * falling back to on-device speech synthesis when no URL is available or the
 * clip fails to load/play. `lang`/`rate` are only used for the fallback.
 */
export function playClip(url: string | undefined, fallbackText: string, lang = "en-US", rate = 0.95) {
  if (typeof window === "undefined") return;
  if (!url) {
    speak(fallbackText, lang, rate);
    return;
  }
  // Stop any in-flight speech or clip first.
  window.speechSynthesis?.cancel();
  if (currentAudio) currentAudio.pause();

  const audio = new Audio(url);
  currentAudio = audio;
  // Fall back to synthesis on a network/decode error or a rejected play()
  // (e.g. the clip 404s before it has been generated). Guarded so the two
  // error paths don't both fire.
  let fellBack = false;
  const fallback = () => {
    if (fellBack) return;
    fellBack = true;
    speak(fallbackText, lang, rate);
  };
  audio.addEventListener("error", fallback);
  audio.play().catch(fallback);
}
