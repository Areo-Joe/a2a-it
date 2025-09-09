import type { DataPart, MessageSendParams } from "@a2a-js/sdk";
import { A2AClient } from "@a2a-js/sdk/client";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

type UserMessage = {
  kind: "user-message";
  text: string;
};

type AgentMessage = {
  kind: "agent-message";
  text: string;
  contextId: string;
};

type AgentCreateTask = {
  kind: "agent-create-task";
  contextId: string;
  taskId: string;
  awaitedToolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
  }>;
  artifacts: Record<string, string>;
  state: string;
};

type UserAllowToolCalls = {
  kind: "user-allow-tool-calls";
  contextId: string;
  taskId: string;
  allowedToolCalls: Array<{
    toolCallId: string;
  }>;
};

type AgentUpdateTask = {
  kind: "agent-update-task";
  contextId: string;
  taskId: string;
  artifacts: Record<string, string>;
  awaitedToolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
  }>;
  state: string;
};

type UIMessages =
  | UserMessage
  | AgentMessage
  | AgentCreateTask
  | UserAllowToolCalls
  | AgentUpdateTask;

const awaitedToolCallsSchema = z.object({
  awaitedToolCalls: z.array(
    z.object({
      toolCallId: z.string(),
      toolName: z.string(),
      input: z.unknown(),
    })
  ),
});

export function useA2AClient() {
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<A2AClient | null>(null);

  useEffect(() => {
    A2AClient.fromCardUrl("/api/.well-known/agent-card.json").then((client) => {
      setClient(client);
      setLoading(false);
    });
  }, []);

  return { client, loading };
}

