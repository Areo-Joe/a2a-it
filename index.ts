import express from "express";
import { v4 as uuidv4 } from "uuid";
import type {
  AgentCard,
  DataPart,
  Message,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
} from "@a2a-js/sdk";
import {
  RequestContext,
  DefaultRequestHandler,
  InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import type { AgentExecutor, ExecutionEventBus } from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import { getWeather, isWeatherQuery } from "./weather";
import { generateText, streamText, type ModelMessage } from "ai";
import { zhiPuAI } from "./ai";
import z from "zod";

interface ToolCall {
  input: unknown;
  toolCallId: string;
  toolName: string;
}

const allowedToolCallsSchema = z.object({
  allowedToolCalls: z.array(z.string()),
});

const log = {
  info: (...args: any[]) => {
    console.info("[WeatherAgent]", ...args);
  },
  error: (...args: any[]) => {
    console.error("[WeatherAgent]", ...args);
  },
  log: (...args: any[]) => {
    console.log("[WeatherAgent]", ...args);
  },
};

const weatherAgentCard: AgentCard = {
  name: "Weather Agent",
  description: "A simple agent that responds with weather messages.",
  protocolVersion: "0.3.0",
  version: "1.0.0",
  url: "http://localhost:3000/",
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "weather",
      name: "Weather Response",
      description: "Responds with weather to any message",
      tags: ["weather"],
    },
  ],
};

class WeatherAgentExecutor implements AgentExecutor {
  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    if (requestContext.task) {
      log.log(`📋 Task detected, handling as allowing tool calls`);
      await this.handleAsExistingTask(requestContext, eventBus);
      return;
    }

