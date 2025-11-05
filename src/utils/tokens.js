// estas funciones son basicamente para secuestrar tokens que se crean por sesion del navegadior
// de momento no son tokens de autorizacion (son JWT igualmente) sino que son tokens que te validan como guest en el sistema
// y te permite interactuar con el servidor
// es esencial estas funciones pq nos ahorran muchas interacciones en el navegador
export function secuestrarToken(func) {
  const m = func.match(/token\s*[:=]\s*['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

export function secuestrarFuncToken(func) {
  const m = func.match(/anexoSolicitudCivil\s*\(['"]([^'"]+)['"]\)/);
  return m ? m[1] : null;
}

export function secuestrarPaginaRit(onclickString) {
  if (!onclickString) return null;
  const regex = /paginaRit(?:Sig|Ant)?\s*\('([^']+)'\s*,\s*\d+\s*\)/;
  return regex.exec(onclickString)?.[1] || null;
}

export function secuestrarDetalleCivil(onclickString) {
  if (!onclickString) return null;
  const regex = /detalleCausaCivil\s*\('([^']+)'\)/;
  return regex.exec(onclickString)?.[1] || null;
}

export function secuestrarTokenAnexoCausaCivil(onclickString) {
  if (!onclickString) return null;
  const regex = /anexoCausaCivil\s*\('([^']+)'\)/;
  return regex.exec(onclickString)?.[1] || null;
}

export function secuestrarTokenInfoNotificacionesRec(onclickString) {
  if (!onclickString) return null;
  const regex = /receptorCivil\s*\('([^']+)'\)/;
  return regex.exec(onclickString)?.[1] || null;
}
