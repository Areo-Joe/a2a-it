import express from "express";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import { log } from "./util";
import cors from "cors";
import { AGENT_CARD_URL, requestHandler } from "./index";

const appBuilder = new A2AExpressApp(requestHandler);
const expressApp = appBuilder.setupRoutes(
  express(),
  new URL(AGENT_CARD_URL).pathname,
  [cors()]
);

expressApp.listen(3000, () => {
  log.log(`🚀 Weather A2A Server started on ${AGENT_CARD_URL}`);
  log.log(`📋 Agent Card: ${AGENT_CARD_URL}/.well-known/agent-card.json`);
  log.log(`🛑 Press Ctrl+C to stop the server`);
});
