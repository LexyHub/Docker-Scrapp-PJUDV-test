import db from "./db.service.js";
import { movimientoHash } from "../utils/hashing.js";
import { addHash } from "./hash.service.js";

/**
 * Función para formatear fechas de distintos tipos a formato DD/MM/YYYY
 * @param {*} value
 * @returns {string} Fecha formateada o cadena vacía si no es válida
 */
function formatDateDDMMYYYY(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    if (m) {
      const [, y, mo, d] = m;
      return `${d}/${mo}/${y}`;
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Query a causas (from sistema_monitoreo.causas) integrado con movimientos.
 * Utiliza una sola consulta segura con LIMIT opcional para pruebas.
 * Devuelve un array de objetos:
 * {
 *   rol,
 *   caratulado,
 *   tribunal,
 *   id_casetracking,
 *   rol_tribunal_hash,
 *   fecha_ingreso,
 *   movimientos: [ { desc_tramite, tramite, folio, etapa, cuaderno, fecha_movimiento }, ... ]
 * }
 *
 * @param {Object} limit - Número máximo de causas a obtener (opcional)
 * @param {boolean} applyHash - Si es true, añade un hash a cada movimiento. El hash consiste en  desc_tramite, folio, fecha_movimiento.
 * @returns {Promise<Array>} Array de causas con movimientos integrados y con hash opcional.
 */
export async function getCausas({ limit = null, applyHash = true }) {
  const baseSql = `
    SELECT
      c.rol,
      c.caratulado,
      t.tribunal,
      c.corte_apelaciones,
      t.id_casetracking,
      c.rol_tribunal_hash,
      c.fecha_ingreso,
      COALESCE(m.movimientos, '[]') AS movimientos
    FROM sistema_monitoreo.causas AS c
    LEFT JOIN sistema_monitoreo.tribunales AS t
      ON c.id_tribunal = t.id   -- ajusta si la PK se llama distinto
    LEFT JOIN LATERAL (
      SELECT json_agg(
        json_build_object(
          'desc_tramite', mv.desc_tramite,
          'tramite', mv.tramite,
          'folio', mv.folio,
          'etapa', mv.etapa,
          'cuaderno', mv.cuaderno,
          'fecha_movimiento', mv.fecha_movimiento
        ) ORDER BY mv.fecha_movimiento
      ) AS movimientos
      FROM sistema_monitoreo.movimientos mv
      WHERE mv.rol_tribunal_hash = c.rol_tribunal_hash
    ) m ON true
   WHERE c.estado_tracking_nepal = true
     OR c.estado_tracking_casetracking = true
  `;

  let sql = baseSql;
  const params = [];
  if (Number.isInteger(limit) && limit > 0) {
    sql += "\nLIMIT $1";
    params.push(limit);
  }
  const res = await db.query(sql, params);
  if (applyHash) {
    res.rows.forEach((causa) => {
      const [libro, rol, año] = causa.rol.split("-");
      causa.libro = libro;
      causa.rol = rol;
      causa.año = año;
      causa.movimientos = causa.movimientos.map((mv) => {
        const fecha_movimiento_fmt = formatDateDDMMYYYY(mv.fecha_movimiento);
        const hash = movimientoHash({
          ...mv,
          fecha_movimiento: fecha_movimiento_fmt,
        });
        // agregamos el hash al almacenamiento en memoria
        addHash(hash);
        return {
          ...mv,
          fecha_movimiento: fecha_movimiento_fmt,
          hash,
        };
      });
    });
    return res.rows;
  }
  return res.rows;
}

/*
ESQUEMA DE RESPUESTA (ejemplo):
[
  {
    rol: '...',
    caratulado: '...',
    corte_apelaciones: '...',
    tribunal: '...',
    id_casetracking: '...',
    rol_tribunal_hash: '...',
    fecha_ingreso: '2025-11-05T...',
    movimientos: [ { desc_tramite: '...', tramite: '...', folio: '...', etapa: '...', cuaderno: '...', fecha_movimiento: '...' }, ... ]
  }
]
*/

export default {
  getCausas,
};
