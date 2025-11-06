// se crea un objeto para almacenar y buscar metadatos de forma eficiente O(1).

const METADATA = {};

/**
 * Función para setear un metadato, el valor puede ser de cualquier tipo.
 * @param {string} key Key del metadato
 * @param {*} value Valor del metadato, puede ser de cualquier tipo. Ojalá primitivo.
 */
export function setMetadata(key, value) {
  METADATA[key] = value;
}

/**
 * Función para sumar un valor a un metadato numérico.
 * @param {string} key Key del metadato
 * @param {number} value Valor a sumar al metadato
 */
export function sumToMetadata(key, value) {
  if (!METADATA[key]) {
    METADATA[key] = 0;
  }
  METADATA[key] += value;
}

/**
 * Función para restar un valor a un metadato numérico.
 * @param {string} key Key del metadato
 * @param {number} value Valor a restar al metadato
 */
export function restFromMetadata(key, value) {
  if (!METADATA[key]) {
    METADATA[key] = 0;
  }
  METADATA[key] -= value;
}

/**
 * Función para obtener un metadato específico.
 * @param {string} key Key del metadato
 * @returns {*} Valor del metadato o undefined si no existe
 */
export function getMetadata(key) {
  return METADATA[key];
}

/**
 * Función para obtener todos los metadatos.
 * @returns {Object} Objeto con todos los metadatos
 */
export function getAllMetadata() {
  return METADATA;
}
