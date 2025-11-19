import { logger } from "../config/logs.js";

let RATE_LIMIT_CONFIG = {
  requestsPerBatch: 15,
  delayMs: 1000,
};

// Estadísticas
let _totalRequests = 0;

// Contador por lote, se reinicia cada vez que aplicamos el delay
let _batchCount = 0;

// Cola para serializar las llamadas a tick() bajo concurrencia
let _queueTail = Promise.resolve();

export function configureRateLimit(config = {}) {
  if (config.requestsPerBatch !== undefined) {
    RATE_LIMIT_CONFIG.requestsPerBatch = config.requestsPerBatch;
  }
  if (config.delayMs !== undefined) {
    RATE_LIMIT_CONFIG.delayMs = config.delayMs;
  }
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Llamar esta función antes de realizar una petición a PJUD.
 * Serializa el acceso para garantizar que, bajo alta concurrencia, se aplique
 * una pausa cada `requestsPerBatch` peticiones.
 */
export async function tick() {
  // Serializar: cada tick espera al anterior para asegurar consistencia
  const prev = _queueTail;
  let release;
  _queueTail = new Promise((res) => (release = res));
  await prev;

  try {
    _totalRequests += 1;
    _batchCount += 1;

    const { requestsPerBatch, delayMs } = RATE_LIMIT_CONFIG;
    if (requestsPerBatch > 0 && _batchCount >= requestsPerBatch) {
      // Resetear el contador del lote y esperar
      _batchCount = 0;
      logger.warn(
        `Rate limit alcanzado: ${requestsPerBatch} peticiones. Esperando ${delayMs} ms...`
      );
      await delay(delayMs);
    }
  } finally {
    // Liberar siguiente en la cola
    release();
  }
}

export function getRateLimitStats() {
  return {
    totalRequests: _totalRequests,
    batchCount: _batchCount,
    config: { ...RATE_LIMIT_CONFIG },
  };
}
