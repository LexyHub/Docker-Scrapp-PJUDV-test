import { chromium } from "playwright";
import { logger } from "../config/logs.js";

/**
 * Crea una instancia de navegador (SOLO EL BROWSER).
 * Intenta primero en modo headless y si falla, reintenta en modo normal (con GUI).
 * @param {boolean} tryHeadless - Indica si se debe intentar iniciar en modo headless.
 * @returns {Promise<Object>} - La instancia del navegador.
 */
export async function createBrowserInstance(tryHeadless = true) {
  let browser;
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 OPR/122.0.0.0";
  try {
    logger.info(
      `Iniciando browser en modo ${tryHeadless ? "headless" : "normal"}...`
    );
    browser = await chromium.launch({ headless: tryHeadless, devtools: true });

    const context = await browser.newContext({
      userAgent,
      // recordHar deshabilitado para evitar que el proceso quede colgado
      // recordHar: { path: "data/network.har", content: "embed" },
    });
    const page = await context.newPage();
    logger.info(`Browser iniciado con éxito.`);
    await page.goto("https://oficinajudicialvirtual.pjud.cl/home/", {
      timeout: 30000,
    });

    await page.waitForFunction(
      () => typeof accesoConsultaCausas === "function",
      { timeout: 30000 }
    );
    await page.evaluate(() => accesoConsultaCausas());
    logger.info("Página principal cargada y lista.");

    await page.waitForFunction(() => typeof llamarCaptchaTodos === "function", {
      timeout: 30000,
    });

    return { browser, context, page };
  } catch (error) {
    if (browser) await browser.close();

    if (error.name === "TimeoutError" && tryHeadless) {
      logger.warn(
        "Timeout en modo headless. Reintentando en modo normal (con GUI)..."
      );
      return createBrowserInstance(false);
    } else {
      logger.error("No se pudo iniciar el browser:", error.message);
      throw error;
    }
  }
}
