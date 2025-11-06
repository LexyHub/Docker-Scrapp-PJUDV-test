import { load } from "cheerio";
import { logger } from "../config/logs.js";
import { retry } from "../utils/retry.js";
import {
  secuestrarFuncToken,
  secuestrarTokenAnexoCausaCivil,
  secuestrarTokenInfoNotificacionesRec,
} from "../utils/tokens.js";
import { setMetadata, sumToMetadata } from "../services/metadata.service.js";
import { normalizeString } from "../utils/core.js";
import { CASE_EXTRACTION_LIMIT } from "../constants/limits.js";
import crypto from "crypto";
import { movimientoHash } from "../utils/hashing.js";
import { hasHash } from "../services/hash.service.js";

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
    // usar tokenCausa en lugar de una variable fuera de alcance
    logger.error(
      `[API Fetch] Error final en page.request para ${tokenCausa}: ${err.message}`
    );
    sumToMetadata("causas_fallidas", 1);
    return null;
  }
}

/**
 * Función para scrapear data del modal de causa civil.
 * Esta data incluye información inicial del caso (ROL, estado adm. y proc., etapa, texto demanda, anexo, etc.).
 * Incluye información de notificaciones receptor.
 * Incluye datos de Historia, Litigantes, Notificaciones, Escritos y Exhortos por cada cuaderno.
 * Además extrae tokens necesarios para tasks de descarga de archivos (FASE 4).
 * @param {string} html el HTML extraído por petición
 * @param {object} preScrapedData data preliminar del caso
 * @param {object} page instancia de Playwright Page
 * @returns {Promise<object>} data scrapeda del modal
 */
async function parsearDatosModal(html, preScrapedData, page) {
  const $ = load(html);
  const data = { ...preScrapedData };

  const cells = $(".modal-body table tbody td")
    .map((_, el) => $(el).text().trim())
    .get();

  if (!cells.length) {
    data.cuadernos = {};
    return data;
  }

  // Ahora extraemos data de la segunda tabla, mayoritariamente archivos
  const dcells = $(".modal-body table").eq(1).find("tbody td");
  const textoDemandaAction = dcells.eq(0).find("form").attr("action") || "";
  const textoDemandaValue = dcells.eq(0).find("input").attr("value") || "";
  const textoDemandaPath = dcells.eq(0).find("input").attr("name") || "";
  const textoDemanda = `https://oficinajudicialvirtual.pjud.cl/${textoDemandaAction}?${textoDemandaPath}=${textoDemandaValue}`;

  const certificadoEnvioAction = dcells.eq(2).find("form").attr("action") || "";
  const certificadoEnvioValue = dcells.eq(2).find("input").attr("value") || "";
  const certificadoEnvioPath = dcells.eq(2).find("input").attr("name") || "";
  const certificadoEnvio = `https://oficinajudicialvirtual.pjud.cl/${certificadoEnvioAction}?${certificadoEnvioPath}=${certificadoEnvioValue}`;

  const ebookAction = dcells.eq(3).find("form").attr("action") || "";
  const ebookValue = dcells.eq(3).find("input").attr("value") || "";
  const ebookPath = dcells.eq(3).find("input").attr("name") || "";
  const ebook = `https://oficinajudicialvirtual.pjud.cl/${ebookAction}?${ebookPath}=${ebookValue}`;

  data.texto_demanda = textoDemanda;
  data.certificado_envio = certificadoEnvio;
  data.ebook = ebook;

  // ahora scrapeamos el anexo de causa, que es un modal que podría o no contener más rows
  const tokenAnexo = dcells.eq(1).find("a").attr("onclick") || "";
  const tokenAnexoSecuestrado = secuestrarTokenAnexoCausaCivil(tokenAnexo);
  if (!tokenAnexoSecuestrado) {
    data.anexos_de_la_causa = [];
  } else {
    const extractedAnexo = await extractAnexoCausaModal(
      page,
      tokenAnexoSecuestrado
    );
    data.anexos_de_la_causa = scrapeAnexoCausaModal(extractedAnexo);
  }

  data.estado_administrativo = cells[3]
    ?.replace(/^Est\.?\s*Adm\.?:\s*/i, "")
    .trim();
  data.proceso = cells[4]?.replace(/^Proc\.?:\s*/i, "").trim();
  data.ubicacion = cells[5]?.replace(/^Ubicación:\s*/i, "").trim();
  data.estado_procedimiento = cells[6]
    ?.replace(/^Estado\s*Proc\.?:\s*/i, "")
    .trim();
  data.etapa = cells[7]?.replace(/^Etapa:\s*/i, "").trim();
  data.cuadernos = {};
  return data;
}

/**
 * Función para obtener datos del modal e info. notificaciones receptor.
 * @param {object} page Instancia de Playwright Page.
 * @param {string} modalHtml HTML del modal.
 * @param {string} TOKEN Token global de sesión anónima.
 * @param {object} preScrapedData Datos pre-scrapeados.
 * @returns {Promise<object>} Datos iniciales del modal y promesas para scrapeo de cuadernos
 */
