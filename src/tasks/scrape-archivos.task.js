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
  // Para posible integración a Celery.
  const celeryTasks = [];

  if (!data.cuadernos) return [];

  // Manejar archivos únicos en el objeto principal (texto_demanda, certificado_envio, ebook)
  // Se deprecó porque es información que nunca cambia. No se eliminará por compatibilidad/necesidades futuras.
  /*
  const singleFileKeys = ["texto_demanda", "certificado_envio", "ebook"];
  for (const key of singleFileKeys) {
    const val = data[key];
    if (val && typeof val === "string" && val.startsWith("http")) {
      sumToMetadata("descargas_archivo_encoladas", 1);
      const fileId = crypto.randomUUID();
      const relativePath = path.join(fileUUID, `${fileId}.pdf`);
      const fullPath = path.join(downloadsDir, relativePath);
      tasks.push({ url: val, fullPath });
      // Reemplazar en el objeto por la ruta relativa local
      data[key] = relativePath;
    }
  }
  */

  // Manejar anexos_de_la_causa que pueden venir como [{ doc: 'url', ... }, ...]
  // Se deprecó porque es información que nunca cambia. No se eliminará por compatibilidad/necesidades futuras.
  /*
  if (Array.isArray(data.anexos_de_la_causa)) {
    for (const anexo of data.anexos_de_la_causa) {
      if (!anexo || !anexo.doc) continue;
      // caso: doc es string (url)
      if (typeof anexo.doc === "string" && anexo.doc.startsWith("http")) {
        sumToMetadata("descargas_archivo_encoladas", 1);
        const fileId = crypto.randomUUID();
        const relativePath = path.join(fileUUID, `${fileId}.pdf`);
        const fullPath = path.join(downloadsDir, relativePath);
        tasks.push({ url: anexo.doc, fullPath });
        anexo.doc = [{ name: fileId, localPath: relativePath }];
      } else if (Array.isArray(anexo.doc)) {
        // caso: doc es array de strings o array de objetos
        for (let i = 0; i < anexo.doc.length; i++) {
          const entry = anexo.doc[i];
          if (typeof entry === "string" && entry.startsWith("http")) {
            sumToMetadata("descargas_archivo_encoladas", 1);
            const fileId = crypto.randomUUID();
            const relativePath = path.join(fileUUID, `${fileId}.pdf`);
            const fullPath = path.join(downloadsDir, relativePath);
            tasks.push({ url: entry, fullPath });
            anexo.doc[i] = { name: fileId, localPath: relativePath };
          }
        }
      }
    }
  }
  */

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
              // Lo sacamos de momento, para dividir colas
              // tasks.push({
              //   url,
              //   fullPath,
              //   requiresSession: requiresSession || false,
              // });

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

/**
 * Función para descargar un archivo PDF usando streams
 * @param {string} url URL del archivo PDF a descargar
 * @param {string} rutaSalida Ruta donde se guardará el archivo descargado
 * @param {number} timeout Tiempo máximo de espera para la descarga (default: 120s para manejar latencia de servidor)
 * @returns {Promise<string>} Promesa que se resuelve con la ruta del archivo descargado
 */
