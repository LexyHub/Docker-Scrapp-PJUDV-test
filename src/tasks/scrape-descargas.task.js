import fs from "fs/promises";
import path from "path";
import { descargarArchivosConSesion } from "./scrape-archivos.task.js";
import { DATA_DIR } from "../constants/directories.js";
import { logger } from "../config/logs.js";

/**
 * Orquesta todas las fases de descarga de archivos (4A, 4B, 4C)
 * @param {Object} page - Instancia de page de Playwright
 * @param {Array} allFileTasks - Archivos que requieren sesión (anexos)
 * @param {Array} allCeleryTasks - Archivos celery (regulares)
 * @returns {Promise<Object>} - Estadísticas globales de descarga
 */
export async function ejecutarFaseDescargas(
  page,
  allFileTasks,
  allCeleryTasks
) {
  const fase4Start = new Date().getTime();

  const estadisticasDescarga = {
    exitosas: 0,
    fallidas: 0,
    total: 0,
  };

  const todosLosArchivosFallidos = [];

  // FASE 4A: Archivos con sesión (anexos)
  if (allFileTasks.length > 0) {
    logger.info(
      `\n[Fase 4A] Descargando ${allFileTasks.length} archivos que requieren sesión...`
    );

    const statsConSesion = await descargarArchivosConSesion(
      page,
      allFileTasks,
      {
        concurrencia: 50,
        batchSize: 100,
        delayEntreLotes: 0,
        maxReintentos: 3,
      }
    );

    actualizarEstadisticas(estadisticasDescarga, statsConSesion);

    if (statsConSesion.archivosFallidos.length > 0) {
      todosLosArchivosFallidos.push(
        ...statsConSesion.archivosFallidos.map((t) => ({
          ...t,
          tipo: "con_sesion",
        }))
      );
    }

    logger.info(
      `[Fase 4A] ✅ ${statsConSesion.exitosas}/${statsConSesion.total} archivos con sesión descargados`
    );
  }

  // FASE 4B: Archivos celery (regulares con contexto de navegador)
  if (allCeleryTasks.length > 0) {
    logger.info(
      `\n[Fase 4B] Descargando ${allCeleryTasks.length} archivos celery (con contexto de navegador)...`
    );

    const statsCelery = await descargarArchivosConSesion(page, allCeleryTasks, {
      concurrencia: 50,
      batchSize: 100,
      delayEntreLotes: 0,
      maxReintentos: 3,
    });

    actualizarEstadisticas(estadisticasDescarga, statsCelery);

    if (statsCelery.archivosFallidos.length > 0) {
      todosLosArchivosFallidos.push(
        ...statsCelery.archivosFallidos.map((t) => ({
          ...t,
          tipo: "celery",
        }))
      );
    }

    logger.info(
      `[Fase 4B] ✅ ${statsCelery.exitosas}/${statsCelery.total} archivos celery descargados`
    );
  }

  if (allFileTasks.length === 0 && allCeleryTasks.length === 0) {
    logger.info("No se encontraron archivos para descargar.");
    return {
      estadisticas: estadisticasDescarga,
      archivosFallidos: [],
      duracion: 0,
    };
  }

  // FASE 4C: Reintentos finales para archivos fallidos
  let archivosFallidosFinales = [];

  if (todosLosArchivosFallidos.length > 0) {
    archivosFallidosFinales = await ejecutarReintentos(
      page,
      todosLosArchivosFallidos,
      estadisticasDescarga
    );
  }

  const fase4End = new Date().getTime();
  const duracionSegundos = (fase4End - fase4Start) / 1000;

  logger.info("\n--- Etapa 4 Completada ---");
  logger.info(
    `Tasa de éxito global: ${calcularTasaExito(estadisticasDescarga)}%`
  );
  logger.info(`Duración: ${duracionSegundos.toFixed(1)}s`);

  return {
    estadisticas: estadisticasDescarga,
    archivosFallidos: archivosFallidosFinales,
    duracion: duracionSegundos,
  };
}

/**
 * Ejecuta reintentos finales para archivos fallidos
 */
async function ejecutarReintentos(
  page,
  archivosFallidos,
  estadisticasDescarga
) {
  logger.info(
    `\n[Fase 4C] 🔄 ${archivosFallidos.length} archivos fallidos. Iniciando reintentos finales...`
  );

  const statsReintentoFinal = await descargarArchivosConSesion(
    page,
    archivosFallidos,
    {
      concurrencia: 30,
      batchSize: 50,
      delayEntreLotes: 0,
      maxReintentos: 2,
    }
  );

  // Actualizar estadísticas con los reintentos exitosos
  estadisticasDescarga.exitosas += statsReintentoFinal.exitosas;
  estadisticasDescarga.fallidas = statsReintentoFinal.fallidas;

  logger.info(
    `[Fase 4C] ✅ ${statsReintentoFinal.exitosas} archivos recuperados tras reintentos`
  );

  // Guardar archivos que aún fallan después de todos los intentos
  if (statsReintentoFinal.archivosFallidos.length > 0) {
    await guardarArchivosFallidos(statsReintentoFinal.archivosFallidos);
  } else {
    logger.info(
      "✅ Todos los archivos descargados exitosamente tras reintentos!"
    );
  }

  return statsReintentoFinal.archivosFallidos;
}

/**
 * Guarda archivos fallidos en JSON para análisis posterior
 */
async function guardarArchivosFallidos(archivosFallidos) {
  const fallidosPath = path.join(DATA_DIR, "descargas-fallidas.json");

  try {
    await fs.writeFile(
      fallidosPath,
      JSON.stringify(archivosFallidos, null, 2),
      "utf-8"
    );

    logger.warn(
      `⚠️  ${archivosFallidos.length} archivos aún fallidos guardados en: ${fallidosPath}`
    );
    logger.info(
      "Estos archivos pueden tener tokens expirados o errores permanentes del servidor."
    );
  } catch (err) {
    logger.error(`Error al guardar archivos fallidos: ${err.message}`);
  }
}

/**
 * Actualiza estadísticas globales con stats de una fase
 */
function actualizarEstadisticas(estadisticasGlobal, statsFase) {
  estadisticasGlobal.exitosas += statsFase.exitosas;
  estadisticasGlobal.fallidas += statsFase.fallidas;
  estadisticasGlobal.total += statsFase.total;
}

/**
 * Calcula tasa de éxito como porcentaje
 */
function calcularTasaExito(estadisticas) {
  if (estadisticas.total === 0) return 0;
  return ((estadisticas.exitosas / estadisticas.total) * 100).toFixed(1);
}
