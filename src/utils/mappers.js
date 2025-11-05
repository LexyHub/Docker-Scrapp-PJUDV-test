/**
 * Transforma un objeto caso a un formato estandarizado.
 * @param {*} caso
 * @returns caso formateado
 */
export function transformCaso(caso) {
  return {
    año: caso["Año"] || caso.año || "",
    competencia: caso["Competencia"] || caso.competencia || "",
    corte: caso["Corte"] || caso.corte || "",
    libro: caso["Libro/Tipo"] || caso.libro || "",
    rol: caso["Rol"]?.toString() || caso.rol?.toString() || "",
    tribunal: caso["Tribunal"] || caso.tribunal || "",
  };
}
