/**
 * Normaliza un string eliminando caracteres especiales y convirtiendo a minúsculas.
 * @param {string} str - El string a normalizar.
 * @returns {string} - El string normalizado.
 */
export function normalizeString(str) {
  if (!str) return "";

  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

/**
 * Función de delay.
 * @param {number} ms - Milisegundos a esperar.
 * @returns {Promise<void>} - Promesa que se resuelve después del delay.
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
