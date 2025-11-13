/**
 * Función para secuestrar el token de sesión anónima de la página.
 * @param {*} func Función (en formato String) desde donde extraer el token. Revisar implementación.
 * @returns {string|null} Token extraído o null si no se encuentra.
 */
export function secuestrarToken(func) {
  const m = func.match(/token\s*[:=]\s*['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

/**
 * Función para secuestrar el token de la función anexoSolicitudCivil.
 * @param {*} func Función (en formato String) desde donde extraer el token. Revisar implementación.
 * @returns {string|null} Token extraído o null si no se encuentra.
 */
export function secuestrarFuncToken(func) {
  const m = func.match(/anexoSolicitudCivil\s*\(['"]([^'"]+)['"]\)/);
  return m ? m[1] : null;
}

/**
 * Función para secuestrar el token de la causa civil.
 * @param {*} func Función (en formato String) desde donde extraer el token. Revisar implementación.
 * @returns {string|null} Token extraído o null si no se encuentra.
 */
export function secuestrarDetalleCivil(func) {
  if (!func) return null;
  const regex = /detalleCausaCivil\s*\('([^']+)'\)/;
  return regex.exec(func)?.[1] || null;
}

/**
 * Función para secuestrar el token del anexo de la causa civil.
 * @param {*} func Función (en formato String) desde donde extraer el token. Revisar implementación.
 * @returns {string|null} Token extraído o null si no se encuentra.
 */
export function secuestrarTokenAnexoCausaCivil(func) {
  if (!func) return null;
  const regex = /anexoCausaCivil\s*\('([^']+)'\)/;
  return regex.exec(func)?.[1] || null;
}

/**
 * Función para secuestrar el token de notificaciones de la causa civil.
 * @param {*} func Función (en formato String) desde donde extraer el token. Revisar implementación.
 * @returns {string|null} Token extraído o null si no se encuentra.
 */
export function secuestrarTokenInfoNotificacionesRec(func) {
  if (!func) return null;
  const regex = /receptorCivil\s*\('([^']+)'\)/;
  return regex.exec(func)?.[1] || null;
}
