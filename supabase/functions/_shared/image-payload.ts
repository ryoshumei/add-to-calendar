// Guards the image an Extraction is asked to run on, before anything is
// spent on it: the payload is checked at the door, so a client that sends
// something huge or something that is not an image costs neither a request
// of the user's monthly allowance nor a call to the model.

import { ApiError } from "./api-error.ts";

/**
 * The largest image data URL the endpoint accepts, measured on the string
 * that crosses the wire (base64 and all, one ASCII character per byte),
 * which is how the clients measure their own output.
 *
 * Both clients downscale first and land far below this:
 * - the extension refuses to send more than this itself
 *   (`SCREENSHOT_PIPELINE.MAX_ENCODED_BYTES` in `scripts/screenshot-pipeline.js`,
 *   the same 10 MiB), after cutting the Screenshot to a longest side of
 *   1600 px at JPEG quality 0.7 — around 1 MB even for a dense page
 * - the iOS app resizes to 1600 px wide at JPEG quality 0.7 before encoding,
 *   so even a very tall screenshot stays a few MB
 *
 * So the cap only ever catches a client that skipped its downscale step.
 */
export const MAX_IMAGE_DATA_URL_BYTES = 10 * 1024 * 1024;

// A base64 data URL carrying an image. Only the head is pinned down: which
// image subtypes it can actually decode is OpenAI's business, but the model
// takes this field as a URL, so anything that is not an inline image — a
// document, or an `https://` address it would go and fetch — stops here.
const IMAGE_DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i;

/**
 * Check the image payload of a request and return the data URL to send on.
 * Throws an ApiError carrying a 400 and a message the clients can show.
 */
export function assertValidImagePayload(image: unknown): string {
  if (typeof image !== "string" || image.length === 0) {
    // The wording old clients already show for an empty request.
    throw new ApiError(400, "image is required");
  }

  // Size before shape: one comparison, and it bounds the work the pattern
  // below is asked to do.
  if (image.length > MAX_IMAGE_DATA_URL_BYTES) {
    // MiB, the unit the cap is counted in: calling 10 MiB "10 MB" would
    // turn a client away that is inside the cap it is actually measured by.
    const cap = MAX_IMAGE_DATA_URL_BYTES / (1024 * 1024);
    throw new ApiError(
      400,
      `The image is too large. Please send an image under ${cap} MiB.`,
    );
  }

  if (!IMAGE_DATA_URL.test(image)) {
    throw new ApiError(
      400,
      "The image must be a base64-encoded image data URL.",
    );
  }

  return image;
}
