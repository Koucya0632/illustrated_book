import { createHash } from "node:crypto";
import sharp from "sharp";
import { encodeWordImage } from "./word-image-encode";

const CANDIDATE_PATTERN = /^([a-z0-9-]+)-v2\.webp$/;

export type PreparedMainWordImageCandidate = {
  id: string;
  bytes: Buffer;
  sha256: string;
};

/**
 * Accept only reviewed, project-bound WebP candidates. The content hash is
 * calculated from the exact normalized WebP bytes that will be uploaded, so
 * the immutable object name addresses the stored file rather than a PNG
 * precursor or another intermediate representation.
 */
export async function prepareMainWordImageCandidate(
  filename: string,
  input: Buffer,
): Promise<PreparedMainWordImageCandidate> {
  const match = CANDIDATE_PATTERN.exec(filename);
  if (!match) throw new Error(`${filename}: expected <word-id>-v2.webp`);

  const source = await sharp(input, { failOn: "error" }).metadata();
  if (source.format !== "webp") throw new Error(`${filename}: candidate bytes are not WebP`);

  const bytes = await encodeWordImage(input);
  const normalized = await sharp(bytes, { failOn: "error" }).metadata();
  if (normalized.format !== "webp") throw new Error(`${filename}: normalized bytes are not WebP`);

  return {
    id: match[1],
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
