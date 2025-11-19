import { logger } from "../config/logs.js";
import { tick } from "../utils/rateLimiter.js";
import { retry } from "../utils/retry.js";
import { promises as fs } from "fs";
import path from "path";

const PDF_SIGNATURE = Buffer.from("%PDF-");

/**
 * Recopila tareas de descargas
 */
export function collectFileTasks(data, fileUUID, downloadsDir) {
  const tasks = [];
  const celeryTasks = [];

  if (!data.cuadernos) return { tasks, celeryTasks };

  const processFiles = (fileList) => {
    for (const fileInfo of fileList) {
      if (fileInfo.url) {
        const { name: fileId, url, requiresSession } = fileInfo;
        const relativePath = path.join(fileUUID, `${fileId}.pdf`);
        const fullPath = path.join(downloadsDir, relativePath);

        const taskObj = { url, fullPath };

        if (requiresSession) {
          tasks.push({ ...taskObj, requiresSession: true });
        } else {
          celeryTasks.push({ ...taskObj, requiresSession: false });
        }
        fileInfo.localPath = relativePath;
        delete fileInfo.url;
        delete fileInfo.requiresSession;
      }
    }
  };

  for (const cuadernoName in data.cuadernos) {
    const cuaderno = data.cuadernos[cuadernoName];
    for (const tablaKey in cuaderno) {
      const tabla = cuaderno[tablaKey];
      if (!Array.isArray(tabla)) continue;

      for (const row of tabla) {
        for (const cellKey in row) {
          const cellData = row[cellKey];
          if (Array.isArray(cellData) && cellData.length > 0) {
            if (cellData[0].url) processFiles(cellData);
            if (cellData[0].doc) {
              for (const anexo of cellData) {
                if (Array.isArray(anexo.doc)) processFiles(anexo.doc);
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
 * Descarga, limpia el PDF si es necesario y lanza error si falla.
 * No tiene logs de reintento ni catch, eso lo maneja 'retry'.
 */
async function _descargarYReparar(url, rutaSalida, headers, timeout = 30000) {
  const dir = path.dirname(rutaSalida);
  await fs.mkdir(dir, { recursive: true });

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const startOffset = buffer.indexOf(PDF_SIGNATURE);

    if (startOffset === -1) {
      const preview = buffer.subarray(0, 100).toString("utf-8");
      if (preview.includes("<html") || preview.includes("<!DOCTYPE")) {
        throw new Error("Contenido es HTML (posible sesión inválida), no PDF.");
      }
      throw new Error("Firma PDF no encontrada.");
    }

    const cleanBuffer =
      startOffset === 0 ? buffer : buffer.subarray(startOffset);
    await fs.writeFile(rutaSalida, cleanBuffer);

    return true;
  } catch (error) {
    try {
      await fs.unlink(rutaSalida);
    } catch (e) {}
    throw error;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Implementa Rate Limiter + Retry + Manejo de Headers
 */
async function descargarUnArchivo(task, globalHeaders = {}, maxReintentos) {
  const { url, fullPath, requiresSession } = task;
  const logPrefix = requiresSession ? "[Sesion]" : "[Celery]";

  const headers = requiresSession
    ? globalHeaders
    : {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "application/pdf",
      };

  try {
    await tick();

    await retry(
      () => _descargarYReparar(url, fullPath, headers),
      maxReintentos,
      2000
    );

    return true;
  } catch (error) {
    const msg = error.message || "";
    if (msg.includes("403"))
      logger.warn(`${logPrefix} ⛔ 403 Forbidden: ${url}`);
    else if (msg.includes("404"))
      logger.warn(`${logPrefix} 🚫 404 Not Found: ${url}`);
    else logger.error(`${logPrefix} ❌ Falló definitivamente: ${msg} | ${url}`);

    return false;
  }
}

/**
 * orquestador de descargas
 */
export async function descargarArchivosConBatching(tasks, options = {}) {
  const { maxReintentos = 3, headers = {} } = options;

  if (!tasks || tasks.length === 0)
    return { exitosas: 0, fallidas: 0, total: 0 };

  const validTasks = tasks.filter((t) => t?.url?.length > 0);
  const total = validTasks.length;
  const archivosFallidos = [];
  let exitosas = 0;

  logger.info(
    `[Descargas] Procesando ${total} archivos con maxReintentos=${maxReintentos}`
  );

  for (let i = 0; i < total; i++) {
    const task = validTasks[i];

    const exito = await descargarUnArchivo(task, headers, maxReintentos);

    if (exito) {
      exitosas++;
    } else {
      archivosFallidos.push(task);
    }

    if ((i + 1) % 50 === 0)
      logger.info(`[Progreso] ${i + 1}/${total} completados...`);
  }

  return {
    exitosas,
    fallidas: archivosFallidos.length,
    total,
    archivosFallidos,
  };
}

export async function descargarArchivoConReintentos(tasks, options = {}) {
  return descargarArchivosConBatching(tasks, options);
}

export async function descargarPDFStream(tasks, options = {}) {
  return descargarArchivosConBatching(tasks, options);
}

export async function getAuthHeaders(page) {
  try {
    const context = page.context();
    const cookies = await context.cookies();
    const ua = await page.evaluate(() => navigator.userAgent);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    return {
      Cookie: cookieHeader,
      "User-Agent": ua,
      Referer: "https://oficinajudicialvirtual.pjud.cl/",
      Accept: "application/pdf,application/octet-stream",
    };
  } catch (e) {
    logger.error("Error extrayendo headers:", e);
    return {};
  }
}
