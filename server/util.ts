import type { RequestContext } from "@a2a-js/sdk/server";

export function extractText(requestContext: RequestContext) {
  return requestContext.userMessage.parts
    .filter((part) => part.kind === "text")
    .map((part) => part.text)
    .join("");
}

export const log = {
  log: (...args: any[]) => {
    console.log("[WeatherAgent]", ...args);
  },
  info: (...args: any[]) => {
    console.info("[WeatherAgent]", ...args);
  },
  warn: (...args: any[]) => {
    console.warn("[WeatherAgent]", ...args);
  },
  error: (...args: any[]) => {
    console.error("[WeatherAgent]", ...args);
  },
};
