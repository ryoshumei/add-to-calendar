// Error type carrying an HTTP status, plus mapping of OpenAI API failures
// to user-facing errors. Shared by process-text and process-image.

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface OpenAIErrorBody {
  error?: {
    type?: string;
    code?: string;
    message?: string;
  };
}

/**
 * Map a failed OpenAI response to the error surfaced to clients.
 *
 * insufficient_quota means the backend account ran out of credit — a service
 * problem, not the user's monthly limit — so it becomes a 503 with a neutral
 * message instead of OpenAI's raw billing text.
 */
export function mapOpenAIError(status: number, body: unknown): Error {
  const err = (body as OpenAIErrorBody | null)?.error;

  const isQuotaExhausted = status === 429 &&
    (err?.type === "insufficient_quota" || err?.code === "insufficient_quota");
  if (isQuotaExhausted) {
    return new ApiError(
      503,
      "Event processing is temporarily unavailable. Please try again later.",
    );
  }

  return new Error(err?.message || "OpenAI API request failed");
}
