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
          console.warn(
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
    console.error(
      `[API Fetch Anexo] Error final en page.request: ${err.message}`
    );
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

        archivos.push({
          name: crypto.randomUUID(),
          url,
          type: "anexo",
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
