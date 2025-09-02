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
    if (requestContext.task) {
      await this.handleAsExistingTask(requestContext, eventBus);
      return;
    }

    const userMessage = requestContext.userMessage;
    const userInput = userMessage.parts
      .filter((part) => part.kind === "text")
      .map((part) => part.text)
      .join(" ");

    console.log(`[HelloWorldAgent] Processing: "${userInput}"`);

    if (await isWeatherQuery(userInput)) {
      // if is weather query, create a task
      await this.handleAsTask(requestContext, eventBus);
    } else {
      // if not weather query, send a direct message
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

    const { text } = await generateText({
      model: zhiPuAI("glm-4.5"),
      system:
        "你是一个天气助手，现在用户说了一句无关的话，你需要指导用户问你天气相关的问题",
      prompt: userInput,
    });

    // Create a direct message response.
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

    const { contextId, taskId } = requestContext;

    // 1. Create and publish initial task
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
      prompt: userInput,
      tools: {
        getWeather: {
          name: "getWeather",
          inputSchema: z.object({
            city: z.string(),
          }),
          description: "获取指定城市的天气信息",
        },
      },
    });

    const artifactId = uuidv4();

    const awaitedToolCalls: Array<{
      input: unknown;
      toolCallId: string;
      toolName: string;
    }> = [];

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

    console.log(`[HelloWorldAgent] ✅ Task ${taskId} completed`);
  }

  private async handleAsExistingTask(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ) {
    const task = requestContext.task!;
    const { taskId, contextId } = requestContext;

    const userConfirmSchema = z.object({
      allowedToolCalls: z.array(z.string()),
    });

    const { allowedToolCalls } = userConfirmSchema.parse(
      (requestContext.userMessage.parts[0] as DataPart).data
    );

    const { awaitedToolCalls } = (task.status.message!.parts[0] as DataPart)
      .data as {
      awaitedToolCalls: {
        input: unknown;
        toolCallId: string;
        toolName: string;
      }[];
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

      console.log(`Message ${JSON.stringify(messages, null, 2)}`);

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
