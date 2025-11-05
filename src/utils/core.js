import { promises as fs } from "fs";
import { DATA_DIR, DOWNLOADS_DIR } from "../constants/directories.js";
import { logger } from "../config/logs.js";

// funcion utilitaria nomas para formatear string y quitar caracteres espceialses
export function normalizeString(str) {
  if (!str) return "";

  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

// funcion de delay, de momento usada slo por el retry
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createFoldersIfNotExists() {
  const folders = [DATA_DIR, DOWNLOADS_DIR];
  try {
    for (const folder of folders) {
      await fs.mkdir(folder, { recursive: true });
      logger.info(`Carpeta verificada/creada: ${folder}`);
    }
    return true;
  } catch (error) {
    logger.error(`Error al crear/verificar la carpeta ${folder}:`, error);
    throw error;
  }
}
