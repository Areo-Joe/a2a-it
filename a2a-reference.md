# A2A JavaScript SDK Reference

This document contains code snippets and examples for working with the A2A (Agent-to-Agent) JavaScript SDK.

## Installation

```bash
npm install @a2a-js/sdk
```

## Running Movie Info Agent

```bash
export TMDB_API_KEY=<api_key> # see https://developer.themoviedb.org/docs/getting-started
export GEMINI_API_KEY=<api_key>
npm run agents:movie-agent
```

## Server Setup

### Start A2A Server with Custom Agent Executor

```typescript
import express from 'express';

// Assuming coderAgentCard and MyAgentExecutor are defined elsewhere
// const coderAgentCard = { ... }; // Placeholder for agent card definition
// class MyAgentExecutor implements AgentExecutor { ... } // Placeholder for executor definition

// const taskStore: TaskStore = new InMemoryTaskStore();
// const agentExecutor: AgentExecutor = new MyAgentExecutor();

// const requestHandler = new DefaultRequestHandler(
//   coderAgentCard,
//   taskStore,
//   agentExecutor
// );

// const appBuilder = new A2AExpressApp(requestHandler);
// const expressApp = appBuilder.setupRoutes(express(), "");

// const PORT = process.env.CODER_AGENT_PORT || 41242; // Different port for coder agent
// expressApp.listen(PORT, () => {
//   console.log(
//     `[MyAgent] Server using new framework started on http://localhost:${PORT}`
//   );
//   console.log(
//     `[MyAgent] Agent Card: http://localhost:${PORT}/.well-known/agent.json`
//   );
//   console.log("[MyAgent] Press Ctrl+C to stop the server");
// });
```

## Client Usage

### A2A Client Basic Usage Example

```typescript
import { A2AClient } from "@a2a-js/sdk/client";
import type {
  Message,
  MessageSendParams,
  Task,
  TaskQueryParams,
  SendMessageResponse,
  GetTaskResponse,
  SendMessageSuccessResponse,
  GetTaskSuccessResponse,
} from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";

const client = new A2AClient("http://localhost:41241"); // Replace with your server URL

async function run() {
  const messageId = uuidv4();
  let taskId: string | undefined;

  try {
    // 1. Send a message to the agent.
    const sendParams: MessageSendParams = {
      message: {
        messageId: messageId,
        role: "user",
        parts: [{ kind: "text", text: "Hello, agent!" }],
        kind: "message",
      },
      configuration: {
        blocking: true,
        acceptedOutputModes: ["text/plain"],
      },
    };

    const sendResponse: SendMessageResponse =
      await client.sendMessage(sendParams);

    if (sendResponse.error) {
      console.error("Error sending message:", sendResponse.error);
      return;
    }

    // On success, the result can be a Task or a Message. Check which one it is.
    const result = (sendResponse as SendMessageSuccessResponse).result;

    if (result.kind === "task") {
      // The agent created a task.
      const taskResult = result as Task;
      console.log("Send Message Result (Task):", taskResult);
      taskId = taskResult.id; // Save the task ID for the next call
    } else if (result.kind === "message") {
      // The agent responded with a direct message.
      const messageResult = result as Message;
      console.log("Send Message Result (Direct Message):", messageResult);
      // No task was created, so we can't get task status.
    }

    // 2. If a task was created, get its status.
    if (taskId) {
      const getParams: TaskQueryParams = { id: taskId };
      const getResponse: GetTaskResponse = await client.getTask(getParams);

      if (getResponse.error) {
        console.error(`Error getting task ${taskId}:`, getResponse.error);
        return;
      }

      const getTaskResult = (getResponse as GetTaskSuccessResponse).result;
      console.log("Get Task Result:", getTaskResult);
    }
  } catch (error) {
    console.error("A2A Client Communication Error:", error);
  }
}

run();
```

## Agent Card Definition

### Define Agent Card for A2A Server in TypeScript

```typescript
import type { AgentCard } from "@a2a-js/sdk";

