import crypto from "crypto";

export function normalizeValue(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim().toLowerCase();
}

export function movimientoHash({ desc_tramite, folio, fecha_movimiento }) {
  const payload = `${normalizeValue(desc_tramite)}|${normalizeValue(
    folio
  )}|${normalizeValue(fecha_movimiento)}`;
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

export function hashPeruano({ desc_tramite, folio, fecha_movimiento }) {
  return `${String(folio).trim()}:${String(desc_tramite).trim()}:${String(
    fecha_movimiento
  ).trim()}`;
}
