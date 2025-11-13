import { load } from "cheerio";
import crypto from "crypto";
import { secuestrarDetalleCivil } from "../utils/tokens.js";

/**
 * Función para scrapear resultados de una página en causa.
 * @param {string} html - HTML de la página a scrapear.
 * @returns {Object} Datos extraídos de la página.
 */
export function parsearPaginaConCheerio(html) {
  const htmlEnvuelto = `<table><tbody>${html}</tbody></table>`;
  const $ = load(htmlEnvuelto);
  let data = {};

  const rows = $("tr");

  rows.slice(0, -1).each((i, row) => {
    const tds = $(row).find("td");
    if (tds.length === 0) return;

    const onclickString = $(tds[0]).find("a").attr("onclick");
    const token = secuestrarDetalleCivil(onclickString);

    data = {
      id: crypto.randomUUID(),
      modal_token: token || null,
      rol: $(tds[1]).text().trim(),
      fecha_ingreso: $(tds[2]).text().trim(),
      caratulado: $(tds[3]).text().trim(),
      tribunal: $(tds[4]).text().trim(),
    };
  });

  return data;
}
