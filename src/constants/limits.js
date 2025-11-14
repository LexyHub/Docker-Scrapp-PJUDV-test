/**
 * limitador simple de concurrencia para no saturar memoria con promesas en pending.
 * @param {number} concurrency Concurrencia máxima permitida.
 * @returns {function(Function): Promise<any>} Una función que limita la concurrencia de las funciones asíncronas.
 */
function createSimpleLimit(concurrency) {
  let running = 0;
  const queue = [];

  return async (fn) => {
    while (running >= concurrency) {
      await new Promise((resolve) => queue.push(resolve));
    }
    running++;
    try {
      return await fn();
    } finally {
      running--;
      const resolve = queue.shift();
      if (resolve) resolve();
    }
  };
}

// limites para no saturar memoria (el rate limit controla velocidad)
export const DOWNLOAD_LIMIT = createSimpleLimit(50);
export const CONCURRENT_CASES = createSimpleLimit(50);
export const API_LIMIT = createSimpleLimit(50);
export const CASE_EXTRACTION_LIMIT = createSimpleLimit(50);
export const CONCURRENCIA_LIMIT = createSimpleLimit(20); // Fase 1 y 2
