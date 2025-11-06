import crypto from "crypto";

/**
 * Normaliza un valor eliminando espacios y convirtiendo a minúsculas.
 * @param {*} v - El valor a normalizar.
 * @returns {string} - El valor normalizado.
 */
export function normalizeValue(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim().toLowerCase();
}

/**
 * Crea un HASH 256 a partir de los campos clave de un movimiento.
 * @param {*} desc_tramite - Descripción del trámite.
 * @param {*} folio - Folio del movimiento.
 * @param {*} fecha_movimiento - Fecha del movimiento.
 * @returns {string} - El HASH 256 del movimiento.
 */
export function movimientoHash({ desc_tramite, folio, fecha_movimiento }) {
  const payload = `${normalizeValue(desc_tramite)}|${normalizeValue(
    folio
  )}|${normalizeValue(fecha_movimiento)}`;
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}
