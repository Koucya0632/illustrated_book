import { UploadError } from "./uploads";

/** Bound chunked bodies too; content-length is only an early rejection hint. */
export async function uploadFormData(request: Request, maxBytes = 9 * 1024 * 1024) {
  if (Number(request.headers.get("content-length")) > maxBytes || !request.body) throw new UploadError("invalid_upload");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new UploadError("invalid_upload"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
  } catch { throw new UploadError("invalid_upload"); }
}
