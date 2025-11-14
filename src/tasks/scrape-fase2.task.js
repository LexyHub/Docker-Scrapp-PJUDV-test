import { CONCURRENCIA_LIMIT } from "../constants/limits.js";
import { retry } from "../utils/retry.js";
import { scrapeModalTask } from "./scrape-modal.task.js";
import { setMetadata } from "../services/metadata.service.js";
import { logger } from "../config/logs.js";
import { promises as fs } from "fs";
import path from "path";

/**
 * Ejecuta la Fase 2: Scraping de detalles de modales (cuadernos, anexos, notificaciones)
 * @param {Object} page - Instancia de page de Playwright
 * @param {Array} todosLosCasos - Array de casos básicos de Fase 1
 * @param {string} TOKEN - Token de autenticación
 * @param {string} dataDir - Directorio donde guardar JSONs individuales
 * @param {Function} normalizeString - Función para normalizar nombres de archivo
 * @returns {Promise<Array>} - Array con casos completos (incluyendo detalles de modales)
 */
export async function ejecutarFaseModales(
  page,
  todosLosCasos,
  TOKEN,
  dataDir,
  normalizeString
) {
  logger.info("--- Etapa 2: Task de Scraping de Detalles (Modales) ---");
  logger.info(
    `Iniciando ${todosLosCasos.length} tareas concurrentes con límite de: ${CONCURRENCIA_LIMIT.concurrency}`
  );

  const fase2Start = new Date().getTime();

  const tasksModales = todosLosCasos.map((casoData, index) => {
    return CONCURRENCIA_LIMIT(() =>
      retry(() => scrapeModalTask(page, casoData, TOKEN, index + 1), 3, 2000)
    );
  });

  const resultadosModales = await Promise.all(tasksModales);

  // Combinar datos de Fase 1 con datos de Fase 2
  const casosCompletos = resultadosModales
    .filter((r) => r !== null)
    .map((result, index) => {
      const casoOriginal = todosLosCasos[index];
      return {
        ...casoOriginal,
        ...result.data,
      };
    });

  const fase2End = new Date().getTime();
  const duracionSegundos = (fase2End - fase2Start) / 1000;

  setMetadata("tiempo_fase_2", `${duracionSegundos}s`);

  logger.info("--- Etapa 2 Completada ---");
  logger.info(`Se completaron ${casosCompletos.length} casos con detalles.`);

  return casosCompletos;
}

/**
 * Ejecuta la Fase 3: Guardado de casos en JSONs individuales
 * @param {Array} casosCompletos - Array de casos completos
 * @param {string} dataDir - Directorio donde guardar los JSONs
 * @param {Function} normalizeString - Función para normalizar nombres de archivo
 */
export async function ejecutarFaseGuardado(
  casosCompletos,
  dataDir,
  normalizeString
) {
  logger.info("--- Etapa 3: Guardado de Casos en Archivos JSON ---");
  const fase3Start = new Date().getTime();

  let guardadosExitosos = 0;
  let guardadosFallidos = 0;

  for (const caso of casosCompletos) {
    const nombreCaso = normalizeString(caso.rit || caso.id || "sin-nombre");
    const fileName = `${nombreCaso}.json`;
    const fullPath = path.join(dataDir, fileName);

    try {
      await fs.writeFile(fullPath, JSON.stringify(caso, null, 2), "utf-8");
      guardadosExitosos++;
    } catch (err) {
      logger.error(`Error al guardar caso ${fileName}: ${err.message}`);
      guardadosFallidos++;
    }
  }

  const fase3End = new Date().getTime();
  const duracionSegundos = (fase3End - fase3Start) / 1000;

  setMetadata("tiempo_fase_3", `${duracionSegundos}s`);
  setMetadata("casos_guardados_exitosos", guardadosExitosos);
  setMetadata("casos_guardados_fallidos", guardadosFallidos);

  logger.info("--- Etapa 3 Completada ---");
  logger.info(
    `${guardadosExitosos} casos guardados exitosamente, ${guardadosFallidos} fallidos.`
  );
}
