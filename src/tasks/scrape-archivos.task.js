import { logger } from "../config/logs.js";
import { sumToMetadata } from "../services/metadata.service.js";
import https from "https";
import { promises as promiseFs } from "fs";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import pLimit from "p-limit";

export function collectFileTasks(
  data,
  fileUUID,
  downloadsDir,
  _normalizeString
) {
  const tasks = [];
  if (!data.cuadernos) return [];

  // Manejar archivos únicos en el objeto principal (texto_demanda, certificado_envio, ebook)
  const singleFileKeys = ["texto_demanda", "certificado_envio", "ebook"];
  for (const key of singleFileKeys) {
    const val = data[key];
    if (val && typeof val === "string" && val.startsWith("http")) {
      sumToMetadata("archivos", 1);
      const fileId = crypto.randomUUID();
      const relativePath = path.join(fileUUID, `${fileId}.pdf`);
      const fullPath = path.join(downloadsDir, relativePath);
      tasks.push({ url: val, fullPath });
      // Reemplazar en el objeto por la ruta relativa local
      data[key] = relativePath;
    }
  }

  // Manejar anexos_de_la_causa que pueden venir como [{ doc: 'url', ... }, ...]
  if (Array.isArray(data.anexos_de_la_causa)) {
    for (const anexo of data.anexos_de_la_causa) {
      if (!anexo || !anexo.doc) continue;
      // caso: doc es string (url)
      if (typeof anexo.doc === "string" && anexo.doc.startsWith("http")) {
        sumToMetadata("archivos", 1);
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
            sumToMetadata("archivos", 1);
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
            sumToMetadata("archivos", cellData.length);
            for (const fileInfo of cellData) {
              const { name: fileId, url, requiresSession } = fileInfo;
              const relativePath = path.join(fileUUID, `${fileId}.pdf`);
              const fullPath = path.join(downloadsDir, relativePath);
              tasks.push({
                url,
                fullPath,
                requiresSession: requiresSession || false,
              });

              fileInfo.localPath = relativePath;
              delete fileInfo.url;
              delete fileInfo.requiresSession;
            }
          }

          if (
            Array.isArray(cellData) &&
            cellData.length > 0 &&
            cellData[0].doc &&
            Array.isArray(cellData[0].doc)
          ) {
            for (const anexoItem of cellData) {
              if (Array.isArray(anexoItem.doc)) {
                sumToMetadata("archivos", anexoItem.doc.length);
                for (const fileInfo of anexoItem.doc) {
                  if (fileInfo.url) {
                    const { name: fileId, url, requiresSession } = fileInfo;
                    const relativePath = path.join(fileUUID, `${fileId}.pdf`);
                    const fullPath = path.join(downloadsDir, relativePath);
                    tasks.push({
                      url,
                      fullPath,
                      requiresSession: requiresSession || false,
                    });

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
  return tasks;
}

function descargarPDFStream(url, rutaSalida, timeout = 15000) {
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
            new Error(`Error ${respuesta.statusCode} al descargar ${url}`)
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

async function descargarConPlaywright(page, url, rutaSalida, timeout = 30000) {
  const dir = path.dirname(rutaSalida);
  await promiseFs.mkdir(dir, { recursive: true });

  try {
    const response = await page.request.get(url, { timeout });
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
    // Solo archivos marcados explícitamente como "requiresSession" usan Playwright
    if (requiresSession) {
      logger.debug(
        `${logPrefix} Descargando con Playwright (anexo, requiere sesión): ${url.substring(
          0,
          60
        )}...`
      );
      await descargarConPlaywright(page, url, fullPath, 30000);
    } else {
      // Archivos regulares: usar stream (más rápido), sin fallback
      logger.debug(
        `${logPrefix} Descargando con Stream: ${url.substring(0, 60)}...`
      );
      await descargarPDFStream(url, fullPath, 15000);
    }

    sumToMetadata("descargas_exitosas", 1);
    return true;
  } catch (error) {
    logger.error(
      `${logPrefix} Error: ${error.message} | URL: ${url.substring(0, 60)}`
    );
    sumToMetadata("descargas_fallidas", 1);
    return false;
  }
}

/**
 * Sistema de descarga masiva con control de concurrencia, batching y reintentos
 * @param {Object} page - Instancia de page de Playwright
 * @param {Array} tasks - Array de tareas de descarga
 * @param {Object} options - Opciones de configuración
 * @returns {Promise<Object>} - Estadísticas de descarga
 */
export async function descargarArchivosConBatching(page, tasks, options = {}) {
  const {
    concurrencia = 8, // Descargas simultáneas
    batchSize = 20, // Archivos por lote
    delayEntreLotes = 40, // ms entre lotes
    maxReintentos = 2, // Reintentos por archivo
  } = options;

  if (!tasks || tasks.length === 0) {
    logger.info("[Descargas] No hay archivos para descargar.");
    return { exitosas: 0, fallidas: 0, total: 0 };
  }

  const limit = pLimit(concurrencia);
  const totalArchivos = tasks.length;
  let exitosas = 0;
  let fallidas = 0;
  const archivosFallidos = [];

  logger.info(
    `[Descargas] Iniciando descarga de ${totalArchivos} archivos (${concurrencia} concurrentes, lotes de ${batchSize})`
  );

  // Dividir en lotes
  const lotes = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    lotes.push(tasks.slice(i, i + batchSize));
  }

  // Procesar lotes secuencialmente
  for (let loteIdx = 0; loteIdx < lotes.length; loteIdx++) {
    const lote = lotes[loteIdx];
    const loteNum = loteIdx + 1;

    logger.info(
      `[Descargas] Procesando lote ${loteNum}/${lotes.length} (${lote.length} archivos)...`
    );

    // Procesar archivos del lote en paralelo con límite de concurrencia
    const promesas = lote.map((task, idx) => {
      const globalIdx = loteIdx * batchSize + idx + 1;
      return limit(async () => {
        const exito = await descargarArchivoConReintentos(
          page,
          task,
          globalIdx,
          1
        );
        if (exito) {
          exitosas++;
        } else {
          archivosFallidos.push(task);
        }
      });
    });

    await Promise.all(promesas);

    // Delay entre lotes (excepto el último)
    if (loteIdx < lotes.length - 1 && delayEntreLotes > 0) {
      logger.debug(
        `[Descargas] Esperando ${delayEntreLotes}ms antes del siguiente lote...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayEntreLotes));
    }
  }

  // === FASE DE REINTENTOS ===
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

      // Reintentar con menor concurrencia (más conservador)
      const limitReintento = pLimit(Math.max(3, Math.floor(concurrencia / 2)));

      const promesasReintento = porReintentar.map((task, idx) => {
        return limitReintento(async () => {
          // Esperar un poco antes de reintentar (backoff)
          await new Promise((resolve) => setTimeout(resolve, intento * 100));

          const exito = await descargarArchivoConReintentos(
            page,
            task,
            idx + 1,
            intento
          );
          if (exito) {
            exitosas++;
          } else {
            archivosFallidos.push(task); // Volver a agregar a fallidos
          }
        });
      });

      await Promise.all(promesasReintento);

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
      `[Descargas] ⚠️  ${fallidas} archivos NO se pudieron descargar tras ${maxReintentos} reintentos:`
    );
    archivosFallidos.slice(0, 5).forEach((task) => {
      logger.error(`  - ${task.url.substring(0, 80)}`);
    });
    if (fallidas > 5) {
      logger.error(`  ... y ${fallidas - 5} más.`);
    }
  }

  return { exitosas, fallidas, total: totalArchivos, archivosFallidos };
}
