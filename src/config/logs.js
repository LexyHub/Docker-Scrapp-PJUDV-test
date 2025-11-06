import pino from "pino";

export const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      singleLine: true,
      ignore: "pid,hostname",
    },
  },
});

const LOGS = { info: {}, warn: {}, error: {}, debug: {} };

export function getLogs() {
  return LOGS;
}

export function logToFile({ message, type = "info", timestamp = new Date() }) {
  if (!LOGS[type]) {
    LOGS[type] = {};
  }
  const timeKey = timestamp.toISOString();
  if (!LOGS[type][timeKey]) {
    LOGS[type][timeKey] = [];
  }
  LOGS[type][timeKey].push(message);
}

import { promises as fs } from "fs";

export async function exportLogs() {
  const dir = "data/logs";
  await fs.mkdir(dir, { recursive: true });

  for (const type in LOGS) {
    if (!LOGS[type]) continue;
    const filePath = `${dir}/${type}.json`;
    await fs.writeFile(filePath, JSON.stringify(LOGS[type], null, 2), "utf-8");
  }
}
