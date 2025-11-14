import { collectFileTasks } from "./scrape-archivos.task.js";
import { logger } from "../config/logs.js";

/**
 * Ejecuta la Fase 3: Recolección de tareas de descarga
 * @param {Array} casosCompletos - Array de casos completos con toda la información
 * @param {string} downloadsDir - Directorio base para descargas
 * @param {Function} normalizeString - Función para normalizar nombres de archivo
 * @returns {Promise<Object>} - Objeto con allFileTasks y allCeleryTasks
 */
export async function ejecutarFaseRecoleccion(
  casosCompletos,
  downloadsDir,
  normalizeString
) {
  logger.info("--- Etapa 3: Recolección de Tareas de Descarga ---");

  const taskResults = casosCompletos.map((caso) =>
    collectFileTasks(caso, caso.id, downloadsDir, normalizeString)
  );

  const allFileTasks = taskResults.flatMap((result) => result.tasks);
  const allCeleryTasks = taskResults.flatMap((result) => result.celeryTasks);

  logger.info(
    `Recolectadas ${allFileTasks.length} tareas con sesión y ${allCeleryTasks.length} tareas celery.`
  );
  logger.info("--- Etapa 3 Completada ---");

  return { allFileTasks, allCeleryTasks };
}
