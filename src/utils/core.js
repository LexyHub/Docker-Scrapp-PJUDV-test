import { promises as fs } from "fs";
import { DATA_DIR, DOWNLOADS_DIR } from "../constants/directories.js";
import { logger } from "../config/logs.js";

/**
 * Normaliza un string eliminando caracteres especiales y convirtiendo a minúsculas.
 * @param {string} str - El string a normalizar.
 * @returns {string} - El string normalizado.
 */
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

/**
 * Función de delay.
 * @param {number} ms - Milisegundos a esperar.
 * @returns {Promise<void>} - Promesa que se resuelve después del delay.
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Crea las carpetas necesarias si no existen.
 * @returns {Promise<boolean>} - Verdadero si las carpetas fueron creadas o ya existían.
 * @throws {Error} - Si ocurre un error al crear las carpetas.
 */
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
