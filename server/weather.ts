import type { RequestContext } from "@a2a-js/sdk/server";
import { zhiPuAI } from "./ai";
import { generateText } from "ai";
import { extractText, log } from "./util";

const WEATHER_TRUE = "WEATHER_QUERY_DETECTED_2024";
const WEATHER_FALSE = "NOT_WEATHER_QUERY_ 2024";

export const getWeather = (city: string) =>
  `City: ${city}, Temperature: 22°C, Weather: Sunny`;

export async function isWeatherQuery(
  requestContext: RequestContext
): Promise<boolean> {
  try {
    const { text } = await generateText({
      model: zhiPuAI("glm-4.5"),
      messages: [
        {
          role: "system",
          content: `You are a weather query intent recognizer. Please determine whether the user's input is asking for weather information.

If the user is asking for weather information, please answer:${WEATHER_TRUE}
If the user is not asking for weather information, please answer:${WEATHER_FALSE}

Please answer strictly in the format above, do not add any other content.`,
        },
        {
          role: "user",
          content: extractText(requestContext),
        },
      ],
    });

    if (text.includes(WEATHER_TRUE)) {
      return true;
    } else if (text.includes(WEATHER_FALSE)) {
      return false;
    } else {
      log.warn("AI returned an unexpected result:", text);
      return false;
    }
  } catch (error) {
    log.error("Weather query intent recognition failed:", error);
    return false;
  }
}
