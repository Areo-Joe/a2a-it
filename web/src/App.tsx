"use client";

import "./index.css";
import { A2AClient } from "@a2a-js/sdk/client";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { useA2A, useA2AClient } from "./useA2A";
import { Badge } from "@/components/ui/badge";
import { Message, MessageContent } from "./components/message";
import { Tool, ToolContent, ToolHeader, ToolInput } from "./components/tool";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";

function EnsureClient() {
  const { client, loading } = useA2AClient();
  if (loading) {
    return <div>Loading...</div>;
  }
  return <AppContent client={client} />;
}

function AppContent({ client }: { client: A2AClient }) {
  const { uiMessages, sendMessage, allowToolCall } = useA2A(client);

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
                  {message.awaitedToolCalls.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        allowToolCall({
                          taskId: message.taskId,
                          contextId: message.contextId,
                          allowedToolCalls: message.awaitedToolCalls.map(
                            (x) => x.toolCallId
                          ),
                        })
                      }
                    >
                      Allow
                    </Button>
                  )}
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

      <InputForm sendMessage={(x) => sendMessage(x)} />
    </div>
  );
}

const FormSchema = z.object({
  message: z.string(),
});
function InputForm({
  sendMessage,
}: {
  sendMessage: (message: string) => unknown;
}) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      message: "",
    },
  });
  function onSubmit(data: z.infer<typeof FormSchema>) {
    sendMessage(data.message);
    form.reset();
  }
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full">
        <div className="flex gap-2 items-end">
          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    placeholder="Input a weather query..."
                    {...field}
                    autoComplete="off"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Send</Button>
        </div>
      </form>
    </Form>
  );
}

export function App() {
  return <EnsureClient />;
}

export default App;