async function getDataAndCuadernos(page, modalHtml, TOKEN, preScrapedData) {
  // parsearDatosModal es async y devuelve una Promise, resolverla aquí
  const data = await parsearDatosModal(modalHtml, preScrapedData, page);
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
  data.info_notificaciones_receptor = scrapeInfoNotificacionesReceptor(
    infoNotificacionesReceptorHtml
  );

  return { data, cuadernosPromise: cuadernosFetch };
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
    logger.error(
      `[API Fetch Info Notificaciones Receptor] Error final en page.request: ${err.message}`
    );
    sumToMetadata("info_notificaciones_receptor_fallidos", 1);
    return null;
  }
}

/**
 * Función para scrapear anexo de la causa (anexo específico)
 * @param {string} html HTML del modal de anexos
 * @returns {Array} Datos extraídos del modal.
 */
function scrapeAnexoCausaModal(html) {
  const $ = load(html);

  const keys = $(".modal-body table thead tr th")
    .map((_, el) => normalizeString($(el).text().trim()))
    .get();

  const data = [];

  $(".modal-body table tbody tr").each((_, row) => {
    const rowData = {};
    $(row)
      .find("td")
      .each((colIndex, el) => {
        const key = keys[colIndex];
        if ($(el).find("form").length > 0) {
          const url = $(el).find("form").attr("action") || "";
          const value = $(el).find("input").attr("value") || "";
          const fileType = $(el).find("input").attr("name") || "";
          const fullUrl = `https://oficinajudicialvirtual.pjud.cl/${url}?${fileType}=${value}`;
          rowData[key] = fullUrl;
        } else {
          const value = $(el).text().trim();
          rowData[key] = value;
        }
      });
    data.push(rowData);
  });
  return data;
}

/**
 * Función para extraer el HTML del modal de anexos (específico de anexos) de una causa civil.
 * Implementa reintentos en caso de fallo.
 * @param {Object} page - Instancia de Playwright Page.
 * @param {string} tokenAnexo - Valor del token específico para la petición.
 * @returns {Promise<string|null>} HTML del modal de anexos o null en caso de error.
 */
async function extractAnexoCausaModal(page, tokenAnexo) {
  const URL =
    "https://oficinajudicialvirtual.pjud.cl/ADIR_871/civil/modal/anexoCausaCivil.php";
  const params = new URLSearchParams();
  params.append("dtaAnexCau", tokenAnexo);

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
          logger.warn(
            `[API Fetch Anexo] Respuesta no OK: ${response.status()}. Reintentando...`
          );
          throw new Error(`Respuesta no OK del servidor: ${response.status()}`);
        }
        return await response.text();
      },
      3,
      1000
    );

    return html;
  } catch (err) {
    logger.error(
      `[API Fetch Modal Anexo Causa] Error final en page.request: ${err.message}`
    );
    setMetadata("modal_anexo_de_la_causa", "fallido");
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
export async function scrapeModalTask(page, casoData, TOKEN, index) {
  const logPrefix = `[Modal ${index}: ${casoData.rol}]`;
  const idCausaJWT = casoData.modal_token;
  if (!idCausaJWT) {
    logger.error(`${logPrefix} No se pudo secuestrar el JWT del ID.`);
    return { ...casoData, status: "error", error: "ID_SECUESTRO_FALLIDO" };
  }

  // Obtenemos el HTML del Modal de la Causa mediante petición
  const modalHtml = await extractModal(page, idCausaJWT, TOKEN);
  if (!modalHtml) {
    logger.warn(`${logPrefix} No se obtuvo HTML del modal. Saltando.`);
    return { ...casoData, status: "error", error: "MODAL_HTML_VACIO" };
  }

  // Ahora extraemos la data del modal y los cuadernos
  const result = await getDataAndCuadernos(page, modalHtml, TOKEN, casoData);
  if (!result || !result.data) {
    logger.warn(`${logPrefix} No se pudo obtener data/cuadernos. Saltando.`);
    return null;
  }

  const { data, cuadernosPromise } = result;
  logger.info(`${logPrefix} Iniciando scrapeo de proceso "${data.proceso}"`);

  // los cuadernos vienen como promesa, esperamos a que TODAS se resuelvan
  const cuadernos = await Promise.all(cuadernosPromise);
  logger.info(`${logPrefix} Obtenidos ${cuadernos.length} cuadernos.`);
  logger.info("Ejecutando scrapeo de cuadernos...");

  // Paralelizamos el scrapeo de cada cuaderno
  const scrapeoPromises = cuadernos.map(async ({ cuaderno, html }) => {
    if (html) {
      // ahora hacemos efectivo el scrapeo de las tablas del cuaderno
      const scrapedData = await scrapTablas(page, html, casoData);
      logger.info(`${logPrefix} Cuaderno "${cuaderno}" scrapeado.`);
      return { cuaderno, scrapedData };
    } else {
      logger.warn(
        `${logPrefix} No se pudo obtener HTML para el cuaderno "${cuaderno}"`
      );
      return null;
    }
  });

  const resultadosCuadernos = await Promise.all(scrapeoPromises);
  resultadosCuadernos.forEach((resultado) => {
    if (resultado) {
      data["cuadernos"][resultado.cuaderno] = resultado.scrapedData;
    }
  });

  logger.info(`${logPrefix} Scraping del caso completado.`);

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

      const cells = $row.find("td").get();
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
        const cellElement = cells[cellIndex];
        const $cell = $(cellElement);
        const key = headersKeys[cellIndex];
        const hasChildElement = $cell.find("*").length > 0;

        if (!hasChildElement) {
          rowData[key] = $cell.text().trim();
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
              archivos.push({ name: crypto.randomUUID(), url });
            });
            rowData[key] = archivos.length > 0 ? archivos : [];
          } else if (isAnexo) {
            // acá es mas complicada la descarga porque hay que scrapear otro modal interno por cada anexo
            // aparte que los documentos de los anexos NECESITAN tokens y sesion, por ende se hace del lado del cliente la descarga
            const anexos = [];

            const anexoLinks = $cell
              .find("a[href*='modalAnexoSolicitudCivil']")
              .get();

            for (const linkElement of anexoLinks) {
              const onclick = $(linkElement).attr("onclick") || "";
              const token = secuestrarFuncToken(onclick);
              if (!token) continue;

              const anexoHtml = await extractAnexoModal(page, token);
              if (anexoHtml) {
                const anexoData = await scrapDataFromAnexo(anexoHtml);
                anexos.push(anexoData);
              }
            }
            rowData[key] = anexos;
          } else {
            rowData[key] = $cell.text().trim();
          }
        }
      }
      if (rowData.folio || rowData.fec_tramite || rowData.desc_tramite) {
        const hash = movimientoHash({
          desc_tramite: String(rowData.desc_tramite),
          folio: String(rowData.folio),
          fecha_movimiento: String(rowData.fec_tramite.split(" ")[0]),
        });
        if (!hasHash(hash)) {
          _tableData.push(rowData);
          sumToMetadata("movimientos_procesados", 1);
        } else {
          sumToMetadata("movimientos_omitidos", 1);
        }
      } else {
        _tableData.push(rowData);
      }
    }
    tablas[key] = _tableData;
  }
  return tablas;
}

