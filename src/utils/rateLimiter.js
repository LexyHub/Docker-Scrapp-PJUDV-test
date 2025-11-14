import { logger } from "../config/logs.js";

let RATE_LIMIT_CONFIG = {
  requestsPerBatch: 15,
  delayMs: 1000,
};

let _counter = 0;
let _lastDelayPromise = null;

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
 * lamar esta función antes de realizar una peticion a pjud.
 * tiene un contador global y si se alcanza el batch, espera delayMs.
 */
export async function tick() {
  _counter++;
  const { requestsPerBatch, delayMs } = RATE_LIMIT_CONFIG;
  if (requestsPerBatch > 0 && _counter % requestsPerBatch === 0) {
    logger.warn(
      `Rate limit alcanzado: ${requestsPerBatch} peticiones. Esperando ${delayMs} ms...`
    );
    // Si ya hay una promesa de delay en curso, encadenarla
    if (_lastDelayPromise) await _lastDelayPromise;
    _lastDelayPromise = delay(delayMs);
    await _lastDelayPromise;
    _lastDelayPromise = null;
  }
}

export function getRateLimitStats() {
  return { counter: _counter, config: { ...RATE_LIMIT_CONFIG } };
}
