import { logger } from "../config/logs.js";
import { transformCasoToFormData } from "../services/force-form.service.js";
import { parsearPaginaConCheerio } from "./scrape-cheerio.task.js";

const _URLS = {
  1: "https://oficinajudicialvirtual.pjud.cl/ADIR_871/suprema/consultaRitSuprema.php",
  2: "https://oficinajudicialvirtual.pjud.cl/ADIR_871/apelaciones/consultaRitApelaciones.php",
  3: "https://oficinajudicialvirtual.pjud.cl/ADIR_871/civil/consultaRitCivil.php",
  4: "https://oficinajudicialvirtual.pjud.cl/ADIR_871/laboral/consultaRitLaboral.php",
  5: "https://oficinajudicialvirtual.pjud.cl/ADIR_871/penal/consultaRitPenal.php",
  6: "https://oficinajudicialvirtual.pjud.cl/ADIR_871/cobranza/consultaRitCobranza.php",
};

export async function scrapeCausaTask(page, formData, index, causaId) {
  const logPrefix = `[Causa N° ${index}: ${causaId}]`;
  logger.info(`${logPrefix} Iniciando crawler...`);

  const todosLosDatos = [];
  let paginaToken = undefined; // Página 1 (sin token)

  try {
    while (true) {
      const parsedFormData = transformCasoToFormData(formData);
      const url = _URLS[parsedFormData.competencia] || _URLS[1];

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

      if (!html) {
        logger.warn(
          `${logPrefix} La API no devolvió HTML. Deteniendo crawler.`
        );
        break;
      }

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
