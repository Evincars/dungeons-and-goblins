import { ValidationError } from './errors';

/**
 * Gzip for what travels between browsers (world updates, maps): the browser's own CompressionStream, so
 * nothing extra is downloaded. Unpacking stops at a size limit, so a hostile packet can't blow up in memory.
 */

/** Text (usually JSON) gzipped. */
export async function gzipText(text: string): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([text]).stream()
    .pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}

/** Gunzips and parses JSON, refusing anything that unpacks past `limit` bytes; `what` names it in the error. */
export async function gunzipJson(input: ArrayBuffer | Uint8Array, limit: number, what: string): Promise<unknown> {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : Uint8Array.from(input);
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ValidationError(`${what} exceeds size limit`, { limit });
    }
    chunks.push(Uint8Array.from(chunk.value).buffer);
  }
  return JSON.parse(await new Blob(chunks).text());
}
