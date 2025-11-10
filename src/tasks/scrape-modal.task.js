import { load } from "cheerio";
import { retry } from "../utils/retry.js";
import {
  secuestrarFuncToken,
  secuestrarTokenInfoNotificacionesRec,
} from "../utils/tokens.js";
import { normalizeString } from "../utils/core.js";
import { CASE_EXTRACTION_LIMIT } from "../constants/limits.js";
import crypto from "crypto";
import { extractAnexoModal, scrapDataFromAnexo } from "./scrape-anexo.task.js";

/**
 * Realiza una petición POST para extraer el HTML (texto) del modal de una causa civil.
 * Implementa reintentos en caso de fallo.
 * @param {Object} page - Instancia de Playwright Page.
 * @param {string} tokenCausa - Token específico de la causa para la petición.
 * @param {string} tokenGlobal - Token global de sesión anónima para la petición.
 * @returns {Promise<string|null>} HTML del modal o null en caso de error.
 */
async function extractModal(page, tokenCausa, tokenGlobal) {
  const URL =
    "https://oficinajudicialvirtual.pjud.cl/ADIR_871/civil/modal/causaCivil.php";
  const params = new URLSearchParams();
  params.append("dtaCausa", tokenCausa);
  params.append("token", tokenGlobal);

  try {
    const html = await retry(
      async () => {
        const response = await page.request.post(URL, {
          data: params.toString(),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Cache-Control": "no-cache",
          },
          timeout: 60000,
        });
        if (!response.ok()) {
          throw new Error(`Respuesta no OK: ${response.status()}`);
        }
        return await response.text();
      },
      3,
      1000
    );
    return html;
  } catch (err) {
    // usar tokenCausa en lugar de una variable fuera de alcance
    console.error(
      `[API Fetch] Error final en page.request para ${tokenCausa}: ${err.message}`
    );
    return null;
  }
}

/**
 * Función para obtener datos del modal e info. notificaciones receptor.
 * @param {object} page Instancia de Playwright Page.
 * @param {string} modalHtml HTML del modal.
 * @param {string} TOKEN Token global de sesión anónima.
 * @param {object} preScrapedData Datos pre-scrapeados.
 * @returns {Promise<object>} Datos iniciales del modal y promesas para scrapeo de cuadernos
 */
async function getDataAndCuadernos(page, modalHtml, TOKEN) {
  // (parsearDatosModal eliminado por limpieza de código muerto)
  const $ = load(modalHtml);

  const cuadernos = $("#selCuaderno option")
    .map((_, el) => ({
      text: $(el).text().trim(),
      value: $(el).attr("value")?.trim(),
    }))
    .get()
    .filter((o) => o.value && o.text);

  const cuadernosFetch = cuadernos.map(({ text, value }) => {
    return CASE_EXTRACTION_LIMIT(async () => {
      const html = await extractModal(page, value, TOKEN);
      return { cuaderno: text, html };
    });
  });

  const infoNotificacionesReceptorModalToken =
    $(".panel.panel-default")
      .eq(1)
      .find("table td")
      .eq(1)
      .find("a")
      .attr("onclick") || "";
  const infoNotificacionesReceptorToken = secuestrarTokenInfoNotificacionesRec(
    infoNotificacionesReceptorModalToken
  );
  const infoNotificacionesReceptorHtml =
    await extractInfoNotificacionesReceptor(
      page,
      infoNotificacionesReceptorToken
    );
  const info_notificaciones_receptor = scrapeInfoNotificacionesReceptor(
    infoNotificacionesReceptorHtml
  );

  // return { data, cuadernosPromise: cuadernosFetch };
  return { cuadernosPromise: cuadernosFetch, info_notificaciones_receptor };
}

/**
 * Función para scrapear información del receptor.
 * @param {string} html - HTML del modal de información de receptor.
 * @returns {Array} Datos extraídos del modal.
 */
