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

/**
 * Función principal de la task de scraping de causas civiles. Llena el formulario y obtiene los datos paginados.
 * @param {Object} page - Instancia de Playwright Page.
 * @param {Object} formData - Datos del formulario para la causa.
 * @param {number} index - Índice de la causa en la lista para logging.
 * @param {string} causaId - ID de la causa.
 * @returns {Promise<Object>} Objeto con ID de la causa y datos extraídos.
 * @throws {Error} Si ocurre un error durante el scraping.
 */
export async function scrapeCausaTask(page, formData) {
  const parsedFormData = transformCaso(formData);
  try {
    const url = _URLS[parsedFormData.competencia] || _URLS[3];

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
          throw error;
        }
      },
      { url, parsedFormData }
    );

    const resultado = parsearPaginaConCheerio(html);
    return resultado;
  } catch (error) {
    throw error;
  }
}
