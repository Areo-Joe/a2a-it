import express from "express";
import { v4 as uuidv4 } from "uuid";
import type {
  AgentCard,
  Message,
  Task,
  TaskStatusUpdateEvent,
} from "@a2a-js/sdk";
import {
  RequestContext,
  DefaultRequestHandler,
  InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import type { AgentExecutor, ExecutionEventBus } from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import { zhiPuAI } from "./ai";
import { generateText } from "ai";

// Magic strings for weather query detection
const WEATHER_TRUE = "WEATHER_QUERY_DETECTED_2024";
const WEATHER_FALSE = "NOT_WEATHER_QUERY_2024";

// 天气判断函数 - 使用智谱AI判断是否是天气查询
async function isWeatherQuery(userInput: string): Promise<boolean> {
  try {
    const response = await generateText({
      model: zhiPuAI("glm-4.5"),
      messages: [
        {
          role: "system",
          content: `你是一个天气查询意图识别器。请判断用户的输入是否在询问天气信息。

如果用户在询问天气信息，请回答：${WEATHER_TRUE}
如果用户没有在询问天气信息，请回答：${WEATHER_FALSE}

请严格按照上述格式回答，不要添加任何其他内容。`
        },
        {
          role: "user",
          content: userInput
        }
      ]
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

// 1. Define your agent's identity card.
const helloWorldAgentCard: AgentCard = {
  name: "Hello World Agent",
  description: "A simple agent that responds with Hello World messages.",
  protocolVersion: "0.3.0",
  version: "1.0.0",
  url: "http://localhost:3000/", // The public URL of your agent server
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "hello_world",
      name: "Hello World Response",
      description: "Responds with Hello World to any message",
      tags: ["hello", "world", "greeting"],
    },
  ],
};

// 2. Implement the agent's logic.
class HelloWorldAgentExecutor implements AgentExecutor {
  private activeTasks = new Set<string>();

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const userMessage = requestContext.userMessage;
    const userInput = userMessage.parts
      .filter((part) => part.kind === "text")
      .map((part) => part.text)
      .join(" ");

    console.log(`[HelloWorldAgent] Processing: "${userInput}"`);

    // 随机决定：50% 直接返回消息，50% 创建任务
    const shouldCreateTask = Math.random() < 0.5;

    if (shouldCreateTask) {
      await this.handleAsTask(requestContext, eventBus);
    } else {
      await this.handleAsDirectMessage(requestContext, eventBus);
    }
  }

  private async handleAsDirectMessage(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const userInput = requestContext.userMessage.parts
      .filter((part) => part.kind === "text")
      .map((part) => part.text)
      .join(" ");

    console.log(`[HelloWorldAgent] 📨 Handling as direct message`);

    // Create a direct message response.
    const responseMessage: Message = {
      kind: "message",
      messageId: uuidv4(),
      role: "agent",
      parts: [
        {
          kind: "text",
          text: `Hello World! I received your message: "${userInput}" (Direct Response)`,
        },
      ],
      contextId: requestContext.contextId,
    };

    // Publish the message and signal that the interaction is finished.
    eventBus.publish(responseMessage);
    eventBus.finished();

    console.log(`[HelloWorldAgent] ✅ Direct message sent`);
  }

  private async handleAsTask(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const userInput = requestContext.userMessage.parts
      .filter((part) => part.kind === "text")
      .map((part) => part.text)
      .join(" ");

    console.log(`[HelloWorldAgent] 📋 Handling as task`);

    const taskId = requestContext.taskId;
    const contextId = requestContext.contextId;

    // Mark task as active
    this.activeTasks.add(taskId);

    // 1. Create and publish initial task
    const initialTask: Task = {
      kind: "task",
      id: taskId,
      contextId: contextId,
      status: {
        state: "submitted",
        timestamp: new Date().toISOString(),
      },
      history: [requestContext.userMessage],
      metadata: requestContext.userMessage.metadata,
      artifacts: [],
    };
    eventBus.publish(initialTask);

    // 2. Update to "working" status
    const workingStatusUpdate: TaskStatusUpdateEvent = {
      kind: "status-update",
      taskId: taskId,
      contextId: contextId,
      status: {
        state: "working",
        message: {
          kind: "message",
          role: "agent",
          messageId: uuidv4(),
          parts: [
            {
              kind: "text",
              text: "Starting to process your Hello World request...",
            },
          ],
          taskId: taskId,
          contextId: contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: false,
    };
    eventBus.publish(workingStatusUpdate);

    // 3. Simulate processing with multiple stages
    console.log(`[HelloWorldAgent] 🔄 Processing task ${taskId}...`);

    // Stage 1: Initial processing (1 second)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Update status to show progress
    const progressUpdate: TaskStatusUpdateEvent = {
      kind: "status-update",
      taskId: taskId,
      contextId: contextId,
      status: {
        state: "working",
        message: {
          kind: "message",
          role: "agent",
          messageId: uuidv4(),
          parts: [{ kind: "text", text: "Processing your message..." }],
          taskId: taskId,
          contextId: contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: false,
    };
    eventBus.publish(progressUpdate);

    // Stage 2: Final processing (1.5 seconds)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Check if task was cancelled
    if (!this.activeTasks.has(taskId)) {
      console.log(`[HelloWorldAgent] ❌ Task ${taskId} was cancelled`);
      const cancelledUpdate: TaskStatusUpdateEvent = {
        kind: "status-update",
        taskId: taskId,
        contextId: contextId,
        status: {
          state: "canceled",
          timestamp: new Date().toISOString(),
        },
        final: true,
      };
      eventBus.publish(cancelledUpdate);
      eventBus.finished();
      return;
    }

    // 4. Complete the task
    const completionStatusUpdate: TaskStatusUpdateEvent = {
      kind: "status-update",
      taskId: taskId,
      contextId: contextId,
      status: {
        state: "completed",
        message: {
          kind: "message",
          role: "agent",
          messageId: uuidv4(),
          parts: [
            {
              kind: "text",
              text: `Hello World! I received your message: "${userInput}" (Task Completed)`,
            },
          ],
          taskId: taskId,
          contextId: contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: true,
    };
    eventBus.publish(completionStatusUpdate);
    eventBus.finished();

    // Clean up
    this.activeTasks.delete(taskId);
    console.log(`[HelloWorldAgent] ✅ Task ${taskId} completed`);
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    console.log(`[HelloWorldAgent] 🛑 Cancelling task: ${taskId}`);
    this.activeTasks.delete(taskId);
  }
}

// 3. Set up and run the server.
const agentExecutor = new HelloWorldAgentExecutor();
const requestHandler = new DefaultRequestHandler(
  helloWorldAgentCard,
  new InMemoryTaskStore(),
  agentExecutor
);

const appBuilder = new A2AExpressApp(requestHandler);
const expressApp = appBuilder.setupRoutes(express());

expressApp.listen(3000, () => {
  console.log(`🚀 Hello World A2A Server started on http://localhost:3000`);
  console.log(`📋 Agent Card: http://localhost:3000/.well-known/agent.json`);
  console.log(`🛑 Press Ctrl+C to stop the server`);
});
