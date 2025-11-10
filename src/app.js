import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { getCausa } from "./logic/getCausa.js";

const app = new Hono();
app.use("*", cors());

app.post("/obtener-causa", async (c) => {
  const body = await c.req.json();

  const { libro, rol, año, corte, tribunal } = body;

  try {
    const resultado = await getCausa({ libro, rol, año, corte, tribunal });
    return c.json({ success: true, data: resultado });
  } catch (error) {
    console.error("Error al obtener la causa:", error);
    return c.json({ success: false, error: "Error al obtener la causa" });
  }
});

serve(app, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});

// implementacion
/*
getCausa({
  libro: "C",
  rol: 7066,
  año: 2025,
  corte: "C.A. de Santiago",
  tribunal: "4º Juzgado Civil de Santiago",
});
*/
