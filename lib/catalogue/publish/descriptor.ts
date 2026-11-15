import { findRelease } from "../releases";

/** Where one release's reviewed inputs and working files live. Every path is
 * relative to the repository root. */
export type ReleasePublishDescriptor = {
  /** Registry id, `<series>-<yyyy>-<mm>`. */
  release: string;
  /** The topic the release opens; also the words' primary topic. */
  series: string;
  files: {
    candidates: string;
    /** The canonical image per word id (lib/image-urls.json). */
    canonicalImages: string;
    authoredSemanticReview: string;
    authoredVisualReview: string;
    imagePrompts: string;
    spans: string;
    images: string;
    visualReview: string;
    semanticReview: string;
    audioPlan: string;
    audio: string;
    audioVerification: string;
    audioFrameVerification: string;
  };
  /** Directory the publish plan and its apply manifests are written to. */
  prepDirectory: string;
  /** Directory the candidate audio clips are generated into. */
  audioDirectory: string;
};

/** The file layout every release since 2026-10 has used, derived from its id. */
export function conventionalDescriptor(release: string, series: string): ReleasePublishDescriptor {
  const period = release.slice(series.length + 1);
  if (!release.startsWith(`${series}-`) || !/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`${release}: a shared-publisher release id must be <topic>-<yyyy>-<mm>`);
  }
  const prep = `output/${series}-publish-prep`;
  const audio = `output/${series}-audio-candidates`;
  return {
    release,
    series,
    files: {
      candidates: `data/${series}-series-${period}.json`,
      canonicalImages: "lib/image-urls.json",
      authoredSemanticReview: `data/${series}-semantic-review-${period}.json`,
      authoredVisualReview: `data/${series}-visual-review-${period}.json`,
      imagePrompts: `data/${series}-image-prompts-${period}.json`,
      spans: `data/example-spans-${release}.json`,
      images: `${prep}/image-manifest.json`,
      visualReview: `${prep}/visual-review.json`,
      semanticReview: `${prep}/semantic-review.json`,
      audioPlan: `output/${series}-audio-plan/manifest.json`,
      audio: `${audio}/generated-manifest.json`,
      audioVerification: `${audio}/verification-report.json`,
      audioFrameVerification: `${audio}/mp3-frames-report.json`,
    },
    prepDirectory: prep,
    audioDirectory: audio,
  };
}

/** The descriptor for a registered release that opted into the shared
 * publisher. Releases with their own frozen publisher are refused. */
export function publishDescriptor(releaseId: string): ReleasePublishDescriptor {
  const release = findRelease(releaseId);
  if (release.kind !== "guarded" || release.publisher !== "shared") {
    throw new Error(
      `${releaseId}: not a shared-publisher release (it has its own frozen publisher script)`,
    );
  }
  if (release.expandsLiveTopic) {
    throw new Error(`${releaseId}: the shared publisher opens a new topic; it cannot expand a live one`);
  }
  return conventionalDescriptor(release.id, release.category);
}
