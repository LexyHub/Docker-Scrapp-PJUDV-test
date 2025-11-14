import { exportLogs, logger } from "./config/logs.js";
import { getCausas } from "./services/casos.service.js";
import {
  getAllMetadata,
  setMetadata,
  sumToMetadata,
} from "./services/metadata.service.js";
import { createBrowserInstance } from "./utils/browser.js";
import { createFoldersIfNotExists, normalizeString } from "./utils/core.js";
import { CONCURRENCIA_LIMIT } from "./constants/limits.js";
import {
  scrapeCausaTask,
  configureRateLimit,
} from "./tasks/scrape-causa.task.js";
import { retry } from "./utils/retry.js";
import { scrapeModalTask } from "./tasks/scrape-modal.task.js";
import { secuestrarToken } from "./utils/tokens.js";
import {
  collectFileTasks,
  descargarArchivosConBatching,
} from "./tasks/scrape-archivos.task.js";
import { DATA_DIR, DOWNLOADS_DIR } from "./constants/directories.js";
import { promises as fs } from "fs";
import path from "path";
import { getAllHashes } from "./services/hash.service.js";
import db from "./services/db.service.js";

let TOKEN;
const BD_LIMIT = 200; // Sólo para probar benchmarking

async function main() {
  await createFoldersIfNotExists();

  // Configurar rate limiting para scrape-causa (opcional)
  configureRateLimit({ requestsPerBatch: 15, delayMs: 500 });

  logger.info("--- Fase 0: Obtención de Casos y Browser ---");
  const casos = await getCausas({ limit: BD_LIMIT, applyHash: true });
  try {
    await fs.writeFile(
      "data/casos.json",
      JSON.stringify(casos, null, 2),
      "utf-8"
    );
  } catch {}
  setMetadata("total_casos", casos.length);
  logger.info(`Causas obtenidas: ${casos.length}`);

  const { browser, context, page } = await createBrowserInstance(true);
  logger.info("Página principal cargada y lista.");

  // Secuestrar TOKEN global
  const f = await page.evaluate(() => window.detalleCausaCivil.toString());
  TOKEN = secuestrarToken(f);
  logger.info(`TOKEN secuestrado: ${TOKEN}`);
  logger.info("--- Fase 0 Completada ---");

  // const casos = rawCasos.map(transformCaso);

  logger.info(`Iniciando ${casos.length} tareas...`);
  const initialTiming = new Date().getTime();

  // Fase 1: obtencion de data de tabla
  logger.info("--- Etapa 1: Task de Scraping de Causas ---");
  logger.info(
    "Iniciando tareas concurrentes con límite de:",
    CONCURRENCIA_LIMIT.concurrency
  );
  logger.info(`Total de HASHES: ${getAllHashes().length}`);
  sumToMetadata("movimientos_por_procesar", getAllHashes().length);
  const fase1Start = new Date().getTime();
  const tasksTabla = casos.map((formData, index) => {
    const causaId = crypto.randomUUID();

    return CONCURRENCIA_LIMIT(() =>
      // llenamos los forms y extraemos el caso
      retry(() => scrapeCausaTask(page, formData, index + 1, causaId), 3, 2000)
    );
  });
  const resultadosTablas = await Promise.all(tasksTabla);
  const todosLosCasos = resultadosTablas
    .filter((r) => r !== null && r.data)
    .flatMap((r) => r.data);
  const fase1End = new Date().getTime();
  setMetadata("tiempo_fase_1", `${(fase1End - fase1Start) / 1000}s`);
  // // console.clear();
  logger.info("--- Etapa 1 Completada ---");
  logger.info(`Se obtuvieron ${resultadosTablas.length} resultados de tablas.`);
  logger.info(
    `Se realizarán las siguientes tareas ${todosLosCasos.length} casos.`
  );

  // Fase 2: obtencion de detalles por cada caso
  logger.info("--- Etapa 2: Task de Scraping de Detalles (Modales) ---");
  logger.info(
    "Iniciando tareas concurrentes con límite de:",
    CONCURRENCIA_LIMIT.concurrency
  );
  const fase2Start = new Date().getTime();
  const tasksModales = todosLosCasos.map((casoData, index) => {
    return CONCURRENCIA_LIMIT(() =>
      retry(() => scrapeModalTask(page, casoData, TOKEN, index + 1), 3, 2000)
    );
  });
  const resultadosFinales = await Promise.all(tasksModales);
  const casosCompletos = resultadosFinales
    .filter((r) => r !== null)
    .map((r) => ({ ...r.data, id: crypto.randomUUID() }));
  const fase2End = new Date().getTime();
  setMetadata("tiempo_fase_2", `${(fase2End - fase2Start) / 1000}s`);
  // console.clear();
  logger.info("--- Etapa 2 Completada ---");
  logger.info(`Se completaron ${casosCompletos.length} casos con detalles.`);

  // fase 3: recolecion de archivos
  // console.clear();
  logger.info("--- Etapa 3: Recolección de Tareas de Descarga de Archivos ---");
  const fase3Start = new Date().getTime();

  // Recolectar tareas y separar entre normales y celery
  const taskResults = casosCompletos.map((caso) => {
    return collectFileTasks(caso, caso.id, DOWNLOADS_DIR, normalizeString);
  });

  // Separar las tareas normales de las de celery
  const allFileTasks = taskResults.flatMap((result) => result.tasks);
  const allCeleryTasks = taskResults.flatMap((result) => result.celeryTasks);

  const fase3End = new Date().getTime();
  setMetadata("tiempo_fase_3", `${(fase3End - fase3Start) / 1000}s`);
  logger.info(
    `Se recolectaron ${allFileTasks.length} archivos para descarga local y ${allCeleryTasks.length} archivos para descarga en Celery.`
  );
  logger.info("--- Etapa 3 Completada ---");

  //fase 4: descarga de archivos
  // console.clear();
  logger.info("--- Etapa 4: Descarga de Archivos ---");
  const fase4Start = new Date().getTime();
  let estadisticasDescarga = { exitosas: 0, fallidas: 0, total: 0 };
  const mergedTasks = [...allFileTasks, ...allCeleryTasks];
  logger.info("Total de archivos a descargar:", mergedTasks.length);

  if (mergedTasks.length > 0) {
    // Usar el nuevo sistema de descarga con batching y reintentos
    // Stream es mucho más rápido que Playwright, podemos ser más agresivos
    estadisticasDescarga = await descargarArchivosConBatching(
      page,
      mergedTasks,
      {
        concurrencia: 15, // 15 descargas simultáneas con stream
        batchSize: 50, // 100 archivos por lote
        delayEntreLotes: 5, // 5ms de espera entre lotes
        maxReintentos: 2, // 2 reintentos adicionales para archivos fallidos
      }
    );

    setMetadata("descargas_de_archivo_exitosas", estadisticasDescarga.exitosas);
    setMetadata("descargas_de_archivo_fallidas", estadisticasDescarga.fallidas);
  } else {
    logger.info("No se encontraron archivos para descargar.");
  }
  const fase4End = new Date().getTime();
  setMetadata("tiempo_fase_4", `${(fase4End - fase4Start) / 1000}s`);
  logger.info("--- Etapa 4 Completada ---");
  logger.info(
    `Tasa de éxito: ${
      estadisticasDescarga.total > 0
        ? (
            (estadisticasDescarga.exitosas / estadisticasDescarga.total) *
            100
          ).toFixed(1)
        : 0
    }%`
  );

  // Fase 5 guardar data
  // console.clear();
  logger.info("--- Etapa 5: Guardar Datos ---");
  const fase5Start = new Date().getTime();
  const trabajosGuardado = casosCompletos.map(async (caso) => {
    const fileName = caso.id + ".json";
    const fullPath = path.join(DATA_DIR, fileName);
    try {
      await fs.writeFile(fullPath, JSON.stringify(caso, null, 2), "utf-8");
      logger.info(`Datos guardados para el caso ${caso.id} en ${fullPath}`);
    } catch (error) {
      logger.error(
        `Error al guardar datos para el caso ${caso.id}: ${error.message}`
      );
    }
  });
  await Promise.allSettled(trabajosGuardado);
  const fase5End = new Date().getTime();
  setMetadata("tiempo_fase_5", `${(fase5End - fase5Start) / 1000}s`);
  logger.info("--- Etapa 5 Completada: Guardar Datos ---");

  // console.clear();
  const finalTiming = new Date().getTime();
  logger.info("--- Scraping Completado ---");
  console.log();
  logger.info("Metadatos:");
  const metadata = getAllMetadata();
  for (const [key, value] of Object.entries(metadata)) {
    logger.info(`- ${key.replaceAll("_", " ")}: ${value}`);
  }
  console.log();
  logger.info(`Tiempo total: ${(finalTiming - initialTiming) / 1000}s`);

  exportLogs();

  await context.close();
  await browser.close();
  await db.close();
  process.exit(0);
}

main();
