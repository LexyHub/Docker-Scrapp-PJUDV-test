import { COMPETENCIAS } from "../constants/competencias.js";
import { CORTES } from "../constants/cortes.js";
import { TRIBUNALES } from "../constants/tribunales.js";

export function serializeFormData(data) {
  return Object.entries(data)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(
      ([key, value]) =>
        encodeURIComponent(key) + "=" + encodeURIComponent(String(value))
    )
    .join("&");
}

const _URLS = {
  1: "https://www.pjud.cl/ADIR_871/suprema/consultaRitSuprema.php",
  2: "https://www.pjud.cl/ADIR_871/apelaciones/consultaRitApelaciones.php",
  3: "https://www.pjud.cl/ADIR_871/civil/consultaRitCivil.php",
  4: "https://www.pjud.cl/ADIR_871/laboral/consultaRitLaboral.php",
  5: "https://www.pjud.cl/ADIR_871/penal/consultaRitPenal.php",
  6: "https://www.pjud.cl/ADIR_871/cobranza/consultaRitCobranza.php",
};

export function transformCasoToFormData(caso) {
  const competencia = COMPETENCIAS[caso["competencia"]] || 0;
  const conCorte = CORTES[caso["corte"]] || 0;
  const conTribunal = TRIBUNALES[caso["tribunal"]] || 0;

  const formData = {
    competencia: competencia,
    conCorte: conCorte,
    conTribunal: conTribunal,
    conTipoCausa: caso["libro"] || "E",
    conRolCausa: parseInt(caso["rol"], 10),
    conEraCausa: parseInt(caso["año"], 10),
    ruc1: "",
    ruc2: "",
    rucPen1: "",
    rucPen2: "",
    conCaratulado: "",
  };

  return formData;
}

/**
 * Función para llamar al reCAPTCHA en todas las páginas que lo requieran
 * se necesita un Token reCaptcha válido para cada solicitud, con esto nos ahorramos completamente el llenado del formulario en el cliente
 * @returns {Promise<string>} el HTML de la página solicitada
 * @deprecated Sólo se utiliza en cliente, no en servidor
 */
export async function paginaRit({ pagina, formData }) {
  // acá forzamos el reCAPTCHA
  await llamarCaptchaTodos();
  // luego serializo los datos del formulario y armo el formdata
  const fullData = {
    ...formData,
    "g-recaptcha-response-rit": document.getElementById(
      "g-recaptcha-response-rit"
    ).value,
    action: "validate_captcha_rit",
    pagina: pagina,
  };
  const serializedData = serializeFormData(fullData);

  let formUrl = _URLS[formData.competencia] || _URLS[1];

  try {
    const response = await fetch(formUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Cache-Control": "no-cache",
      },
      body: serializedData,
      cache: "no-cache",
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    return html;
  } catch (error) {
    console.error("Error al cargar la página:", error);
  }
}
