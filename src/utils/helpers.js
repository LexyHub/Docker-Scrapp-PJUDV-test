import { normalizeString } from "./core.js";

export function cleanText(input) {
  const dateWithParen = /\b\d{2}\/\d{2}\/\d{4}\s*\([^)]*\)/g;

  return input.replace(dateWithParen, (match) => {
    return match.slice(0, 10);
  });
}

const blacklist = ["Diligencia"];

export function isBlacklisted(text) {
  const normalized = normalizeString(text).toLowerCase();

  return blacklist.some((item) => {
    const needle = item.toLowerCase();
    return normalized === needle || normalized.includes(needle);
  });
}
