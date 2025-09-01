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
- ✅ **Simple Agent Logic**: Direct message responses without complex task management
- ✅ **Proper Imports**: All TypeScript types imported correctly with verbatimModuleSyntax
- ✅ **A2A Protocol Compliant**: Full compliance with A2A agent-to-agent communication
- ✅ **No Lint Errors**: Clean code with proper TypeScript types

The implementation is now much cleaner and follows the recommended A2A SDK patterns.
