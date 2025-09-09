import { requestHandler } from "../../../../../server/index";
import { AGENT_CARD_PATH } from "@a2a-js/sdk";
import { JsonRpcTransportHandler } from "@a2a-js/sdk/server";

const jsonRpcTransportHandler = new JsonRpcTransportHandler(requestHandler);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace("/api/", "");

  if (pathname === AGENT_CARD_PATH) {
    try {
      const agentCard = await requestHandler.getAgentCard();
      return Response.json(agentCard);
    } catch (error: any) {
      console.error("Error fetching agent card:", error);
      return Response.json(
        { error: "Failed to retrieve agent card" },
        { status: 500 }
      );
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: Request) {
  console.log("request wtf");
  try {
    const body = await request.json();
    console.log("body", body);
    const rpcResponseOrStream = await jsonRpcTransportHandler.handle(body);

    // Check if it's an AsyncGenerator (stream)
    if (
      typeof (rpcResponseOrStream as any)?.[Symbol.asyncIterator] === "function"
    ) {
      const stream = rpcResponseOrStream as AsyncGenerator<
        any,
        void,
        undefined
      >;

      const streamResponse = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of stream) {
              const sseData = `id: ${new Date().getTime()}\ndata: ${JSON.stringify(
                event
              )}\n\n`;
              controller.enqueue(new TextEncoder().encode(sseData));
            }
            controller.close();
          } catch (streamError: any) {
            console.error(
              `Error during SSE streaming (request ${body?.id}):`,
              streamError
            );
            const errorResponse = {
              jsonrpc: "2.0",
              id: body?.id || null,
              error: {
                code: -32603,
                message: streamError.message || "Streaming error.",
                data: null,
              },
            };
            const sseError = `id: ${new Date().getTime()}\nevent: error\ndata: ${JSON.stringify(
              errorResponse
            )}\n\n`;
            controller.enqueue(new TextEncoder().encode(sseError));
            controller.close();
          }
        },
      });

      return new Response(streamResponse, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      return Response.json(rpcResponseOrStream);
    }
  } catch (error: any) {
    console.error("Unhandled error in A2A handler:", error);
    const errorResponse = {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: error.message || "General processing error.",
        data: null,
      },
    };
    return Response.json(errorResponse, { status: 500 });
  }
}
