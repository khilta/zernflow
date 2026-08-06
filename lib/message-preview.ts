const PREVIEW_LENGTH = 100;

/**
 * Truncates a message for `conversations.last_message_preview`.
 *
 * Slices by code point, never by UTF-16 code unit: a plain `slice` cuts an
 * emoji's surrogate pair in half whenever one straddles the limit, and
 * PostgREST rejects the resulting lone surrogate with `PGRST102 Empty or
 * invalid json`, which silently dropped whole conversations during inbox
 * backfill.
 */
export function messagePreview(text: string | null | undefined): string {
  return Array.from(text ?? "").slice(0, PREVIEW_LENGTH).join("");
}
