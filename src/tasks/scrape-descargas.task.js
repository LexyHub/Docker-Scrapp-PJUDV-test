import fs from "fs/promises";
import path from "path";
import {
  descargarArchivoConReintentos,
  descargarPDFStream,
  getAuthHeaders,
} from "./scrape-archivos.task.js";
import { DATA_DIR } from "../constants/directories.js";
import { logger } from "../config/logs.js";
import { sumToMetadata } from "../services/metadata.service.js";

/**
 * Orquesta todas las fases de descarga de archivos (4A, 4B, 4C)
 * optimziado: Usa headers extraídos y descarga via fetch/stream
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
  sumToMetadata(
    "archivos_encolados",
    allFileTasks.length + allCeleryTasks.length
  );

  // Extraemos cookies y User-Agent de Playwright UNA VEZ.
  // Esto permite cerrar/ignorar el navegador durante la descarga masiva.
  let sessionHeaders = {};
  if (allFileTasks.length > 0 || allCeleryTasks.length > 0) {
    logger.info(
      "🔑 Extrayendo credenciales del navegador para descargas optimizadas..."
    );
    sessionHeaders = await getAuthHeaders(page);
  }

  // FASE 4A: Archivos con sesión (anexos)
  if (allFileTasks.length > 0) {
    logger.info(
      `\n[Fase 4A] Descargando ${allFileTasks.length} archivos que requieren sesión...`
    );

    const statsConSesion = await descargarArchivoConReintentos(allFileTasks, {
      maxReintentos: 3,
      headers: sessionHeaders,
    });

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
      `[Fase 4A] ${statsConSesion.exitosas}/${statsConSesion.total} archivos con sesión descargados`
    );
  }

  // FASE 4B: Archivos celery (regulares)
  if (allCeleryTasks.length > 0) {
    logger.info(
      `\n[Fase 4B] Descargando ${allCeleryTasks.length} archivos celery (públicos/token)...`
    );

    const statsCelery = await descargarPDFStream(allCeleryTasks, {
      maxReintentos: 3,
      // Aunque sean públicos, pasar el User-Agent de la sesión ayuda a evitar bloqueos
      headers: { "User-Agent": sessionHeaders["User-Agent"] },
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
      `[Fase 4B] ${statsCelery.exitosas}/${statsCelery.total} archivos celery descargados`
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
      todosLosArchivosFallidos,
      estadisticasDescarga,
      sessionHeaders
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
  archivosFallidos,
  estadisticasDescarga,
  headers
) {
  logger.info(
    `\n[Fase 4C] ${archivosFallidos.length} archivos fallidos. Iniciando reintentos finales...`
  );

  const statsReintentoFinal = await descargarArchivoConReintentos(
    archivosFallidos,
    {
      maxReintentos: 2,
      headers: headers,
    }
  );

  // Actualizar estadísticas con los reintentos exitosos
  estadisticasDescarga.exitosas += statsReintentoFinal.exitosas;
  // Ajustamos las fallidas restando las que ahora fueron exitosas
  estadisticasDescarga.fallidas =
    estadisticasDescarga.total - estadisticasDescarga.exitosas;

  logger.info(
    `[Fase 4C] ${statsReintentoFinal.exitosas} archivos recuperados tras reintentos`
  );

  // Guardar archivos que aún fallan después de todos los intentos
  if (statsReintentoFinal.archivosFallidos.length > 0) {
    await guardarArchivosFallidos(statsReintentoFinal.archivosFallidos);
  } else {
    logger.info("Todos los archivos descargados exitosamente tras reintentos!");
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
      `${archivosFallidos.length} archivos aún fallidos guardados en: ${fallidosPath}`
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