/**
 * Función para extraer el HTML del modal de anexos; específico de un registro de "Historia" de una causa civil.
 * Implementa reintentos en caso de fallo.
 * @param {Object} page - Instancia de Playwright Page.
 * @param {string} val - Valor del token específico para la petición.
 * @returns {Promise<string|null>} HTML del modal de anexos o null en caso de error.
 */
export async function extractAnexoModal(page, val) {
  const URL =
    "https://oficinajudicialvirtual.pjud.cl/ADIR_871/civil/modal/anexoCausaSolicitudCivil.php";
  const params = new URLSearchParams();
  params.append("dtaCausaAnex", val);

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
          logger.warn(
            `[API Fetch Anexo] Respuesta no OK: ${response.status()}. Reintentando...`
          );
          throw new Error(`Respuesta no OK del servidor: ${response.status()}`);
        }
        return await response.text();
      },
      3,
      1000
    );

    return html;
  } catch (err) {
    logger.error(
      `[API Fetch Anexo] Error final en page.request: ${err.message}`
    );
    sumToMetadata("anexos_fallidos", 1);
    return null;
  }
}

/**
 * Función para scrapear información del anexo.
 * @param {string} html - HTML del modal de anexos.
 * @returns {Promise<Object>} Datos extraídos del modal.
 */
export async function scrapDataFromAnexo(html) {
  const $ = load(html);
  const data = {};
  const headersKeys = [];

  $(".modal-body table thead tr th").each((_, headerElement) => {
    const $header = $(headerElement);
    const key = normalizeString($header.text().trim());
    headersKeys.push(key);
    data[key] = "";
  });

  $(".modal-body table tbody tr td").each((index, cellElement) => {
    const $cell = $(cellElement);
    const key = headersKeys[index];
    if (!key) return;

    if ($cell.find("form").length > 0) {
      const archivos = [];
      $cell.find("form").each((_, formElement) => {
        const rawUrl = $(formElement).attr("action") || "";
        const value = $(formElement).find("input").attr("value") || "";
        const fileType = $(formElement).find("input").attr("name") || "";
        const url = `https://oficinajudicialvirtual.pjud.cl/${rawUrl}?${fileType}=${value}`;
        // Marcar archivos de anexo que necesitan Playwright (requieren sesión)
        archivos.push({
          name: crypto.randomUUID(),
          url,
          requiresSession: true,
        });
      });
      data[key] = archivos;
    } else {
      data[key] = $cell.text().trim();
    }
  });

  return data;
}
