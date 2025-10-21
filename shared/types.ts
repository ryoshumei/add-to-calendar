/**
 * Shared TypeScript types for Add to Calendar Extension
 * Used by both extension code and Supabase Edge Functions
 */

/**
 * Calendar event details extracted from text
 */
export interface EventDetails {
  /** Event title/summary */
  title: string;

  /** Event description/notes */
  description: string;

  /** Event start time in ISO format: YYYY-MM-DDTHH:mm:ss */
  startTime: string;

  /** Event end time in ISO format: YYYY-MM-DDTHH:mm:ss */
  endTime: string;

  /** Optional event location (physical address or online link) */
  location?: string;
}

/**
 * Request payload for process-text Edge Function
 */
export interface ProcessTextRequest {
  /** Selected text to process */
  selectedText: string;
}

/**
 * Usage information for monthly limits
 */
export interface UsageInfo {
  /** Current usage count for the month */
  usageCount: number;

  /** Monthly usage limit */
  limit: number;

  /** Year-month in format YYYY-MM */
  yearMonth: string;
}

/**
 * Response payload from process-text Edge Function
 */
export interface ProcessTextResponse {
  /** Extracted event details */
  eventDetails: EventDetails;

  /** Usage information (only present for authenticated backend processing) */
  usage?: UsageInfo;
}

/**
 * Error response from Edge Functions
 */
export interface EdgeFunctionError {
  /** Error message */
  error: string;

  /** Additional error details */
  details?: string;
}

/**
 * Calendar service processing result
 */
export interface CalendarServiceResult {
  /** Method used: 'url' for URL-based, 'api' for Google Calendar API */
  method: 'url' | 'api';

  /** Google Calendar URL */
  calendarUrl?: string;

  /** Result message */
  message: string;

  /** Optional event ID if created via API */
  eventId?: string;
}
