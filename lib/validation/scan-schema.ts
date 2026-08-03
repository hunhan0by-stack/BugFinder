import { z } from "zod";
import type { ScanRequestInput } from "@/types/scan";

export const EMPTY_URL_MESSAGE = "Enter a website address.";
export const MALFORMED_URL_MESSAGE =
  "Enter a valid website address beginning with http:// or https://.";
export const UNSUPPORTED_PROTOCOL_MESSAGE =
  "Only HTTP and HTTPS website addresses are supported.";
export const NO_OPTION_SELECTED_MESSAGE =
  "Select at least one check before continuing.";
export const REQUEST_SHAPE_MESSAGE =
  "The scan request was not in the expected format. It must contain a website address and the six check options.";
export const URL_CREDENTIALS_MESSAGE =
  "Website addresses containing embedded usernames or passwords are not supported.";
export const URL_TOO_LONG_MESSAGE = "The website address is too long.";

export const MAX_WEBSITE_URL_LENGTH = 2048;

/**
 * Messages written for people. Anything else Zod produces describes a malformed
 * request body, which only happens when the interface is bypassed, so it is
 * replaced with REQUEST_SHAPE_MESSAGE instead of being shown raw.
 */
const USER_FACING_MESSAGES: readonly string[] = [
  EMPTY_URL_MESSAGE,
  MALFORMED_URL_MESSAGE,
  UNSUPPORTED_PROTOCOL_MESSAGE,
  NO_OPTION_SELECTED_MESSAGE,
  URL_CREDENTIALS_MESSAGE,
  URL_TOO_LONG_MESSAGE,
];

export function userFacingMessage(message: string | null | undefined): string {
  return message && USER_FACING_MESSAGES.includes(message)
    ? message
    : REQUEST_SHAPE_MESSAGE;
}

const RECOGNIZED_NON_WEB_SCHEMES = [
  "about",
  "blob",
  "chrome",
  "data",
  "file",
  "ftp",
  "ftps",
  "javascript",
  "mailto",
  "sms",
  "tel",
  "vbscript",
  "view-source",
  "ws",
  "wss",
];

export type WebsiteUrlCheck =
  | { ok: true; url: string }
  | { ok: false; message: string };

function containsControlOrNull(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function hasBrokenPercentEncoding(value: string): boolean {
  const matches = value.match(/%[0-9a-fA-F]{0,2}/g) ?? [];
  return matches.some((token) => !/^%[0-9a-fA-F]{2}$/.test(token));
}

/**
 * Shared client/server website address checks. This is not the security
 * boundary — the server still runs hostname, port, DNS, and IP policies.
 */
export function checkWebsiteUrl(rawValue: string): WebsiteUrlCheck {
  const trimmed = rawValue.trim();

  if (trimmed === "") {
    return { ok: false, message: EMPTY_URL_MESSAGE };
  }

  if (trimmed.length > MAX_WEBSITE_URL_LENGTH) {
    return { ok: false, message: URL_TOO_LONG_MESSAGE };
  }

  if (/\s/.test(trimmed) || containsControlOrNull(trimmed)) {
    return { ok: false, message: MALFORMED_URL_MESSAGE };
  }

  if (hasBrokenPercentEncoding(trimmed)) {
    return { ok: false, message: MALFORMED_URL_MESSAGE };
  }

  const isWebScheme = /^https?:\/\//i.test(trimmed);

  if (!isWebScheme) {
    const otherSchemeWithSlashes = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
    const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
    const recognizedOpaqueScheme =
      schemeMatch !== null &&
      RECOGNIZED_NON_WEB_SCHEMES.includes(schemeMatch[1].toLowerCase());

    if (otherSchemeWithSlashes || recognizedOpaqueScheme) {
      return { ok: false, message: UNSUPPORTED_PROTOCOL_MESSAGE };
    }

    return { ok: false, message: MALFORMED_URL_MESSAGE };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: MALFORMED_URL_MESSAGE };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, message: UNSUPPORTED_PROTOCOL_MESSAGE };
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, message: URL_CREDENTIALS_MESSAGE };
  }

  if (parsed.hostname === "") {
    return { ok: false, message: MALFORMED_URL_MESSAGE };
  }

  // Fragments are not sent over the network; strip them before scanning.
  parsed.hash = "";

  // Normalize a single trailing hostname dot for consistency.
  if (parsed.hostname.endsWith(".") && parsed.hostname !== ".") {
    parsed.hostname = parsed.hostname.slice(0, -1);
  }

  return { ok: true, url: parsed.toString() };
}

export const websiteUrlSchema = z
  .string({ error: EMPTY_URL_MESSAGE })
  .transform((value, ctx) => {
    const result = checkWebsiteUrl(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.message });
      return z.NEVER;
    }
    return result.url;
  });

export const scanOptionsSchema = z
  .strictObject({
    consoleErrors: z.boolean(),
    networkErrors: z.boolean(),
    brokenImages: z.boolean(),
    mobileLayout: z.boolean(),
    accessibility: z.boolean(),
    screenshots: z.boolean(),
  })
  .refine((options) => Object.values(options).some((enabled) => enabled), {
    message: NO_OPTION_SELECTED_MESSAGE,
  });

export const scanRequestSchema = z.strictObject({
  url: websiteUrlSchema,
  options: scanOptionsSchema,
});

export type ScanRequestPayload = z.output<typeof scanRequestSchema>;
export type ScanRequestSchemaInput = z.input<typeof scanRequestSchema>;

export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const first = issue.path[0];
    const key = typeof first === "string" ? first : "request";
    const messages = fieldErrors[key] ?? [];
    if (!messages.includes(issue.message)) {
      messages.push(issue.message);
    }
    fieldErrors[key] = messages;
  }

  return fieldErrors;
}

export function firstFieldError(
  fieldErrors: Record<string, string[]> | undefined,
  key: keyof ScanRequestInput | "request",
): string | null {
  const messages = fieldErrors?.[key];
  return messages && messages.length > 0 ? messages[0] : null;
}
