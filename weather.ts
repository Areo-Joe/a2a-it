import { zhiPuAI } from "./ai";
import { generateText } from "ai";

const WEATHER_TRUE = "WEATHER_QUERY_DETECTED_2024";
const WEATHER_FALSE = "NOT_WEATHER_QUERY_2024";

export const getWeather = (city: string) =>
  `城市: ${city}, 温度: 22°C, 天气: 晴`;

export async function isWeatherQuery(userInput: string): Promise<boolean> {
  try {
    const response = await generateText({
      model: zhiPuAI("glm-4.5"),
      messages: [
        {
          role: "system",
          content: `你是一个天气查询意图识别器。请判断用户的输入是否在询问天气信息。

如果用户在询问天气信息，请回答：${WEATHER_TRUE}
如果用户没有在询问天气信息，请回答：${WEATHER_FALSE}

请严格按照上述格式回答，不要添加任何其他内容。`,
        },
        {
          role: "user",
          content: userInput,
        },
      ],
    });

    const result = response.text?.trim() || "";

    // 使用includes进行更稳定的判断
    if (result.includes(WEATHER_TRUE)) {
      return true;
    } else if (result.includes(WEATHER_FALSE)) {
      return false;
    } else {
      // 如果AI没有返回预期的Magic string，保守判断为false
      console.warn("AI返回了意外的结果:", result);
      return false;
    }
  } catch (error) {
    console.error("天气判断失败:", error);
    // 失败时保守判断，返回false
    return false;
  }
}
