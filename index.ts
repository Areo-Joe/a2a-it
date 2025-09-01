import express from "express";
import { v4 as uuidv4 } from "uuid";
import type { AgentCard, Message } from "@a2a-js/sdk";
import {
  RequestContext,
  DefaultRequestHandler,
  InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import type { AgentExecutor, ExecutionEventBus } from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";

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
  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    // Get the user's message
    const userMessage = requestContext.userMessage;
    const userInput = userMessage.parts
      .filter((part) => part.kind === "text")
      .map((part) => part.text)
      .join(" ");

    // Create a direct message response.
    const responseMessage: Message = {
      kind: "message",
      messageId: uuidv4(),
      role: "agent",
      parts: [
        {
          kind: "text",
          text: `Hello World! I received your message: "${userInput}"`,
        },
      ],
      // Associate the response with the incoming request's context.
      contextId: requestContext.contextId,
    };

    console.log(`[HelloWorldAgent] Processing: "${userInput}"`);

    // Publish the message and signal that the interaction is finished.
    eventBus.publish(responseMessage);
    eventBus.finished();

    console.log(`[HelloWorldAgent] Response sent`);
  }

  // cancelTask is not needed for this simple, non-stateful agent.
  cancelTask = async (): Promise<void> => {};
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
