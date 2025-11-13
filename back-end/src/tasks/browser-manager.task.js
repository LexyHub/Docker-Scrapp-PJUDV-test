import { chromium } from "playwright";

let browserInstance = null;
let usageCount = 0;
const MAX_USAGE = 100;
// Monitor
let lastUse = Date.now();
let maxIdleTime = 5 * 60 * 1000; // 5 minutos
let idleCheckTime = 60 * 1000; // 1 minuto

/**
 * Crea o retorna una instancia global de Chromium (singleton)
 * con retry entre headless/GUI y reinicio cada cierto uso.
 * @param {boolean} tryHeadless - Indica si se debe intentar iniciar en modo headless.
 * @returns {Promise<Browser>} - La instancia del navegador.
 */
export async function getBrowser(tryHeadless = true) {
  // Si el browser ya está vivo y conectado, úsalo
  if (browserInstance && browserInstance.isConnected()) {
    usageCount++;
    if (usageCount >= MAX_USAGE) {
      console.log(`[BrowserManager] Reiniciando tras ${usageCount} usos...`);
      await browserInstance.close();
      browserInstance = null;
      usageCount = 0;
      return getBrowser(); // recrea
    }
    lastUse = Date.now();
    monitorIdleBrowser();
    return browserInstance;
  }

  // Si no existe o se cerró, créalo
  try {
    console.log(
      `[BrowserManager] Iniciando browser (headless=${tryHeadless})...`
    );

    browserInstance = await chromium.launch({
      headless: tryHeadless,
      devtools: !tryHeadless,
    });

    console.log("[BrowserManager] Browser iniciado correctamente.");
    usageCount = 0;
    return browserInstance;
  } catch (error) {
    if (browserInstance) await browserInstance.close();

    if (error.name === "TimeoutError" && tryHeadless) {
      console.warn(
        "[BrowserManager] Falla en headless. Reintentando con GUI..."
      );
      return getBrowser(false);
    } else {
      console.error("[BrowserManager] No se pudo iniciar el browser:", error);
      throw error;
    }
  }
}

function monitorIdleBrowser() {
  setTimeout(async () => {
    if (browserInstance && Date.now() - lastUse > maxIdleTime) {
      console.log("[BrowserManager] Cerrando por inactividad...");
      await browserInstance.close();
      browserInstance = null;
    }
  }, idleCheckTime);
}