const movieAgentCard: AgentCard = {
  name: "Movie Agent",
  description:
    "An agent that can answer questions about movies and actors using TMDB.",
  // Adjust the base URL and port as needed.
  url: "http://localhost:41241/",
  provider: {
    organization: "A2A Agents",
    url: "https://example.com/a2a-agents", // Added provider URL
  },
  version: "0.0.2", // Incremented version
  capabilities: {
    streaming: true, // Supports streaming
    pushNotifications: false, // Assuming not implemented for this agent yet
    stateTransitionHistory: true, // Agent uses history
  },
  securitySchemes: undefined, // Or define actual security schemes if any
  security: undefined,
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "general_movie_chat",
      name: "General Movie Chat",
      description:
        "Answer general questions or chat about movies, actors, directors.",
      tags: ["movies", "actors", "directors"],
      examples: [
        "Tell me about the plot of Inception.",
        "Recommend a good sci-fi movie.",
        "Who directed The Matrix?",
        "What other movies has Scarlett Johansson been in?",
        "Find action movies starring Keanu Reeves",
        "Which came out first, Jurassic Park or Terminator 2?",
      ],
      inputModes: ["text/plain"], // Explicitly defining for skill
      outputModes: ["text/plain"], // Explicitly defining for skill
    },
  ],
  supportsAuthenticatedExtendedCard: false,
};
```

## Agent Executor Implementation

### Define Agent Executor Logic with TypeScript

```typescript
import {
  InMemoryTaskStore,
  TaskStore,
  A2AExpressApp,
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
  DefaultRequestHandler,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent
} from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';

// 1. Define your agent's logic as a AgentExecutor
class MyAgentExecutor implements AgentExecutor {
  private cancelledTasks = new Set<string>();

  public cancelTask = async (
    taskId: string,
    eventBus: ExecutionEventBus
  ): Promise<void> => {
    this.cancelledTasks.add(taskId);
    // The execute loop is responsible for publishing the final state
  };

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const userMessage = requestContext.userMessage;
    const existingTask = requestContext.task;

    // Determine IDs for the task and context, from requestContext.
    const taskId = requestContext.taskId;
    const contextId = requestContext.contextId;

    console.log(
      `[MyAgentExecutor] Processing message ${userMessage.messageId} for task ${taskId} (context: ${contextId})`
    );

    // 1. Publish initial Task event if it's a new task
    if (!existingTask) {
      const initialTask: Task = {
        kind: "task",
        id: taskId,
        contextId: contextId,
        status: {
          state: "submitted",
          timestamp: new Date().toISOString(),
        },
        history: [userMessage],
        metadata: userMessage.metadata,
        artifacts: [], // Initialize artifacts array
      };
      eventBus.publish(initialTask);
    }

