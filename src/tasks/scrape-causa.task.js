import { logger, logToFile } from "../config/logs.js";
import { transformCaso } from "../utils/mappers.js";
import { parsearPaginaConCheerio } from "./scrape-cheerio.task.js";

const _URLS = {
  1: "https://oficinajudicialvirtual.pjud.cl/ADIR_871/suprema/consultaRitSuprema.php",
  2: "https://oficinajudicialvirtual.pjud.cl/ADIR_871/apelaciones/consultaRitApelaciones.php",
  3: "https://oficinajudicialvirtual.pjud.cl/ADIR_871/civil/consultaRitCivil.php",
  4: "https://oficinajudicialvirtual.pjud.cl/ADIR_871/laboral/consultaRitLaboral.php",
  5: "https://oficinajudicialvirtual.pjud.cl/ADIR_871/penal/consultaRitPenal.php",
  6: "https://oficinajudicialvirtual.pjud.cl/ADIR_871/cobranza/consultaRitCobranza.php",
};

// Configuración de rate limiting
const RATE_LIMIT_CONFIG = {
  requestsPerBatch: 10, // Número de peticiones antes de hacer una pausa
  delayMs: 20, // Delay en milisegundos después de cada lote
};

/**
 * Configura el rate limiting para las peticiones de scraping de causas.
 * @param {Object} config - Configuración del rate limiting
 * @param {number} config.requestsPerBatch - Número de peticiones antes de pausar (default: 10)
 * @param {number} config.delayMs - Milisegundos de pausa después de cada lote (default: 20)
 */
export function configureRateLimit(config) {
  if (config.requestsPerBatch !== undefined) {
    RATE_LIMIT_CONFIG.requestsPerBatch = config.requestsPerBatch;
  }
  if (config.delayMs !== undefined) {
    RATE_LIMIT_CONFIG.delayMs = config.delayMs;
  }
  logger.info(
    `Rate limiting configurado: ${RATE_LIMIT_CONFIG.requestsPerBatch} peticiones cada ${RATE_LIMIT_CONFIG.delayMs}ms`
  );
}

/**
 * Función principal de la task de scraping de causas civiles. Llena el formulario y obtiene los datos paginados.
 * @param {Object} page - Instancia de Playwright Page.
 * @param {Object} formData - Datos del formulario para la causa.
 * @param {number} index - Índice de la causa en la lista para logging.
 * @param {string} causaId - ID de la causa.
 * @returns {Promise<Object>} Objeto con ID de la causa y datos extraídos.
 * @throws {Error} Si ocurre un error durante el scraping.
 */
export async function scrapeCausaTask(page, formData, index, causaId) {
  const logPrefix = `[Causa N° ${index}: ${causaId}]`;
  logger.info(`${logPrefix} Iniciando crawler...`);

  const todosLosDatos = [];
  let paginaToken = undefined; // Página 1 (sin token)
  let requestCount = 0; // Contador de peticiones realizadas

  const parsedFormData = transformCaso(formData);

  try {
    while (true) {
      const url = _URLS[parsedFormData.competencia] || _URLS[3];

      // Rate limiting: hacer pausa cada cierto número de peticiones
      if (
        requestCount > 0 &&
        requestCount % RATE_LIMIT_CONFIG.requestsPerBatch === 0
      ) {
        logger.info(
          `${logPrefix} Rate limit: pausa de ${RATE_LIMIT_CONFIG.delayMs}ms después de ${requestCount} peticiones`
        );
        await delay(RATE_LIMIT_CONFIG.delayMs);
      }

      const html = await page.evaluate(
        async (data) => {
          function serializeFormData(data) {
            return Object.entries(data)
              .filter(([_, value]) => value !== undefined && value !== null)
              .map(
                ([key, value]) =>
                  encodeURIComponent(key) +
                  "=" +
                  encodeURIComponent(String(value))
              )
              .join("&");
          }

          llamarCaptchaTodos();

          const formData = {
            ...data.parsedFormData,
            "g-recaptcha-response-rit": document.getElementById(
              "g-recaptcha-response-rit"
            ).value,
            action: "validate_captcha_rit",
            pagina: data.pagina,
          };
          const serialized = serializeFormData(formData);

          try {
            const response = await fetch(data.url, {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded; charset=UTF-8",
                "Cache-Control": "no-cache",
              },
              body: serialized,
              cache: "no-cache",
              timeout: 60000,
            });

            if (!response.ok)
              throw new Error(`HTTP ${response.status()} en ${data.url}`);

            const html = await response.text();
            return html;
          } catch (error) {
            console.error(
              `[paginaRit] Error al fetchear ${data.url}: ${error.message}`
            );
            throw error;
          }
        },
        { url, parsedFormData, pagina: paginaToken }
      );

      requestCount++; // Incrementar contador después de cada petición

      if (!html) {
        logger.warn(
          `${logPrefix} La API no devolvió HTML. Deteniendo crawler.`
        );
        break;
      }

      logToFile({
        message: `Respuesta HTML recibida para página token: ${paginaToken}`,
        type: "debug",
      });
      logToFile({
        message: html,
        type: "debug",
      });

      // extraemos la data
      const resultado = parsearPaginaConCheerio(html);
      todosLosDatos.push(...resultado.data);

      paginaToken = resultado.nextToken;
      if (!paginaToken) {
        break;
      }
    }

    logger.info(`${logPrefix} Éxito. ${todosLosDatos.length} registros.`);
    return { id: causaId, data: todosLosDatos };
  } catch (error) {
    logger.error(`${logPrefix} Fallo total: ${error.message}`);
    throw error;
  }
}
