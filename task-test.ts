import { A2AClient } from "@a2a-js/sdk/client";
import type {
  MessageSendParams,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  Message,
  DataPart,
} from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";

interface AwaitedToolCall {
  input: unknown;
  toolCallId: string;
  toolName: string;
}

const client = await A2AClient.fromCardUrl(
  "http://localhost:3000/.well-known/agent-card.json"
);

const { contextId, taskId, awaitedToolCalls } = await askWeather();

await allowToolCall({ contextId, taskId, awaitedToolCalls });

async function askWeather() {
  let taskStatus = "";
  let awaitedToolCalls: AwaitedToolCall[] = [];
  let contextId = "";
  let taskId = "";

  const messageId = uuidv4();
  const streamParams: MessageSendParams = {
    message: {
      messageId: messageId,
      role: "user",
      parts: [{ kind: "text", text: "weather of shenzhen?" }],
      kind: "message",
    },
    configuration: {
      acceptedOutputModes: ["text/plain"],
    },
  };

  const stream = client.sendMessageStream(streamParams);
  let eventCount = 0;

  console.log("🎬 Stream started, listening for events...");

  for await (const event of stream) {
    eventCount++;
    console.log(`📺 Event #${eventCount}:`, event.kind);

    // 处理不同的流事件类型
    if (event.kind === "task") {
      const taskEvent = event;
      console.log(`📋 Task created: ${taskEvent.id}`);
      console.log(`📊 Initial status: ${taskEvent.status.state}`);
      taskStatus = taskEvent.status.state;
    } else if (event.kind === "status-update") {
      const statusEvent = event;
      console.log(`🔄 Status update: ${statusEvent.status.state}`);
      taskStatus = statusEvent.status.state;
      if (statusEvent.status.message) {
        const messageText = JSON.stringify(statusEvent.status.message, null, 2);
        console.log(`💬 Status message: ${messageText}`);
      }

      if (taskStatus === "input-required") {
        awaitedToolCalls = (
          (statusEvent.status.message!.parts[0] as DataPart).data as {
            awaitedToolCalls: AwaitedToolCall[];
          }
        ).awaitedToolCalls;
        taskId = statusEvent.taskId;
        contextId = statusEvent.contextId;
      }
    } else if (event.kind === "artifact-update") {
      const artifactEvent = event;
      console.log(
        `📦 Artifact update: ${
          artifactEvent.artifact.name || artifactEvent.artifact.artifactId
        }`
      );
      console.log(`📊 Part count: ${artifactEvent.artifact.parts.length}`);
    } else if (event.kind === "message") {
      const messageEvent = event as Message;
      const messageText = messageEvent.parts
        .filter((part) => part.kind === "text")
        .map((part) => part.text)
        .join(" ");
      console.log(`💬 Direct message: ${messageText}`);
    } else {
      console.log(`❓ Unknown event type:`, event);
    }
  }

  return {
    contextId,
    taskId,
    awaitedToolCalls,
  };
}

async function allowToolCall({
  contextId,
  taskId,
  awaitedToolCalls,
}: {
  contextId: string;
  taskId: string;
  awaitedToolCalls: AwaitedToolCall[];
}) {
  const messageId = uuidv4();
  const streamParams: MessageSendParams = {
    message: {
      contextId,
      taskId,
      messageId,
      role: "user",
      parts: [
        {
          kind: "data",
          data: { allowedToolCalls: awaitedToolCalls.map((x) => x.toolCallId) },
        },
      ],
      kind: "message",
    },
  };

  const stream = client.sendMessageStream(streamParams);

  for await (const event of stream) {
    console.log(JSON.stringify(event, null, 2));
  }
}
