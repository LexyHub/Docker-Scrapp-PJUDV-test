import { CONCURRENCIA_LIMIT } from "../constants/limits.js";
import { retry } from "../utils/retry.js";
import { scrapeCausaTask } from "./scrape-causa.task.js";
import { sumToMetadata, setMetadata } from "../services/metadata.service.js";
import { getAllHashes } from "../services/hash.service.js";
import { logger } from "../config/logs.js";
import crypto from "crypto";

/**
 * Ejecuta la Fase 1: Scraping de causas desde formularios
 * @param {Object} page - Instancia de page de Playwright
 * @param {Array} casos - Array de casos con formData
 * @returns {Promise<Array>} - Array con todos los casos extraídos (aplanado)
 */
export async function ejecutarFaseCausas(page, casos) {
  logger.info("--- Etapa 1: Task de Scraping de Causas ---");
  logger.info(
    `Iniciando ${casos.length} tareas concurrentes con límite de: ${CONCURRENCIA_LIMIT.concurrency}`
  );

  const totalHashes = getAllHashes().length;
  logger.info(`Total de HASHES: ${totalHashes}`);
  sumToMetadata("movimientos_por_procesar", totalHashes);

  const fase1Start = new Date().getTime();

  // Crear tareas con límite de concurrencia
  const tasksTabla = casos.map((formData, index) => {
    const causaId = crypto.randomUUID();

    return CONCURRENCIA_LIMIT(() =>
      retry(() => scrapeCausaTask(page, formData, index + 1, causaId), 3, 2000)
    );
  });

  const resultadosTablas = await Promise.all(tasksTabla);

  // Aplanar resultados
  const todosLosCasos = resultadosTablas
    .filter((r) => r !== null && r.data)
    .flatMap((r) => r.data);

  const fase1End = new Date().getTime();
  const duracionSegundos = (fase1End - fase1Start) / 1000;

  setMetadata("tiempo_fase_1", `${duracionSegundos}s`);

  logger.info("--- Etapa 1 Completada ---");
  logger.info(`Se obtuvieron ${resultadosTablas.length} resultados de tablas.`);
  logger.info(`Se extraerán detalles para ${todosLosCasos.length} casos.`);

  return todosLosCasos;
}
