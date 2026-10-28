/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * hut12 minimal tokens — single source for light/dark presets, fonts and migrators
 */
import type { ThemePreset, CardStyle, ButtonStyle, BorderRadiusStyle, SiteConfig } from "../types";

export interface ThemePresetDetails {
  primary: string;
  primaryShadow: string;
  accent: string;
  accentShadow: string;
  secondary: string;
  secondaryShadow: string;
  bg: string;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  textColor?: string;
  isDark?: boolean;
}

export interface ThemePresetOption {
  id: ThemePreset;
  name: string;
  icon: string;
  description: string;
  primary: string;
  accent: string;
  secondary: string;
  cardStyle: CardStyle;
  radius: BorderRadiusStyle;
}

function darkenColor(hex: string, percent: number = 20): string {
  if (!hex || !hex.startsWith("#")) return hex || "#92400e";
  let num = parseInt(hex.replace("#", ""), 16);
  let r = (num >> 16) - Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00ff) - Math.round(255 * (percent / 100));
  let b = (num & 0x0000ff) - Math.round(255 * (percent / 100));
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export const HUT12_LIGHT: ThemePresetDetails = {
  primary: "#F6C445",
  primaryShadow: "#B08A18",
  accent: "#4338CA",
  accentShadow: "#312E81",
  secondary: "#7C75D4",
  secondaryShadow: "#514AA1",
  bg: "#F3F2FB",
  cardBg: "#FCFBFF",
  cardBorder: "#D7D4EE",
  cardShadow: "#E3E1F3",
  textColor: "#211F3A",
  isDark: false,
};

export const HUT12_DARK: ThemePresetDetails = {
  primary: "#F6C445",
  primaryShadow: "#B08A18",
  accent: "#8B86FF",
  accentShadow: "#5D56D6",
  secondary: "#7771CB",
  secondaryShadow: "#4F498D",
  bg: "#100F21",
  cardBg: "#1D1B33",
  cardBorder: "#3A3759",
  cardShadow: "#090914",
  textColor: "#F0EFFF",
  isDark: true,
};

export const HUT12_PRESETS: Record<ThemePreset, ThemePresetDetails> = {
  "hut12-light": HUT12_LIGHT,
  "hut12-dark": HUT12_DARK,
};

export const HUT12_PRESET_OPTIONS: ThemePresetOption[] = [
  {
    id: "hut12-light",
    name: "Dragon Den",
    icon: "☀️",
    description: "Warm farm-gold primary with deep indigo accents on soft parchment.",
    primary: "#F6C445",
    accent: "#4338CA",
    secondary: "#7C75D4",
    cardStyle: "solid",
    radius: "rounded-2xl",
  },
  {
    id: "hut12-dark",
    name: "Moonlit Lair",
    icon: "🌙",
    description: "A midnight den with warm gold and indigo light.",
    primary: "#F6C445",
    accent: "#8B86FF",
    secondary: "#7771CB",
    cardStyle: "glass",
    radius: "rounded-2xl",
  },
];

export const HUT12_FONTS_MAP: Record<string, string> = {
  "Nunito Sans": "https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;500;600;700;800&display=swap",
};

const DARK_PRESET_SET = new Set<string>([
  "cyber-arcade",
  "terminal-hacker",
  "8-bit-pixel",
  "cyberpunk-neon",
  "luxury-dark-gold",
]);

const OLD_TO_HUT12: Record<string, ThemePreset> = {
  "duolingo-playful": "hut12-light",
  "emerald-farm": "hut12-light",
  "sunset-gold": "hut12-light",
  "royal-violet": "hut12-light",
  apple: "hut12-light",
  neumorphic: "hut12-light",
  custom: "hut12-light",
  "cyber-arcade": "hut12-dark",
  "terminal-hacker": "hut12-dark",
  "8-bit-pixel": "hut12-dark",
  "cyberpunk-neon": "hut12-dark",
  "luxury-dark-gold": "hut12-dark",
};

export function migratePreset(raw: string | undefined): ThemePreset {
  const key = raw ?? "";
  if (key === "hut12-light" || key === "hut12-dark") return key as ThemePreset;
  if (DARK_PRESET_SET.has(key)) return "hut12-dark";
  return OLD_TO_HUT12[key] ?? "hut12-light";
}

export function migrateCardStyle(raw: string | undefined): CardStyle {
  const map: Record<string, CardStyle> = { glass: "glass", "liquid-glass": "glass" };
  return map[raw ?? ""] ?? "solid";
}

export function migrateButtonStyle(_raw: string | undefined): ButtonStyle {
  return "pill-gradient";
}

export function migrateBorderRadius(_raw: string | undefined): BorderRadiusStyle {
  return "rounded-2xl";
}

export function migrateFontFamily(_raw: string | undefined): string {
  return "Nunito Sans";
}

export function isHut12DarkPreset(preset: ThemePreset): boolean {
  return preset === "hut12-dark";
}

export function sanitizeSiteConfig(config: Partial<SiteConfig>): Partial<SiteConfig> {
  return {
    ...config,
    // Heal image fields that were saved with an accidentally double-appended
    // URL ("https://a.png" + "https://a.png") — keep only the first URL, or
    // Cloudinary hosts 404 and the consumer renders nothing.
    authBgImage: repairConcatUrl(config.authBgImage),
    logoUrl: repairConcatUrl(config.logoUrl),
    authSlideImages: Array.isArray(config.authSlideImages)
      ? config.authSlideImages.map((slide) => repairConcatUrl(slide))
      : config.authSlideImages,
    themePreset: migratePreset(config.themePreset as string),
    cardStyle: migrateCardStyle(config.cardStyle as string),
    buttonStyle: migrateButtonStyle(config.buttonStyle as string),
    borderRadius: migrateBorderRadius(config.borderRadius as string),
    fontFamily: migrateFontFamily(config.fontFamily),
  };
}

/** Drop a duplicated tail a "URL+URL" write left behind; keep the first URL. */
function repairConcatUrl(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  const split = text.match(/^(https?:\/\/.*?)(?=https?:\/\/)/);
  return (split ? split[1] : text).trim();
}

export { darkenColor };
