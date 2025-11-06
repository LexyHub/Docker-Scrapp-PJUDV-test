import { CORTES } from "../constants/cortes.js";

/**
 * Transforma un objeto caso a un formato estandarizado.
 * @param {*} caso
 * @returns caso formateado
 */
export function transformCaso(caso) {
  const conCorte = CORTES[caso["corte"]] || 0;

  return {
    conEraCausa: parseInt(caso["año"], 10),
    competencia: 3, // caso["Competencia"] || caso.competencia || "",
    conCorte: conCorte,
    conTipoCausa: caso["libro"] || caso.libro || "",
    conRolCausa: parseInt(caso["rol"], 10),
    conTribunal: parseInt(caso["id_casetracking"], 10),
    ruc1: "",
    ruc2: "",
    rucPen1: "",
    rucPen2: "",
    conCaratulado: "",
  };
}