    if (await isWeatherQuery(requestContext)) {
      log.log(`📋 Creating a new task to handle weather query`);
      await this.handleAsTask(requestContext, eventBus);
    } else {
      log.log(`📋 Creating a simple message to handle non-weather query`);
      await this.handleAsDirectMessage(requestContext, eventBus);
    }
  }

  private async handleAsDirectMessage(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const { text } = await generateText({
      model: zhiPuAI("glm-4.5"),
      system:
        "You are a weather assistant. Now that the user has said something irrelevant, you need to guide the user to ask you weather-related questions.",
      prompt: extractText(requestContext),
    });

    const responseMessage: Message = {
      kind: "message",
      messageId: uuidv4(),
      role: "agent",
      parts: [
        {
          kind: "text",
          text,
        },
      ],
      contextId: requestContext.contextId,
    };

    eventBus.publish(responseMessage);
    eventBus.finished();

    log.log(`✅ Direct message sent`);
  }

  private async handleAsTask(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const { contextId, taskId } = requestContext;

    const initialTask: Task = {
      kind: "task",
      id: taskId,
      contextId,
      status: {
        state: "submitted",
        timestamp: new Date().toISOString(),
      },
      history: [requestContext.userMessage],
    };
    eventBus.publish(initialTask);

    const stream = streamText({
      model: zhiPuAI("glm-4.5"),
      prompt: extractText(requestContext),
      tools: {
        getWeather: {
          name: "getWeather",
          inputSchema: z.object({
            city: z.string(),
          }),
          description: "Get weather information for a specified city",
        },
      },
    });

    const artifactId = uuidv4();

    const awaitedToolCalls: Array<ToolCall> = [];

    for await (let chunk of stream.fullStream) {
      if (chunk.type === "text-delta") {
        const artifactUpdate: TaskArtifactUpdateEvent = {
          contextId,
          taskId,
          kind: "artifact-update",
          artifact: {
            artifactId,
            parts: [{ kind: "text", text: chunk.text }],
          },
        };
        eventBus.publish(artifactUpdate);
      }

      if (chunk.type === "tool-call") {
        const { input, toolCallId, toolName } = chunk;
        awaitedToolCalls.push({ input, toolCallId, toolName });
      }
    }

    if (awaitedToolCalls.length === 0) {
      const statusUpdate: TaskStatusUpdateEvent = {
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "completed",
        },
        final: true,
      };

      eventBus.publish(statusUpdate);
    } else {
      // Need to wait for the user to allow the tool calls
      const statusUpdate: TaskStatusUpdateEvent = {
        contextId,
        taskId,
        kind: "status-update",
        status: {
          state: "input-required",
          message: {
            kind: "message",
            messageId: uuidv4(),
            role: "agent",
            parts: [
              {
                kind: "data",
                data: {
                  awaitedToolCalls,
                },
              },
            ],
          },
        },
        final: true,
      };
      eventBus.publish(statusUpdate);
    }
  }

  private async handleAsExistingTask(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ) {
    const task = requestContext.task!;
    const { taskId, contextId } = requestContext;

    const { allowedToolCalls } = allowedToolCallsSchema.parse(
      (requestContext.userMessage.parts[0] as DataPart).data
    );

    const { awaitedToolCalls } = (task.status.message!.parts[0] as DataPart)
      .data as {
      awaitedToolCalls: ToolCall[];
    };

    const stillAwaited = awaitedToolCalls.filter(
      (x) => !allowedToolCalls.includes(x.toolCallId)
    );
    const called = awaitedToolCalls
      .filter((x) => allowedToolCalls.includes(x.toolCallId))
      .map((x) => ({
        ...x,
        result: getWeather((x as unknown as { city: string }).city),
      }));

    if (stillAwaited.length === 0) {
      // No more tool calls to wait for, we can complete the task, call LLM
      const workingStatusUpdate: TaskStatusUpdateEvent = {
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "working",
          message: {
            kind: "message",
            messageId: uuidv4(),
            role: "agent",
            parts: [
              {
                kind: "data",
                data: {
                  awaitedToolCalls: [],
                  executedToolCalls: called,
                },
              },
            ],
          },
        },
        final: false,
      };

      eventBus.publish(workingStatusUpdate);

      const toolCallMessages = called.flatMap<ModelMessage>((x) => [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: x.toolCallId,
              input: x.input,
              toolName: x.toolName,
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              output: { type: "text", value: x.result },
              toolCallId: x.toolCallId,
              toolName: x.toolName,
            },
          ],
        },
      ]);

      const messages: ModelMessage[] = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: task
                .history![0]!.parts.filter((x) => x.kind === "text")
                .map((x) => x.text)
                .join(" "),
            },
          ],
        },
        ...toolCallMessages,
      ];

      const stream = streamText({
        model: zhiPuAI("glm-4.5"),
        messages,
      });

      const artifactId = uuidv4();

      for await (const chunk of stream.fullStream) {
        if (chunk.type === "text-delta") {
          const artifactUpdate: TaskArtifactUpdateEvent = {
            contextId,
            taskId,
            kind: "artifact-update",
            artifact: {
              artifactId,
              parts: [{ kind: "text", text: chunk.text }],
            },
          };
          eventBus.publish(artifactUpdate);
        }
      }

      const completedStatusUpdate: TaskStatusUpdateEvent = {
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "completed",
        },
        final: true,
      };

      eventBus.publish(completedStatusUpdate);
    } else {
      // Still waiting for some tool calls to be executed
      const statusUpdate: TaskStatusUpdateEvent = {
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "input-required",
          message: {
            kind: "message",
            messageId: uuidv4(),
            role: "agent",
            parts: [
              {
                kind: "data",
                data: {
                  executedToolCalls: called,
                  awaitedToolCalls: stillAwaited,
                },
              },
            ],
          },
        },
        final: true,
      };

      eventBus.publish(statusUpdate);
    }
  }

  async cancelTask(
    taskId: string,
    eventBus: ExecutionEventBus
  ): Promise<void> {}
}

const agentExecutor = new WeatherAgentExecutor();
const requestHandler = new DefaultRequestHandler(
  weatherAgentCard,
  new InMemoryTaskStore(),
  agentExecutor
);

const appBuilder = new A2AExpressApp(requestHandler);
const expressApp = appBuilder.setupRoutes(express());

expressApp.listen(3000, () => {
  log.log(`🚀 Weather A2A Server started on http://localhost:3000`);
  log.log(`📋 Agent Card: http://localhost:3000/.well-known/agent-card.json`);
  log.log(`🛑 Press Ctrl+C to stop the server`);
});

function extractText(requestContext: RequestContext) {
  return requestContext.userMessage.parts
    .filter((part) => part.kind === "text")
    .map((part) => part.text)
    .join("");
}
