// Almacenamiento de Hashes en memoria RAM para acceso rápido O(1).
const HASHES = {};

/**
 * @param {Array[String]} hashes Lista de hashes a establecer
 * @returns {void}
 */
export function setHash(hashes) {
  hashes.forEach((h) => {
    HASHES[h] = true;
  });
}

/**
 * @param {string} hash Hash a agregar
 * @returns {void}
 */
export function addHash(hash) {
  HASHES[hash] = true;
}

/**
 * @param {string} hash Hash a verificar
 * @returns {boolean} True si el hash existe, false en caso contrario
 */
export function hasHash(hash) {
  return !!HASHES[hash];
}

/**
 * @returns {Array[String]} Lista de todos los hashes almacenados
 */
export function getAllHashes() {
  return Object.keys(HASHES);
}
