import { createOpenAI } from "@ai-sdk/openai";

export const zhiPuAI = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://open.bigmodel.cn/api/paas/v4/",
}).chat;