function scrapeInfoNotificacionesReceptor(html) {
  const $ = load(html || "");

  // Obtener headers normalizados (ej: cuaderno, datos_del_retiro, fecha_retiro, estado)
  const keys = $(".modal-body table thead tr th")
    .map((_, el) => normalizeString($(el).text().trim()))
    .get();

  const rows = $(".modal-body table tbody tr").get();
  if (!rows || rows.length === 0) return [];

  const result = [];
  for (const row of rows) {
    const $row = $(row);
    const cells = $row.find("td").get();
    const rowObj = {};
    for (let i = 0; i < cells.length; i++) {
      const key = keys[i] || `col_${i}`;
      const value = $(cells[i]).text().trim();
      rowObj[key] = value;
    }
    result.push(rowObj);
  }

  return result;
}

/**
 * Función para extraer el HTML del modal de información de receptor.
 * Implementa reintentos en caso de fallo.
 * @param {Object} page - Instancia de Playwright Page.
 * @param {string} token - Valor del token específico para la petición.
 * @returns {Promise<string|null>} HTML del modal de información de receptor o null en caso de error.
 */
async function extractInfoNotificacionesReceptor(page, token) {
  const URL =
    "https://oficinajudicialvirtual.pjud.cl/ADIR_871/civil/modal/receptorCivil.php";
  const params = new URLSearchParams();
  params.append("valReceptor", token);
  try {
    const html = await retry(
      async () => {
        const response = await page.request.post(URL, {
          data: params.toString(),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Cache-Control": "no-cache",
          },
          timeout: 15000,
        });
        if (!response.ok()) {
          throw new Error(`Respuesta no OK: ${response.status()}`);
        }
        return await response.text();
      },
      3,
      1000
    );
    return html;
  } catch (err) {
    console.error(
      `[API Fetch Info Notificaciones Receptor] Error final en page.request: ${err.message}`
    );
    return null;
  }
}

/**
 * Función principal de la Etapa 2 para scrapear modal de una causa civil. De éste derivan los cuadernos.
 * @param {Object} page - Instancia de Playwright Page.
 * @param {Object} casoData - Objeto con datos preliminares del caso (rol, modal_token, etc).
 * @param {string} TOKEN - Token global de sesión para peticiones.
 * @param {number} index - Índice del caso en la lista (para logging).
 * @returns {Promise<Object|null>} Objeto con data completa del caso, incluyendo cuadernos scrapeados.
 */
export async function scrapeModalTask(page, casoData, TOKEN) {
  const idCausaJWT = casoData.modal_token;
  if (!idCausaJWT) {
    return { ...casoData, status: "error", error: "ID_SECUESTRO_FALLIDO" };
  }

  // Obtenemos el HTML del Modal de la Causa mediante petición
  const modalHtml = await extractModal(page, idCausaJWT, TOKEN);
  if (!modalHtml) {
    return { ...casoData, status: "error", error: "MODAL_HTML_VACIO" };
  }

  const result = await getDataAndCuadernos(page, modalHtml, TOKEN, casoData);
  if (!result) {
    return null;
  }

  // refiriendonos a cuadernos
  const data = { cuadernos: {}, info_notificaciones_receptor: [] };
  const { cuadernosPromise, info_notificaciones_receptor } = result;

  const cuadernos = await Promise.all(cuadernosPromise);

  const scrapeoPromises = cuadernos.map(async ({ cuaderno, html }) => {
    if (html) {
      // ahora hacemos efectivo el scrapeo de las tablas del cuaderno
      const scrapedData = await scrapTablas(page, html, casoData);
      return { cuaderno, scrapedData };
    } else {
      return null;
    }
  });

  const resultadosCuadernos = await Promise.all(scrapeoPromises);
  resultadosCuadernos.forEach((resultado) => {
    if (resultado) {
      data["cuadernos"][resultado.cuaderno] = resultado.scrapedData;
    }
  });
  data.info_notificaciones_receptor = await info_notificaciones_receptor;
  return data;
}

/**
 * Función para scrapear tablas del contenido de un modal de causa. Se incluyen tablas de Historia, Litigantes, Notificaciones, Escritos y Exhortos.
 * Además, se aplica un hashing para determinar si un movimiento ya fue procesado previamente o no.
 * @param {object} page Instancia de Playwright Page.
 * @param {string} html HTML del cuaderno a scrapear.
 * @returns {Promise<object>} Objeto con data scrapeda de las tablas.
 */
