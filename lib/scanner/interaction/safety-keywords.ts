/**
 * Bounded unsafe-action keyword lists for internal candidate classification.
 * Matched labels are never returned in API output, logs, or exports.
 */

const UNSAFE_KEYWORDS = [
  // English
  "delete",
  "remove",
  "erase",
  "destroy",
  "clear data",
  "reset account",
  "logout",
  "log out",
  "sign out",
  "unsubscribe",
  "cancel subscription",
  "close account",
  "deactivate",
  "purchase",
  "buy now",
  " buy ",
  "pay now",
  "checkout",
  "place order",
  "add to cart",
  "book now",
  "reserve",
  "confirm booking",
  "send message",
  "submit",
  "publish",
  "post comment",
  "comment",
  "message",
  "email",
  "upload",
  "download",
  "install",
  "authorize",
  "connect account",
  "follow",
  "unfollow",
  "like",
  "dislike",
  "vote",
  "share",
  "transfer",
  "withdraw",
  "deposit",
  "donate",
  "accept",
  "decline",
  "join",
  "leave",
  "copy",
  "print",
  // Turkish
  "sil",
  "kaldır",
  "hesabı sil",
  "çıkış",
  "oturumu kapat",
  "aboneliği iptal",
  "satın al",
  "ödeme",
  "öde",
  "sipariş",
  "sepete ekle",
  "rezervasyon",
  "gönder",
  "yayınla",
  "paylaş",
  "yükle",
  "indir",
  "takip et",
  "takibi bırak",
  "beğen",
  "oy ver",
  "transfer",
  "para çek",
  "bağış",
  "onayla",
  "reddet",
  "katıl",
  "ayrıl",
  "kopyala",
  "yazdır",
] as const;

export function normalizeRiskLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesUnsafeActionKeyword(normalizedLabel: string): boolean {
  if (!normalizedLabel) return false;
  const padded = ` ${normalizedLabel} `;
  for (const keyword of UNSAFE_KEYWORDS) {
    if (keyword.startsWith(" ") || keyword.endsWith(" ")) {
      if (padded.includes(keyword)) return true;
      continue;
    }
    if (
      normalizedLabel === keyword ||
      normalizedLabel.includes(keyword)
    ) {
      return true;
    }
  }
  return false;
}

/** Keyword list passed into page.evaluate so labels never leave the page. */
export function getUnsafeKeywordList(): string[] {
  return [...UNSAFE_KEYWORDS];
}
