import {
  assertEquals,
  assertInstanceOf,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { ApiError } from "./api-error.ts";
import {
  assertValidImagePayload,
  MAX_IMAGE_DATA_URL_BYTES,
} from "./image-payload.ts";

/** A data URL of `bodyLength` base64 characters. */
function dataUrl(bodyLength: number, mime = "image/jpeg"): string {
  return `data:${mime};base64,${"A".repeat(bodyLength)}`;
}

/** The base64 body length that makes the whole data URL exactly `total`. */
function bodyLengthFor(total: number, mime = "image/jpeg"): number {
  return total - `data:${mime};base64,`.length;
}

// The head of a real JPEG (SOI + JFIF marker), as both clients encode one.
const JPEG_DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD";

Deno.test("the downscaled JPEG both clients send is passed through unchanged", () => {
  assertEquals(assertValidImagePayload(JPEG_DATA_URL), JPEG_DATA_URL);
});

Deno.test("the other image types a client can encode are accepted too", () => {
  for (const mime of ["image/png", "image/webp", "image/heic", "IMAGE/JPEG"]) {
    const url = dataUrl(16, mime);
    assertEquals(assertValidImagePayload(url), url);
  }
});

Deno.test("an image exactly at the byte cap is still accepted", () => {
  const atCap = dataUrl(bodyLengthFor(MAX_IMAGE_DATA_URL_BYTES));

  assertEquals(atCap.length, MAX_IMAGE_DATA_URL_BYTES);
  assertEquals(assertValidImagePayload(atCap), atCap);
});

Deno.test("a missing image is refused before anything is spent on it", () => {
  for (const missing of [undefined, null, "", 12345, { image: "x" }]) {
    const error = assertThrows(() => assertValidImagePayload(missing));

    assertInstanceOf(error, ApiError);
    assertEquals(error.status, 400);
    assertEquals(error.message, "image is required");
  }
});

Deno.test("a payload whose MIME is not an image is refused the same way", () => {
  const pdf = "data:application/pdf;base64,JVBERi0xLjQK";

  const error = assertThrows(() => assertValidImagePayload(pdf));

  assertInstanceOf(error, ApiError);
  assertEquals(error.status, 400);
  assertEquals(
    error.message,
    "The image must be a base64-encoded image data URL.",
  );
});

Deno.test("an image over the byte cap is refused with a 400 a client can show", () => {
  const oversized = dataUrl(bodyLengthFor(MAX_IMAGE_DATA_URL_BYTES + 1));

  const error = assertThrows(() => assertValidImagePayload(oversized));

  assertInstanceOf(error, ApiError);
  assertEquals(error.status, 400);
  assertEquals(
    error.message,
    // MiB, because that is the unit the cap is actually counted in: a
    // message naming a smaller number than the one enforced would send a
    // client away that the endpoint would have accepted.
    "The image is too large. Please send an image under 10 MiB.",
  );
});
