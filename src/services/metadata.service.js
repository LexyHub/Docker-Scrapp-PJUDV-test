// en ram

const METADATA = {};

export function setMetadata(key, value) {
  METADATA[key] = value;
}

export function sumToMetadata(key, value) {
  if (!METADATA[key]) {
    METADATA[key] = 0;
  }
  METADATA[key] += value;
}

export function restFromMetadata(key, value) {
  if (!METADATA[key]) {
    METADATA[key] = 0;
  }
  METADATA[key] -= value;
}

export function getMetadata(key) {
  return METADATA[key];
}

export function getAllMetadata() {
  return METADATA;
}
