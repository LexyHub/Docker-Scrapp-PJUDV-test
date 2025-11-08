import { CORTES } from "../constants/cortes.js";
import { TRIBUNALES } from "../constants/tribunales.js";

/**
 * Transforma un objeto caso a un formato estandarizado.
 * @param {*} caso
 * @returns caso formateado
 */
export function transformCaso(caso) {
  const conCorte = CORTES[caso["corte"]] || 0;
  const conTribunal = TRIBUNALES[caso["tribunal"]] || 0;

  return {
    conEraCausa: parseInt(caso["año"], 10),
    competencia: 3,
    conCorte: conCorte,
    conTipoCausa: caso["libro"] || "",
    conRolCausa: parseInt(caso["rol"], 10),
    conTribunal: conTribunal,
    ruc1: "",
    ruc2: "",
    rucPen1: "",
    rucPen2: "",
    conCaratulado: "",
  };
}
