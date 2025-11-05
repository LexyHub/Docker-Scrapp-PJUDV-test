const HASHES = {};

/**
 * @param {Array[String]} hashes Lista de hashes a establecer
 */
export function setHash(hashes) {
  hashes.forEach((h) => {
    HASHES[h] = true;
  });
}

export function addHash(hash) {
  HASHES[hash] = true;
}

export function hasHash(hash) {
  return !!HASHES[hash];
}

export function getAllHashes() {
  return Object.keys(HASHES);
}
