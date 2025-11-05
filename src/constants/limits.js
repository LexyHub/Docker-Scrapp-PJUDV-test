import pLimit from "p-limit";

// esto son límites para controlar concurrencia y pjud no watee ni bloquee. Como está ahora mismo está preciso.
// esto podría mejorar o empeorar el rendimiento dependiendo de la conexión.
// no es muy util para casos únicos.
export const DOWNLOAD_LIMIT = pLimit(8); // Cuantos archivos se pueden descargar simultáneamente
export const CONCURRENT_CASES = pLimit(8); // Cuantos casos se pueden procesar simultáneamente
export const API_LIMIT = pLimit(4); // Cuantas llamadas a la API se pueden hacer simultáneamente

export const CASE_EXTRACTION_LIMIT = pLimit(10); // Aumentado de 10 a 20 para cuadernos más rápidos
export const CONCURRENCIA_LIMIT = pLimit(6);