    // 2. Publish "working" status update
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
          parts: [{ kind: "text", text: "Generating code..." }],
          taskId: taskId,
          contextId: contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: false,
    };
    eventBus.publish(workingStatusUpdate);

    // Simulate work...
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check for request cancellation
    if (this.cancelledTasks.has(taskId)) {
      console.log(`[MyAgentExecutor] Request cancelled for task: ${taskId}`);
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

    // 3. Publish artifact update
    const artifactUpdate: TaskArtifactUpdateEvent = {
      kind: "artifact-update",
      taskId: taskId,
      contextId: contextId,
      artifact: {
        artifactId: "artifact-1",
        name: "artifact-1",
        parts: [{ text: `Task ${requestContext.task.id} completed.` }],
      },
      append: false, // Each emission is a complete file snapshot
      lastChunk: true, // True for this file artifact
    };
    eventBus.publish(artifactUpdate);

    // 4. Publish final status update
    const finalUpdate: TaskStatusUpdateEvent = {
      kind: "status-update",
      taskId: taskId,
      contextId: contextId,
      status: {
        state: "completed",
        message: {
          kind: "message",
          role: "agent",
          messageId: uuidv4(),
          taskId: taskId,
          contextId: contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: true,
    };
    eventBus.publish(finalUpdate);
    eventBus.finished();
  }
}
```

## Streaming

### Stream Task with A2A JS SDK

```typescript
import { A2AClient } from "@a2a-js/sdk/client";
import type {
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  MessageSendParams,
  Task,
  Message,
} from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";

const client = new A2AClient("http://localhost:41241");

async function streamTask() {
  const messageId = uuidv4();
  try {
    console.log("\n--- Starting streaming task for message " + messageId + " ---");

    // Construct the `MessageSendParams` object.
    const streamParams: MessageSendParams = {
      message: {
        messageId: messageId,
        role: "user",
        parts: [{ kind: "text", text: "Stream me some updates!" }],
        kind: "message",
      },
    };

    // Use the `sendMessageStream` method.
    const stream = client.sendMessageStream(streamParams);
    let currentTaskId: string | undefined;

    for await (const event of stream) {
      // The first event is often the Task object itself, establishing the ID.
      if ((event as Task).kind === "task") {
        currentTaskId = (event as Task).id;
        console.log(
          "[" + currentTaskId + "] Task created. Status: " + (event as Task).status.state
        );
        continue;
      }

      // Differentiate subsequent stream events.
      if ((event as TaskStatusUpdateEvent).kind === "status-update") {
        const statusEvent = event as TaskStatusUpdateEvent;
        console.log(
          "[" + statusEvent.taskId + "] Status Update: " + statusEvent.status.state + " - " +
          (statusEvent.status.message?.parts[0]?.text ?? "")
        );
        if (statusEvent.final) {
          console.log("[" + statusEvent.taskId + "] Stream marked as final.");
          break; // Exit loop when server signals completion
        }
      } else if (
        (event as TaskArtifactUpdateEvent).kind === "artifact-update"
      ) {
        const artifactEvent = event as TaskArtifactUpdateEvent;
        // Use artifact.name or artifact.artifactId for identification
        console.log(
          "[" + artifactEvent.taskId + "] Artifact Update: " +
          (artifactEvent.artifact.name ?? artifactEvent.artifactId) + " - Part Count: " + artifactEvent.artifact.parts.length
        );
      } else {
        // This could be a direct Message response if the agent doesn't create a task.
        console.log("Received direct message response in stream:", event);
      }
    }
    console.log("--- Streaming for message " + messageId + " finished ---");
  } catch (error) {
    console.error("Error during streaming for message " + messageId + ":", error);
  }
}

streamTask();
```

## API Reference

### A2AClient API

- `sendMessage(params: MessageSendParams)`: Sends a message to the A2A agent
- `sendMessageStream(params: MessageSendParams)`: Sends a message and returns streaming responses
- `getTask(params: TaskQueryParams)`: Retrieves task status and results
- `cancelTask(params: TaskQueryParams)`: Cancels an ongoing task
- `setTaskPushNotificationConfig()`: Configures push notifications for tasks
- `getTaskPushNotificationConfig()`: Gets push notification configuration
- `resubscribeTask()`: Resubscribes to task updates

### AgentExecutor Interface

```typescript
interface AgentExecutor {
  execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
  cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void>;
}
```

### Key Types

- `AgentCard`: Defines agent metadata, capabilities, and skills
- `Task`: Represents a task with status, history, and artifacts
- `Message`: Represents a message with role, parts, and metadata
- `ExecutionEventBus`: Interface for publishing task events
- `RequestContext`: Contains request information including user message and task data

## Important Notes

1. Always use `bun` instead of `npm` for package management in this project
2. Agent cards must include proper URL, provider information, and skills definition
3. Tasks can have multiple states: submitted, working, completed, canceled
4. Streaming is supported for real-time task updates
5. Error handling is crucial for robust A2A communication