function descargarPDFStream(url, rutaSalida, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(rutaSalida);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const archivo = fs.createWriteStream(rutaSalida);
    let bytesReceived = 0;

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
        Referer: "https://oficinajudicialvirtual.pjud.cl/",
      },
    };

    const req = https
      .get(options, (respuesta) => {
        if (respuesta.statusCode === 301 || respuesta.statusCode === 302) {
          if (respuesta.headers.location) {
            descargarPDFStream(respuesta.headers.location, rutaSalida, timeout)
              .then(resolve)
              .catch(reject);
            return;
          } else {
            reject(new Error("Redirección 302 sin URL de ubicación."));
            return;
          }
        }
        if (respuesta.statusCode !== 200) {
          reject(
            new Error(`HTTP ${respuesta.statusCode} - ${url.substring(0, 80)}`)
          );
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

/**
 * Función para descargar un archivo PDF usando Playwright para manejar sesiones autenticadas
 * @param {object} page Instancia de Playwright Page
 * @param {string} url URL del archivo PDF a descargar
 * @param {string} rutaSalida Ruta donde se guardará el archivo descargado
 * @param {number} timeout Tiempo máximo de espera para la descarga (default: 120s para manejar latencia de servidor)
 * @returns {Promise<string>} Promesa que se resuelve con la ruta del archivo descargado
 */
async function descargarConPlaywright(page, url, rutaSalida, timeout = 120000) {
  const dir = path.dirname(rutaSalida);
  await promiseFs.mkdir(dir, { recursive: true });

  try {
    const response = await page.request.get(url, {
      timeout,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9",
        Referer: "https://oficinajudicialvirtual.pjud.cl/",
      },
    });
    if (!response.ok()) {
      throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
    }
    const buffer = await response.body();
    await promiseFs.writeFile(rutaSalida, buffer);
    return rutaSalida;
  } catch (error) {
    try {
      await promiseFs.unlink(rutaSalida);
    } catch {}
    throw error;
  }
}

/**
 * Descarga un archivo individual con estrategias de fallback
 * @param {Object} page - Instancia de page de Playwright
 * @param {Object} task - Tarea de descarga {url, fullPath}
 * @param {number} index - Índice de la tarea para logging
 * @param {number} intentoActual - Número de intento actual (para reintentos)
 * @returns {Promise<boolean>} - true si descarga exitosa, false si falló
 */
async function descargarArchivoConReintentos(
  page,
  task,
  index,
  intentoActual = 1
) {
  const { url, fullPath, requiresSession } = task;
  const logPrefix = `[Descarga ${index}${
    intentoActual > 1 ? ` intento ${intentoActual}` : ""
  }]`;

  try {
    // Aplicar rate limiting antes de cada descarga
    await tick();

    // Solo archivos marcados explícitamente como "requiresSession" usan Playwright
    if (requiresSession) {
      logger.debug(
        `${logPrefix} Descargando con Playwright (anexo, requiere sesión): ${url.substring(
          0,
          60
        )}...`
      );
      await descargarConPlaywright(page, url, fullPath, 120000);
    } else {
      // Archivos regulares: usar stream (más rápido), sin fallback
      logger.debug(
        `${logPrefix} Descargando con Stream: ${url.substring(0, 60)}...`
      );
      await descargarPDFStream(url, fullPath, 120000);
    }

    // sumToMetadata("descargas_exitosas", 1);
    return true;
  } catch (error) {
    // Logging detallado según el tipo de error
    if (error.message.includes("403") || error.message.includes("401")) {
      logger.error(
        `${logPrefix} HTTP ${
          error.message.match(/\d{3}/)?.[0] || "403/401"
        } - Acceso denegado | URL: ${url}`
      );
      sumToMetadata("descargas_403_401", 1);
    } else if (
      error.message.includes("Timeout") ||
      error.message.includes("timeout")
    ) {
      logger.error(`${logPrefix} TIMEOUT | URL: ${url}`);
      sumToMetadata("descargas_timeout", 1);
    } else {
      logger.error(`${logPrefix} ${error.message} | URL: ${url}`);
    }
    return false;
  }
}

/**
 * Descarga archivos que requieren sesión autenticada (anexos) usando Playwright
 * @param {Object} page - Instancia de page de Playwright
 * @param {Array} tasks - Array de tareas de descarga que requieren sesión
 * @param {Object} options - Opciones de configuración
 * @returns {Promise<Object>} - Estadísticas de descarga
 */
export async function descargarArchivosConSesion(page, tasks, options = {}) {
  const {
    concurrencia = 5, // Playwright es más pesado, menos concurrencia
    batchSize = 15,
    delayEntreLotes = 50,
    maxReintentos = 2,
  } = options;

  if (!tasks || tasks.length === 0) {
    return { exitosas: 0, fallidas: 0, total: 0, archivosFallidos: [] };
  }

  const totalArchivos = tasks.length;
  let exitosas = 0;
  const archivosFallidos = [];

  logger.info(
    `[Descargas con Sesión] Iniciando descarga de ${totalArchivos} archivos (${concurrencia} en paralelo, lotes de ${batchSize})`
  );

  const lotes = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    lotes.push(tasks.slice(i, i + batchSize));
  }

  for (let loteIdx = 0; loteIdx < lotes.length; loteIdx++) {
    const lote = lotes[loteIdx];
    const loteNum = loteIdx + 1;

    logger.info(
      `[Descargas con Sesión] Procesando lote ${loteNum}/${lotes.length} (${lote.length} archivos)...`
    );

    const promesas = lote.map((task, idx) => {
      const globalIdx = loteIdx * batchSize + idx + 1;
      return (async () => {
        const exito = await descargarArchivoConReintentos(
          page,
          { ...task, requiresSession: true },
          globalIdx,
          1
        );
        if (exito) {
          exitosas++;
        } else {
          archivosFallidos.push(task);
        }
      })();
    });

    await Promise.all(promesas);

    if (loteIdx < lotes.length - 1 && delayEntreLotes > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayEntreLotes));
    }
  }

  // Fase de reintentos
  if (archivosFallidos.length > 0 && maxReintentos > 0) {
    logger.warn(
      `[Descargas con Sesión] ${archivosFallidos.length} archivos fallaron. Iniciando reintentos...`
    );

    for (let intento = 2; intento <= maxReintentos + 1; intento++) {
      const porReintentar = [...archivosFallidos];
      archivosFallidos.length = 0;

      const promesasReintento = porReintentar.map((task, idx) => {
        return (async () => {
          await new Promise((resolve) => setTimeout(resolve, intento * 100));
          const exito = await descargarArchivoConReintentos(
            page,
            { ...task, requiresSession: true },
            idx + 1,
            intento
          );
          if (exito) {
            exitosas++;
          } else {
            archivosFallidos.push(task);
          }
        })();
      });

      await Promise.all(promesasReintento);

      if (archivosFallidos.length === 0) break;
    }
  }

  const fallidas = archivosFallidos.length;
  logger.info(
    `[Descargas con Sesión] Completado: ${exitosas}/${totalArchivos} exitosas, ${fallidas} fallidas`
  );

  return { exitosas, fallidas, total: totalArchivos, archivosFallidos };
}

