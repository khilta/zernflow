/**
 * The platforms ZernFlow can drive. Zernio itself connects many more (TikTok,
 * YouTube, LinkedIn, ads accounts...), but only these expose the DM inbox that
 * flows, sequences and broadcasts are built on, so account sync skips the rest.
 */
export const PLATFORMS = [
  "instagram",
  "facebook",
  "whatsapp",
  "twitter",
  "telegram",
  "bluesky",
  "reddit",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  twitter: "X / Twitter",
  telegram: "Telegram",
  bluesky: "Bluesky",
  reddit: "Reddit",
};

export function isSupportedPlatform(value: unknown): value is Platform {
  return (
    typeof value === "string" && (PLATFORMS as readonly string[]).includes(value)
  );
}

export function platformLabel(platform: string): string {
  return isSupportedPlatform(platform)
    ? PLATFORM_LABELS[platform]
    : platform.charAt(0).toUpperCase() + platform.slice(1);
}
