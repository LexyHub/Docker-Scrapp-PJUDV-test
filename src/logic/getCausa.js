import { createBrowserInstance } from "./utils/browser.js";
import { scrapeCausaTask } from "./tasks/scrape-causa.task.js";
import { retry } from "./utils/retry.js";
import { scrapeModalTask } from "./tasks/scrape-modal.task.js";
import { secuestrarToken } from "./utils/tokens.js";

export async function getCausa({ libro, rol, año, corte, tribunal }) {
  const { browser, context, page } = await createBrowserInstance(true);

  const f = await page.evaluate(() => window.detalleCausaCivil.toString());
  const TOKEN = secuestrarToken(f);

  const taskTabla = await retry(() =>
    scrapeCausaTask(page, {
      libro,
      rol,
      año,
      corte,
      tribunal,
    })
  );

  const taskModal = await scrapeModalTask(page, taskTabla, TOKEN);

  await context.close();
  await browser.close();

  return taskModal;
}
