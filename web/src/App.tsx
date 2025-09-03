"use client";

import "./index.css";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { A2AClient } from "@a2a-js/sdk/client";
import { useState } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { useA2A, useA2AClient } from "./useA2A";
import { Badge } from "@/components/ui/badge";
import { Message, MessageContent } from "./components/message";
import { Tool, ToolContent, ToolHeader, ToolInput } from "./components/tool";

function EnsureClient() {
  const { client, loading } = useA2AClient();
  if (loading) {
    return <div>Loading...</div>;
  }
  return <AppContent client={client} />;
}

function AppContent({ client }: { client: A2AClient }) {
  const { uiMessages, sendMessage, allowToolCall } = useA2A(client);
  const [input, setInput] = useState("");

  const lastMessage = uiMessages[uiMessages.length - 1];

  return (
    <div className="flex flex-col gap-2 max-w-3xl min-w-3xl">
      {uiMessages.map((message) => {
        if (message.kind === "user-message") {
          return (
            <Message from="user">
              <MessageContent>{message.text}</MessageContent>
            </Message>
          );
        } else if (message.kind === "agent-message") {
          return (
            <Message from="assistant">
              <MessageContent>{message.text}</MessageContent>
            </Message>
          );
        } else if (message.kind === "agent-create-task") {
          return (
            <>
              <Message from="assistant">
                <MessageContent>
                  <Badge>{message.state}</Badge>
                  {Object.entries(message.artifacts).map(([key, value]) => {
                    return (
                      <>
                        <h3>{key}</h3>
                        <p>{value}</p>
                      </>
                    );
                  })}
                  {message.awaitedToolCalls.map((tool) => (
                    <Tool>
                      <ToolHeader
                        type={tool.toolName}
                        state={"input-available" as const}
                        badge={
                          <Badge className="gap-1.5 rounded-full text-xs">
                            awaited
                          </Badge>
                        }
                      />
                      <ToolContent>
                        <ToolInput input={tool.input} />
                      </ToolContent>
                    </Tool>
                  ))}
                </MessageContent>
              </Message>
            </>
          );
        } else if (message.kind === "agent-update-task") {
          return (
            <>
              <Message from="assistant">
                <MessageContent>
                  <Badge>{message.state}</Badge>
                  {Object.entries(message.artifacts).map(([key, value]) => {
                    return (
                      <>
                        <h3>{key}</h3>
                        <p>{value}</p>
                      </>
                    );
                  })}
                  {message.awaitedToolCalls.map((tool) => (
                    <Tool>
                      <ToolHeader
                        type={tool.toolName}
                        state={"input-available" as const}
                        badge={
                          <Badge className="gap-1.5 rounded-full text-xs">
                            awaited
                          </Badge>
                        }
                      />
                      <ToolContent>
                        <ToolInput input={tool.input} />
                      </ToolContent>
                    </Tool>
                  ))}
                </MessageContent>
              </Message>
            </>
          );
        } else if (message.kind === "user-allow-tool-calls") {
          return (
            <Message from="user">
              <MessageContent>
                Allowed tool calls
                {message.allowedToolCalls.map((t) => (
                  <Badge variant="secondary">{t.toolCallId}</Badge>
                ))}
              </MessageContent>
            </Message>
          );
        }
      })}
      {lastMessage &&
        (lastMessage.kind === "agent-create-task" ||
          lastMessage.kind === "agent-update-task") &&
        lastMessage.awaitedToolCalls.length > 0 && (
          <Message from="user">
            <Card>
              <CardHeader></CardHeader>
              {lastMessage.awaitedToolCalls.map((tool) => (
                <CardContent>
                  <Tool defaultOpen={false}>
                    <ToolHeader
                      type={tool.toolName}
                      state={"input-available" as const}
                      badge={
                        <Badge className="gap-1.5 rounded-full text-xs">
                          awaited
                        </Badge>
                      }
                    />
                    <ToolInput input={tool.input} />
                  </Tool>
                </CardContent>
              ))}
              <CardFooter className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() =>
                    allowToolCall({
                      contextId: lastMessage.contextId,
                      taskId: lastMessage.taskId,
                      allowedToolCalls: lastMessage.awaitedToolCalls.map(
                        (x) => x.toolCallId
                      ),
                    })
                  }
                >
                  Allow
                </Button>
              </CardFooter>
            </Card>
          </Message>
        )}

      <div className="flex gap-2">
        <Input
          placeholder="Input a weather query..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button onClick={() => sendMessage(input)}>Send</Button>
      </div>
    </div>
  );
}

export function App() {
  return <EnsureClient />;
}

export default App;