export async function scrapTablas(page, html) {
  const $ = load(html);
  const tablas = {
    historiaCiv: [],
    litigantesCiv: [],
    notificacionesCiv: [],
    escritosCiv: [],
    exhortosCiv: [],
  };
  for (const key of Object.keys(tablas)) {
    const headers = $(`#${key} table thead tr th`)
      .map((_, el) => {
        const text = $(el).text();
        return normalizeString(text);
      })
      .get();
    const headersKeys = {};
    for (let x = 0; x < headers.length; x++) {
      headersKeys[x] = headers[x];
    }

    const _tableData = [];

    const rows = $(`#${key} table tbody tr`).get();
    for (const rowElement of rows) {
      const rowData = {};
      const $row = $(rowElement);
      const anexoTokensPendientes = []; // Almacenar tokens de anexos para procesar después

      const cells = $row.find("td").get();

      // PRIMERA PASADA: Extraer toda la data de texto y tokens de anexos (sin hacer fetch aún)
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
        const cellElement = cells[cellIndex];
        const $cell = $(cellElement);
        const key = headersKeys[cellIndex];
        const hasChildElement = $cell.find("*").length > 0;

        if (!hasChildElement) {
          rowData[key] = ["anexo", "doc"].includes(key)
            ? null
            : $cell.text().trim();
        } else {
          const isAnexo =
            $cell.find("a[href*='modalAnexoSolicitudCivil']").length > 0;
          const isFile = $cell.find("form").length > 0;

          if (isFile) {
            const archivos = [];
            $cell.find("form").each((_, formElement) => {
              // pjud guarda el token del archivo en un input oculto dentro del form
              // tmb como son distintos tipos guardan el tipo de archivo para la url en el name del input
              const rawUrl = $(formElement).attr("action") || "";
              const value = $(formElement).find("input").attr("value") || "";
              const fileType = $(formElement).find("input").attr("name") || "";
              const url = `https://oficinajudicialvirtual.pjud.cl/${rawUrl}?${fileType}=${value}`;
              archivos.push({
                name: crypto.randomUUID(),
                url,
                type: "regular",
              });
            });
            rowData[key] = archivos.length > 0 ? archivos : [];
          } else if (isAnexo) {
            // Extraer los tokens de anexos sin hacer peticiones aún
            const anexoLinks = $cell
              .find("a[href*='modalAnexoSolicitudCivil']")
              .get();

            const tokens = [];
            for (const linkElement of anexoLinks) {
              const onclick = $(linkElement).attr("onclick") || "";
              const token = secuestrarFuncToken(onclick);
              if (token) {
                tokens.push(token);
              }
            }

            // Guardar los tokens asociados a esta celda (usar cellIndex como identificador único)
            if (tokens.length > 0) {
              anexoTokensPendientes.push({ cellIndex, key, tokens });
            }

            // Inicializar con array vacío por ahora
            rowData[key] = [];
          } else {
            rowData[key] = ["anexo", "doc"].includes(key)
              ? null
              : $cell.text().trim();
          }
        }
      }

      // SEGUNDA PASADA: Ahora que tenemos toda la data de texto, verificar el hash
      if (rowData.folio || rowData.fec_tramite || rowData.desc_tramite) {
        // normalizamos fec_tramite
        rowData.fec_tramite = String(rowData.fec_tramite.split(" ")[0]);

        // El movimiento es nuevo, procesar los anexos pendientes
        for (const { key: cellKey, tokens } of anexoTokensPendientes) {
          const anexos = [];

          for (const token of tokens) {
            const anexoHtml = await extractAnexoModal(page, token);
            if (anexoHtml) {
              const anexoData = await scrapDataFromAnexo(anexoHtml);
              anexos.push(anexoData);
            }
          }

          rowData[cellKey] = anexos;
        }

        _tableData.push(rowData);
      } else {
        // No es un movimiento con folio/tramite, agregar directamente
        // Si hay anexos pendientes, procesarlos de todas formas
        for (const { key: cellKey, tokens } of anexoTokensPendientes) {
          const anexos = [];

          for (const token of tokens) {
            const anexoHtml = await extractAnexoModal(page, token);
            if (anexoHtml) {
              const anexoData = await scrapDataFromAnexo(anexoHtml);
              anexos.push(anexoData);
            }
          }

          rowData[cellKey] = anexos;
        }

        _tableData.push(rowData);
      }
    }
    tablas[key] = _tableData;
  }
  return tablas;
}
