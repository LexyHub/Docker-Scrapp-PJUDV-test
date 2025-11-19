import { logger } from "../config/logs.js";
import { sumToMetadata } from "../services/metadata.service.js";
import { tick } from "../utils/rateLimiter.js";
import https from "https";
import { promises as promiseFs } from "fs";
import fs from "fs";
import path from "path";

/**
 * Función para recopilar y encolar tareas de descarga de archivos PDF desde la estructura de datos scrapeada.
 * @param {object} data Estructura de datos scrapeada que contiene referencias a archivos PDF.
 * @param {string} fileUUID UUID del archivo (nombre)
 * @param {string} downloadsDir Directorio donde se guardarán las descargas
 * @param {function} _normalizeString Función para normalizar nombres de archivos
 * @returns {Array} Array de tareas de descarga
 */
//! PODRÍA OPTIMIZARSE MUCHO MÁS
export function collectFileTasks(
  data,
  fileUUID,
  downloadsDir,
  _normalizeString
) {
  const tasks = [];
  const celeryTasks = []; // sin sesion

  if (!data.cuadernos) return [];

  // recorremos archivos relacionados a movimientos
  for (const cuadernoName in data.cuadernos) {
    const cuaderno = data.cuadernos[cuadernoName];
    for (const tablaKey in cuaderno) {
      const tabla = cuaderno[tablaKey];
      if (!Array.isArray(tabla)) continue;

      for (const row of tabla) {
        for (const cellKey in row) {
          const cellData = row[cellKey];

          if (
            Array.isArray(cellData) &&
            cellData.length > 0 &&
            cellData[0].url
          ) {
            for (const fileInfo of cellData) {
              const { name: fileId, url, requiresSession } = fileInfo;
              const relativePath = path.join(fileUUID, `${fileId}.pdf`);
              const fullPath = path.join(downloadsDir, relativePath);
              if (requiresSession) {
                // sumToMetadata("descargas_archivo_encoladas", 1);
                tasks.push({
                  url,
                  fullPath,
                  requiresSession: true,
                });
              } else {
                // sumToMetadata("descargas_archivo_celery_encoladas", 1);
                celeryTasks.push({
                  url,
                  fullPath,
                });
              }

              fileInfo.localPath = relativePath;
              delete fileInfo.url;
              delete fileInfo.requiresSession;
            }
          }

          // No recuerdo bien qué es lo que hacía esta sección, pero al parecer tiene que ver con la descarga
          // de anexos
          if (
            Array.isArray(cellData) &&
            cellData.length > 0 &&
            cellData[0].doc &&
            Array.isArray(cellData[0].doc)
          ) {
            for (const anexoItem of cellData) {
              if (Array.isArray(anexoItem.doc)) {
                for (const fileInfo of anexoItem.doc) {
                  if (fileInfo.url) {
                    const { name: fileId, url, requiresSession } = fileInfo;
                    const relativePath = path.join(fileUUID, `${fileId}.pdf`);
                    const fullPath = path.join(downloadsDir, relativePath);
                    if (requiresSession) {
                      sumToMetadata("descargas_archivo_encoladas", 1);
                      tasks.push({
                        url,
                        fullPath,
                        requiresSession: true,
                      });
                    } else {
                      sumToMetadata("descargas_archivo_celery_encoladas", 1);
                      celeryTasks.push({
                        url,
                        fullPath,
                      });
                    }

                    fileInfo.localPath = relativePath;
                    delete fileInfo.url;
                    delete fileInfo.requiresSession;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return { tasks, celeryTasks };
}

// Descarga por stream para un solo archivo
function descargarPDFStreamIndividual(url, rutaSalida, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(rutaSalida);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const archivo = fs.createWriteStream(rutaSalida);
    let bytesReceived = 0;

    const req = https
      .get(url, (respuesta) => {
        if (respuesta.statusCode === 301 || respuesta.statusCode === 302) {
          if (respuesta.headers.location) {
            descargarPDFStreamIndividual(
              respuesta.headers.location,
              rutaSalida,
              timeout
            )
              .then(resolve)
              .catch(reject);
            return;
          } else {
            reject(new Error("Redirección 302 sin URL de ubicación."));
            return;
          }
        }
        // Aceptar cualquier código 2xx como éxito
        if (respuesta.statusCode < 200 || respuesta.statusCode >= 300) {
          const errorMsg = `HTTP ${respuesta.statusCode} al descargar ${url}`;
          reject(new Error(errorMsg));
          archivo.close();
          fs.unlink(rutaSalida, () => {});
          return;
        }

        respuesta.on("data", (chunk) => {
          bytesReceived += chunk.length;
        });

        respuesta.pipe(archivo);
        archivo.on("finish", () => {
          archivo.close(() => {
            resolve(rutaSalida);
          });
        });
      })
      .on("error", (err) => {
        fs.unlink(rutaSalida, () => {});
        reject(err);
      });

    // Timeout optimizado (15s por defecto, ajustable)
    req.setTimeout(timeout, () => {
      req.destroy();
      archivo.close();
      try {
        fs.unlinkSync(rutaSalida);
      } catch (e) {}
      reject(
        new Error(
          `Timeout en descarga por stream (${timeout}ms, ${bytesReceived} bytes recibidos)`
        )
      );
    });
  });
}

export async function descargarConPlaywright(
  page,
  url,
  rutaSalida,
  timeout = 30000
) {
  const dir = path.dirname(rutaSalida);
  await promiseFs.mkdir(dir, { recursive: true });

  try {
    const response = await page.request.get(url, { timeout });
    if (!response.ok()) {
      const errorMsg = `HTTP ${response.status()}: ${response.statusText()}`;
      // Limpiar archivo parcial
      try {
        await promiseFs.unlink(rutaSalida);
      } catch {}
      // Rechazar con error descriptivo (no rompe el flujo global)
      throw new Error(errorMsg);
    }
    const buffer = await response.body();
    await promiseFs.writeFile(rutaSalida, buffer);
    return rutaSalida;
  } catch (error) {
    // Limpiar archivo parcial si existe
    try {
      await promiseFs.unlink(rutaSalida);
    } catch {}
    // Re-lanzar para que descargarUnArchivo lo capture y retorne false
    throw error;
  }
}

/**
 * Descarga un archivo individual con estrategias de fallback
 * @param {Object} page - Instancia de page de Playwright
 * @param {Object} task - Tarea de descarga {url, fullPath, requiresSession?}
 * @returns {Promise<boolean>} - true si descarga exitosa, false si falló
 */
async function descargarUnArchivo(page, task) {
  const { url, fullPath, requiresSession } = task;
  const logPrefix = "[Descargas]";

  try {
    // Aplicar rate limiting global antes de cada descarga
    await tick();

    // Solo archivos marcados explícitamente como "requiresSession" usan Playwright
    if (requiresSession) {
      logger.debug(
        `${logPrefix} Descargando con Playwright (anexo, requiere sesión): ${url}...`
      );
      await descargarConPlaywright(page, url, fullPath, 30000);
    } else {
      // Archivos regulares: usar stream (más rápido), sin fallback
      logger.debug(`${logPrefix} Descargando con Stream: ${url}...`);
      await descargarPDFStreamIndividual(url, fullPath, 15000);
    }
    return true;
  } catch (error) {
    // Detectar errores HTTP específicos (403, 404, 500, etc.)
    const esError403 =
      error.message.includes("403") || error.message.includes("Forbidden");
    const esError404 =
      error.message.includes("404") || error.message.includes("Not Found");

    if (esError403) {
      logger.warn(`${logPrefix} HTTP 403 Forbidden (sin permisos): ${url}`);
    } else if (esError404) {
      logger.warn(
        `${logPrefix} HTTP 404 Not Found (archivo no existe): ${url}`
      );
    } else {
      logger.error(`${logPrefix} Error: ${error.message} | URL: ${url}`);
    }

    sumToMetadata("descargas_fallidas", 1);
    return false;
  }
}

/**
 * Sistema de descarga masiva con reintentos. tick() maneja el rate limiting automáticamente.
 * @param {Object} page - Instancia de page de Playwright
 * @param {Array} tasks - Array de tareas de descarga
 * @param {Object} options - Opciones de configuración
 * @returns {Promise<Object>} - Estadísticas de descarga
 */
export async function descargarArchivosConBatching(page, tasks, options = {}) {
  const {
    maxReintentos = 2, // Reintentos por archivo
  } = options;

  if (!tasks || tasks.length === 0) {
    logger.info("[Descargas] No hay archivos para descargar.");
    return { exitosas: 0, fallidas: 0, total: 0 };
  }

  // Sanitizar tareas: remover entradas sin URL válida
  const validTasks = tasks.filter(
    (t) => t && typeof t.url === "string" && t.url.trim().length > 0
  );
  if (validTasks.length !== tasks.length) {
    const diff = tasks.length - validTasks.length;
    logger.warn(`[Descargas] ${diff} tareas con URL inválida fueron omitidas.`);
  }

  const totalArchivos = validTasks.length;
  let exitosas = 0;
  let fallidas = 0;
  const archivosFallidos = [];

  logger.info(
    `[Descargas] Iniciando descarga de ${totalArchivos} archivos (rate limiting controlado por tick())`
  );

  // Procesar tareas secuencialmente - tick() controla el rate limiting
  for (let i = 0; i < validTasks.length; i++) {
    const task = validTasks[i];
    const exito = await descargarUnArchivo(page, task);
    if (exito) {
      exitosas++;
    } else {
      archivosFallidos.push(task);
    }

    // Log de progreso cada 50 archivos
    if ((i + 1) % 50 === 0 || i === validTasks.length - 1) {
      logger.info(
        `[Descargas] Progreso: ${
          i + 1
        }/${totalArchivos} (${exitosas} exitosas, ${
          archivosFallidos.length
        } fallidas)`
      );
    }
  }

  if (archivosFallidos.length > 0 && maxReintentos > 0) {
    logger.warn(
      `[Descargas] ${archivosFallidos.length} archivos fallaron. Iniciando reintentos...`
    );

    for (let intento = 2; intento <= maxReintentos + 1; intento++) {
      const porReintentar = [...archivosFallidos];
      archivosFallidos.length = 0; // Limpiar array

      logger.info(
        `[Descargas] Reintento ${intento - 1}/${maxReintentos}: ${
          porReintentar.length
        } archivos`
      );

      // Reintentar secuencialmente - tick() maneja el rate limiting
      for (const task of porReintentar) {
        // Pequeño backoff adicional para reintentos
        await new Promise((resolve) => setTimeout(resolve, intento * 50));
        const exito = await descargarUnArchivo(page, task);
        if (exito) {
          exitosas++;
        } else {
          archivosFallidos.push(task);
        }
      }

      // Si ya no hay fallidos, salir del ciclo de reintentos
      if (archivosFallidos.length === 0) {
        logger.info(
          `[Descargas] ✓ Todos los archivos descargados exitosamente tras reintentos.`
        );
        break;
      }
    }
  }

  fallidas = archivosFallidos.length;

  // Resumen final
  logger.info(
    `[Descargas] Completado: ${exitosas}/${totalArchivos} exitosas, ${fallidas} fallidas`
  );

  if (fallidas > 0) {
    logger.error(
      `[Descargas] ${fallidas} archivos NO se pudieron descargar tras ${maxReintentos} reintentos:`
    );
    archivosFallidos.slice(0, 5).forEach((task) => {
      logger.error(`  - ${task?.url || "(sin URL)"}`);
    });
    if (fallidas > 5) {
      logger.error(`  ... y ${fallidas - 5} más.`);
    }
  }

  return { exitosas, fallidas, total: totalArchivos, archivosFallidos };
}

/**
 * Wrapper: Descarga archivos que REQUIEREN SESIÓN (usa Playwright)
 * Firma compatible con scrape-descargas.task.js
 */
export async function descargarArchivoConReintentos(page, tasks, options = {}) {
  // Asegurar flag requiresSession en true
  const tasksConSesion = tasks.map((t) => ({ ...t, requiresSession: true }));
  return descargarArchivosConBatching(page, tasksConSesion, options);
}

/**
 * Wrapper: Descarga archivos CELERY/REGULARES (stream sin sesión)
 * Firma compatible con scrape-descargas.task.js
 */
export async function descargarPDFStream(page, tasks, options = {}) {
  const tasksSinSesion = tasks.map((t) => ({ ...t, requiresSession: false }));
  return descargarArchivosConBatching(page, tasksSinSesion, options);
}