export function useA2A(client: A2AClient) {
  const [uiMessages, setUiMessages] = useState<UIMessages[]>([]);

  const sendMessage = async (message: string) => {
    setUiMessages((prev) => [...prev, { kind: "user-message", text: message }]);

    const messageId = uuidv4();

    const streamParams: MessageSendParams = {
      message: {
        messageId,
        role: "user",
        parts: [{ kind: "text", text: message }],
        kind: "message",
      },
      configuration: {
        acceptedOutputModes: ["text/plain"],
      },
    };

    const stream = client.sendMessageStream(streamParams);

    let responseKind: "agent-message" | "agent-create-task";
    let responseIndex: number;

    for await (const event of stream) {
      if (!responseKind) {
        if (event.kind === "message") {
          responseKind = "agent-message";

          const responseUiMessage: AgentMessage = {
            contextId: event.contextId,
            kind: "agent-message",
            text: event.parts
              .filter((part) => part.kind === "text")
              .map((part) => part.text)
              .join(""),
          };

          setUiMessages((prev) => {
            const result = [...prev, responseUiMessage];
            responseIndex = result.length - 1;
            return result;
          });

          continue;
        } else if (event.kind === "task") {
          responseKind = "agent-create-task";

          const responseUiMessage: AgentCreateTask = {
            kind: "agent-create-task",
            contextId: event.contextId,
            taskId: event.id,
            state: event.status.state,
            awaitedToolCalls: [],
            artifacts: (event.artifacts ?? []).reduce<Record<string, string>>(
              (acc, cur) => {
                acc[cur.artifactId] = cur.parts
                  .filter((part) => part.kind === "text")
                  .map((part) => part.text)
                  .join("");

                return acc;
              },
              {}
            ),
          };

          setUiMessages((prev) => {
            const result = [...prev, responseUiMessage];
            responseIndex = result.length - 1;
            return result;
          });

          continue;
        } else {
          throw new Error("unreachable");
        }
      }

      if (event.kind === "artifact-update") {
        setUiMessages((prev) => {
          const currentMessage = prev[responseIndex];
          if (currentMessage.kind !== "agent-create-task") {
            throw new Error("unreachable");
          }

          const delta = event.artifact.parts
            .filter((part) => part.kind === "text")
            .map((part) => part.text)
            .join("");

          const finalResult = event.append
            ? (currentMessage.artifacts[event.artifact.artifactId] ?? "") +
              delta
            : delta;

          return [
            ...prev.slice(0, responseIndex),
            {
              ...currentMessage,
              artifacts: {
                ...currentMessage.artifacts,
                [event.artifact.artifactId]: finalResult,
              },
            },
            ...prev.slice(responseIndex + 1),
          ];
        });
      } else if (event.kind === "status-update") {
        setUiMessages((prev) => {
          const currentMessage = prev[responseIndex];
          if (currentMessage.kind !== "agent-create-task") {
            throw new Error("unreachable");
          }

          const newState = event.status.state;
          const newAwaitedToolCalls = awaitedToolCallsSchema.safeParse(
            (event.status.message?.parts[0] as DataPart | undefined)?.data
          );

          return [
            ...prev.slice(0, responseIndex),
            {
              ...currentMessage,
              state: newState,
              awaitedToolCalls: newAwaitedToolCalls.success
                ? newAwaitedToolCalls.data.awaitedToolCalls
                : currentMessage.awaitedToolCalls,
            },
            ...prev.slice(responseIndex + 1),
          ];
        });
      } else {
        throw new Error("unreachable");
      }
    }
  };

  const allowToolCall = async ({
    contextId,
    taskId,
    allowedToolCalls,
  }: {
    contextId: string;
    taskId: string;
    allowedToolCalls: Array<string>;
  }) => {
    const userAllowToolCalls: UserAllowToolCalls = {
      allowedToolCalls: allowedToolCalls.map((toolCallId) => ({
        toolCallId,
      })),
      taskId,
      kind: "user-allow-tool-calls",
      contextId,
    };

    setUiMessages((prev) => [...prev, userAllowToolCalls]);

    const messageId = uuidv4();

    const streamParams: MessageSendParams = {
      message: {
        contextId,
        taskId,
        messageId,
        role: "user",
        parts: [{ kind: "data", data: { allowedToolCalls: allowedToolCalls } }],
        kind: "message",
      },
    };

    const stream = client.sendMessageStream(streamParams);

    let agentUpdateTask: AgentUpdateTask;
    let responseIndex: number;

    for await (const event of stream) {
      if (event.kind !== "artifact-update" && event.kind !== "status-update") {
        throw new Error("unreachable");
      }
      if (!agentUpdateTask) {
        if (event.kind !== "status-update") {
          throw new Error("unreachable");
        }

        const awaitedToolCalls = awaitedToolCallsSchema.safeParse(
          (event.status.message?.parts[0] as DataPart)?.data
        );

        agentUpdateTask = {
          kind: "agent-update-task",
          contextId: event.contextId,
          taskId: event.taskId,
          state: event.status.state,
          artifacts: {},
          awaitedToolCalls: awaitedToolCalls.success
            ? awaitedToolCalls.data.awaitedToolCalls
            : [],
        };

        setUiMessages((prev) => {
          const result = [...prev, agentUpdateTask];
          responseIndex = result.length - 1;
          return result;
        });

        continue;
      }

      if (event.kind === "artifact-update") {
        const delta = event.artifact.parts
          .filter((part) => part.kind === "text")
          .map((part) => part.text)
          .join("");

        setUiMessages((prev) => {
          const currentMessage = prev[responseIndex];
          if (currentMessage.kind !== "agent-update-task") {
            throw new Error("unreachable");
          }

          return [
            ...prev.slice(0, responseIndex),
            {
              ...currentMessage,
              artifacts: {
                ...currentMessage.artifacts,
                [event.artifact.artifactId]: event.append
                  ? (currentMessage.artifacts[event.artifact.artifactId] ??
                      "") + delta
                  : delta,
              },
            },
            ...prev.slice(responseIndex + 1),
          ];
        });
      }

      if (event.kind === "status-update") {
        const newState = event.status.state;
        const newAwaitedToolCalls = awaitedToolCallsSchema.safeParse(
          (event.status.message?.parts[0] as DataPart)?.data
        );

        setUiMessages((prev) => {
          const currentMessage = prev[responseIndex];
          if (currentMessage.kind !== "agent-update-task") {
            throw new Error("unreachable");
          }

          return [
            ...prev.slice(0, responseIndex),
            {
              ...currentMessage,
              state: newState,
              awaitedToolCalls: newAwaitedToolCalls.success
                ? newAwaitedToolCalls.data.awaitedToolCalls
                : currentMessage.awaitedToolCalls,
            },
            ...prev.slice(responseIndex + 1),
          ];
        });
      }
    }
  };

  return {
    uiMessages,
    sendMessage,
    allowToolCall,
  };
}
