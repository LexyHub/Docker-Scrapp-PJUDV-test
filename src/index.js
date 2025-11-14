import { exportLogs, logger } from "./config/logs.js";
import { getCausas } from "./services/casos.service.js";
import { getAllMetadata, setMetadata } from "./services/metadata.service.js";
import { createBrowserInstance } from "./utils/browser.js";
import { createFoldersIfNotExists, normalizeString } from "./utils/core.js";
import { configureRateLimit } from "./tasks/scrape-causa.task.js";
import { secuestrarToken } from "./utils/tokens.js";
import { ejecutarFaseDescargas } from "./tasks/scrape-descargas.task.js";
import { ejecutarFaseCausas } from "./tasks/scrape-fase1.task.js";
import {
  ejecutarFaseModales,
  ejecutarFaseGuardado,
} from "./tasks/scrape-fase2.task.js";
import { ejecutarFaseRecoleccion } from "./tasks/scrape-fase3.task.js";
import { DATA_DIR, DOWNLOADS_DIR } from "./constants/directories.js";
import { promises as fs } from "fs";
import db from "./services/db.service.js";

let TOKEN;
const BD_LIMIT = 200; // Sólo para probar benchmarking

async function main() {
  await createFoldersIfNotExists();

  // Configurar rate limiting para scrape-causa (opcional)
  configureRateLimit({ requestsPerBatch: 10, delayMs: 1000 });

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

  logger.info(`Iniciando procesamiento de ${casos.length} causas...`);
  const initialTiming = new Date().getTime();

  // Fase 1: Scraping de causas
  const todosLosCasos = await ejecutarFaseCausas(page, casos);

  // Fase 2: Scraping de modales (cuadernos, anexos, notificaciones)
  const casosCompletos = await ejecutarFaseModales(
    page,
    todosLosCasos,
    TOKEN,
    DATA_DIR,
    normalizeString
  );

  // Fase 3: Recolección de tareas de descarga
  const { allFileTasks, allCeleryTasks } = await ejecutarFaseRecoleccion(
    casosCompletos,
    DOWNLOADS_DIR,
    normalizeString
  );

  // Fase 4: Descarga de archivos (4A, 4B, 4C)
  const resultadoDescargas = await ejecutarFaseDescargas(
    page,
    allFileTasks,
    allCeleryTasks
  );

  setMetadata(
    "descargas_de_archivo_exitosas",
    resultadoDescargas.estadisticas.exitosas
  );
  setMetadata(
    "descargas_de_archivo_fallidas",
    resultadoDescargas.estadisticas.fallidas
  );
  setMetadata("tiempo_fase_4", `${resultadoDescargas.duracion.toFixed(1)}s`);

  // Fase 5: Guardar casos completos en archivos JSON
  await ejecutarFaseGuardado(casosCompletos, DATA_DIR, normalizeString);

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
