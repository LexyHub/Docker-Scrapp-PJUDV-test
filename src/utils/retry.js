import { logger } from "../config/logs.js";
import { delay } from "../utils/core.js";

// funcion CORE para el scraping, si nos bloquean, se bloquea la solicitud o sobrecarga el servidor por muchas simultaneas
// se crea una funcion retry que acepta un callback asincronico y lo reintenta N veces con un delay entre cada intento
// esto evita que por ejemplo archivos se pierdan o no se descartugen correctamente, y tambien para modales
export async function retry(asyncFn, maxRetries = 3, baseDelay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await asyncFn(); // Éxito, retorna el resultado
    } catch (error) {
      if (attempt >= maxRetries) {
        logger.error(
          `[RETRY] Fallo final en intento ${attempt}/${maxRetries}: ${error.message}`
        );
        throw error; // Lanza el error final
      }

      const delayTime = baseDelay * attempt; // 2s, 4s, 6s...
      logger.warn(
        `[RETRY] Intento ${attempt}/${maxRetries} falló: ${
          error.message
        }. Reintentando en ${delayTime / 1000}s...`
      );
      await delay(delayTime);
    }
  }
}