/**
 * Descarga archivos celery (sin sesión) usando stream puro - optimizado para velocidad
 * @param {Array} tasks - Array de tareas de descarga sin sesión requerida
 * @param {Object} options - Opciones de configuración
 * @returns {Promise<Object>} - Estadísticas de descarga
 */
export async function descargarArchivosCelery(tasks, options = {}) {
  const {
    concurrencia = 50, // Sin pLimit, solo rate limit global
    batchSize = 100,
    delayEntreLotes = 0,
    maxReintentos = 2,
  } = options;

  if (!tasks || tasks.length === 0) {
    return { exitosas: 0, fallidas: 0, total: 0, archivosFallidos: [] };
  }

  const totalArchivos = tasks.length;
  let exitosas = 0;
  const archivosFallidos = [];

  logger.info(
    `[Descargas Celery/Stream] Iniciando descarga de ${totalArchivos} archivos (rate limit global activo)`
  );

  const lotes = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    lotes.push(tasks.slice(i, i + batchSize));
  }

  for (let loteIdx = 0; loteIdx < lotes.length; loteIdx++) {
    const lote = lotes[loteIdx];
    const loteNum = loteIdx + 1;

    logger.info(
      `[Descargas Celery] Procesando lote ${loteNum}/${lotes.length} (${lote.length} archivos)...`
    );

    // Ejecutar todas en paralelo, el rate limit controla la velocidad
    const promesas = lote.map((task, idx) => {
      const globalIdx = loteIdx * batchSize + idx + 1;
      return (async () => {
        const exito = await descargarArchivoConReintentos(
          null, // No page para stream
          { ...task, requiresSession: false },
          globalIdx,
          1
        );
        if (exito) {
          exitosas++;
        } else {
          archivosFallidos.push(task);
        }
      })();
    });

    await Promise.all(promesas);
  }

  // Fase de reintentos
  if (archivosFallidos.length > 0 && maxReintentos > 0) {
    logger.warn(
      `[Descargas Celery] ${archivosFallidos.length} archivos fallaron. Iniciando reintentos...`
    );

    for (let intento = 2; intento <= maxReintentos + 1; intento++) {
      const porReintentar = [...archivosFallidos];
      archivosFallidos.length = 0;

      const promesasReintento = porReintentar.map((task, idx) => {
        return (async () => {
          await new Promise((resolve) => setTimeout(resolve, intento * 100));
          const exito = await descargarArchivoConReintentos(
            null,
            { ...task, requiresSession: false },
            idx + 1,
            intento
          );
          if (exito) {
            exitosas++;
          } else {
            archivosFallidos.push(task);
          }
        })();
      });

      await Promise.all(promesasReintento);

      if (archivosFallidos.length === 0) break;
    }
  }

  const fallidas = archivosFallidos.length;
  logger.info(
    `[Descargas Celery] Completado: ${exitosas}/${totalArchivos} exitosas, ${fallidas} fallidas`
  );

  return { exitosas, fallidas, total: totalArchivos, archivosFallidos };
}

// Función legacy descargarArchivosConBatching eliminada - usar descargarArchivosConSesion
