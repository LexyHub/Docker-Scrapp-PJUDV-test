import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PWD,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("error", (err) => {
  console.error("Unexpected idle client error", err);
});

export default {
  /**
   * Función para realizar una consulta a la base de datos
   * @param {string} text Texto de la consulta SQL
   * @param {Array} params Parámetros de la consulta
   * @returns {Promise} Promesa con el resultado de la consulta
   */
  query: (text, params) => pool.query(text, params),
  /**
   * Función para obtener un cliente de la conexión a la base de datos
   * @returns {Promise} Promesa con el cliente de la base de datos
   */
  getClient: () => pool.connect(),
  /**
   * Función para cerrar la conexión a la base de datos
   * @returns {Promise} Promesa que se resuelve cuando se cierra la conexión
   */
  close: () => pool.end(),
};
