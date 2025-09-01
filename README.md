# a2a-it

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.8. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## Hello World A2A Server

This project contains a simple Hello World A2A (Agent-to-Agent) server implementation.

### Running the Server

```bash
bun run index.ts
```

The server will start on `http://localhost:3000` and provide:

- Agent Card endpoint: `http://localhost:3000/.well-known/agent.json`
- Message handling endpoint for A2A communication

### Testing the Server

Run the test client:

```bash
bun run client-test.ts
```

This will send a test message to the server and display the response.

### Server Features

- ✅ **Clean Implementation**: Uses the correct A2AExpressApp from `@a2a-js/sdk/server/express`
- ✅ **Random Response Types**: 50% chance for direct message, 50% chance for task-based workflow
- ✅ **Task Management**: Complete task lifecycle (submitted → working → completed)
- ✅ **Type Safety**: All TypeScript types imported correctly with verbatimModuleSyntax
- ✅ **A2A Protocol Compliant**: Full compliance with A2A agent-to-agent communication
- ✅ **No Lint Errors**: Clean code with proper TypeScript types

### Response Types

The server randomly demonstrates two A2A response patterns:

#### **Direct Message Response** 📨
- Immediate response without creating a task
- Perfect for simple, instant interactions
- Response format: `"Hello World! ... (Direct Response)"`

#### **Task-Based Response** 📋
- Creates an asynchronous task
- Task goes through: `submitted` → `working` → `completed`
- Simulates 1.5-second processing time
- Client must poll for task completion
- Response format: `"Hello World! ... (Task Completed)"`

### Testing Multiple Times

Run the client multiple times to see both response types:
```bash
# Run several times to see the random behavior
bun run client-test.ts
bun run client-test.ts
bun run client-test.ts
```

The implementation now demonstrates the full spectrum of A2A communication patterns!
