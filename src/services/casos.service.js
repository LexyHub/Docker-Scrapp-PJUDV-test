import { transformCaso } from "../utils/mappers.js";

export async function getCasos(inicio, fin) {
  const URL = process.env.API_ENDPOINT;
  const response = await fetch(URL, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.API_KEY}`,
    },
  });
  let data = await response.json();
  if (inicio != undefined && fin != undefined) {
    const mappedData = data.slice(inicio, fin).map(transformCaso);
    return mappedData;
  }
  const mappedData = data.map(transformCaso);
  return mappedData;
}

/*
ESQUEMA DE RESPUESTA:
{
  "Año": string,
  "Competencia": string,
  "Corte": string,
  "Libro/Tipo": string,
  "Rol": string,
  "Tribunal": string
}[]
*/
