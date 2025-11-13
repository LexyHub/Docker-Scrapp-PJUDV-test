import { delay } from "../utils/core.js";

/**
 * Función para reintentar una operación asíncrona en caso de fallo.
 * @param {*} asyncFn - La función asíncrona a reintentar.
 * @param {*} maxRetries - El número máximo de reintentos.
 * @param {*} baseDelay - El tiempo base de espera entre reintentos.
 * @returns {Promise<*>} - La promesa resultante de la función asíncrona.
 */
export async function retry(asyncFn, maxRetries = 3, baseDelay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await asyncFn(); // Éxito, retorna el resultado
    } catch (error) {
      if (attempt >= maxRetries) {
        console.error(
          `[RETRY] Fallo final en intento ${attempt}/${maxRetries}: ${error.message}`
        );
        throw error; // Lanza el error final
      }

      const delayTime = baseDelay * attempt; // 2s, 4s, 6s...
      console.warn(
        `[RETRY] Intento ${attempt}/${maxRetries} falló: ${
          error.message
        }. Reintentando en ${delayTime / 1000}s...`
      );
      await delay(delayTime);
    }
  }
}
