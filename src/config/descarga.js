/**
 * ESCENARIO 1: Conexión rápida + servidor estable
 */
const CONFIG_AGRESIVA = {
  concurrencia: 12, // 12 descargas simultáneas
  batchSize: 40, // 40 archivos por lote
  delayEntreLotes: 10, // 10ms entre lotes (muy rápido)
  maxReintentos: 2, // 2 reintentos
};

/**
 * ESCENARIO 2: Configuración BALANCEADA
 */
const CONFIG_BALANCEADA = {
  concurrencia: 8, // 8 descargas simultáneas (DEFAULT)
  batchSize: 25, // 25 archivos por lote (DEFAULT)
  delayEntreLotes: 20, // 20ms entre lotes (DEFAULT)
  maxReintentos: 2, // 2 reintentos (DEFAULT)
};

/**
 * ESCENARIO 3: Conexión lenta o servidor inestable
 */
const CONFIG_CONSERVADORA = {
  concurrencia: 4, // Solo 4 descargas simultáneas
  batchSize: 15, // 15 archivos por lote
  delayEntreLotes: 100, // 100ms entre lotes (más espacio)
  maxReintentos: 3, // 3 reintentos (más tolerante)
};

/**
 * ESCENARIO 4: Máxima velocidad (EXPERIMENTAL)
 */
const CONFIG_EXTREMA = {
  concurrencia: 20, // 20 descargas simultáneas
  batchSize: 50, // 50 archivos por lote
  delayEntreLotes: 0, // Sin delay
  maxReintentos: 1, // Solo 1 reintento
};

/**
 * ESCENARIO 5: Testing / Desarrollo
 */
const CONFIG_TESTING = {
  concurrencia: 2, // Solo 2 descargas
  batchSize: 5, // 5 archivos por lote
  delayEntreLotes: 500, // 500ms entre lotes (muy lento)
  maxReintentos: 1, // 1 reintento
};

/**
 * ESCENARIO 6: Servidor con rate limiting estricto
 */
const CONFIG_RATE_LIMITED = {
  concurrencia: 3, // Solo 3 descargas
  batchSize: 10, // 10 archivos por lote
  delayEntreLotes: 200, // 200ms entre lotes
  maxReintentos: 3, // 3 reintentos con backoff
};

// CÓMO APLICAR UNA CONFIGURACIÓN
/*
1. Abre src/index.js
2. Busca la línea ~107 donde dice:
   
   await descargarArchivosConBatching(page, allFileTasks, {

3. Reemplaza los parámetros con la config deseada:

   // Ejemplo: usar configuración conservadora
   await descargarArchivosConBatching(page, allFileTasks, {
     concurrencia: 4,
     batchSize: 15,
     delayEntreLotes: 100,
     maxReintentos: 3,
   });

4. Guarda y ejecuta el scraper
*/

module.exports = {
  CONFIG_AGRESIVA,
  CONFIG_BALANCEADA,
  CONFIG_CONSERVADORA,
  CONFIG_EXTREMA,
  CONFIG_TESTING,
  CONFIG_RATE_LIMITED,
};
