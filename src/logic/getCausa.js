import { createBrowserInstance } from "../utils/browser.js";
import { scrapeCausaTask } from "../tasks/scrape-causa.task.js";
import { retry } from "../utils/retry.js";
import { scrapeModalTask } from "../tasks/scrape-modal.task.js";
import { secuestrarToken } from "../utils/tokens.js";

export async function getCausa({ libro, rol, año, corte, tribunal }) {
  const { context, page } = await createBrowserInstance();

  try {
    const f = await page.evaluate(() => window.detalleCausaCivil.toString());
    const TOKEN = secuestrarToken(f);

    const taskTabla = await retry(() =>
      scrapeCausaTask(page, { libro, rol, año, corte, tribunal })
    );

    const taskModal = await scrapeModalTask(page, taskTabla, TOKEN);
    return taskModal;
  } catch (error) {
    console.error("[getCausa] Error:", error);
    throw error;
  } finally {
    await context.close(); // matamos el copntexto para liberar recursos
  }
}

/*
getCausa({
  libro: "C",
  rol: 7066,
  año: 2025,
  corte: "C.A. de Santiago",
  tribunal: "4º Juzgado Civil de Santiago",
}).then((data) => console.dir(data, { depth: null, colors: true }));
*/
