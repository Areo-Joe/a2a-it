import { A2AClient } from "@a2a-js/sdk/client";
import type { MessageSendParams } from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";

async function testHelloWorldAgent() {
  console.log("🚀 Testing Hello World A2A Agent");

  // 创建A2A客户端
  const client = await A2AClient.fromCardUrl(
    "http://localhost:3000/.well-known/agent-card.json"
  );

  try {
    // 1. 发送消息
    const messageId = uuidv4();
    const sendParams: MessageSendParams = {
      message: {
        messageId: messageId,
        role: "user",
        parts: [{ kind: "text", text: "Hello from client!" }],
        kind: "message",
      },
      configuration: {
        blocking: false, // 非阻塞模式，立即返回，支持异步轮询
        acceptedOutputModes: ["text/plain"],
      },
    };

    console.log("📤 Sending message to agent...");
    const sendResponse = await client.sendMessage(sendParams);

    // 2. 检查是否有错误
    if ("error" in sendResponse && sendResponse.error) {
      console.error("❌ Error sending message:", sendResponse.error);
      return;
    }

    // 3. 确保有结果
    if (!("result" in sendResponse) || !sendResponse.result) {
      console.error("❌ No result in response");
      return;
    }

    const result = sendResponse.result;

    // 4. 根据结果类型处理
    if (result.kind === "task") {
      console.log("📋 Agent created a task:", result.id);
      console.log("⏳ Task is being processed asynchronously...");
      console.log("🔄 Starting to poll task status...");

      // 在开始轮询前稍微等待，让任务有时间进入工作状态

      // 轮询任务状态，直到完成
      let attempt = 0;
      const maxAttempts = 15; // 最多尝试15次
      const pollInterval = 400; // 400ms 轮询一次，比服务器的2500ms快得多

      while (attempt < maxAttempts) {
        attempt++;
        console.log(`🔄 Polling attempt ${attempt}...`);

        const taskResponse = await client.getTask({ id: result.id });

        if ("error" in taskResponse && taskResponse.error) {
          console.error("❌ Error getting task:", taskResponse.error);
          return;
        }

        if (!("result" in taskResponse) || !taskResponse.result) {
          console.error("❌ No task result");
          return;
        }

        const taskResult = taskResponse.result;
        const currentState = taskResult.status.state;

        console.log(`📊 Task status (attempt ${attempt}): ${currentState}`);

        // 如果任务已完成，显示结果并退出
        if (currentState === "completed") {
          if (taskResult.status.message) {
            const responseText = taskResult.status.message.parts
              .filter((part) => part.kind === "text")
              .map((part) => part.text)
              .join(" ");
            console.log("💬 Task response:", responseText);
          } else {
            console.log("📋 Task completed but no message content");
          }
          console.log(`✅ Task completed after ${attempt} polling attempts`);
          break;
        }

        // 如果任务被取消
        if (currentState === "canceled") {
          console.log("❌ Task was canceled");
          console.log(`🛑 Polling stopped after ${attempt} attempts`);
          break;
        }

        // 如果还没完成，继续轮询
        if (currentState === "working") {
          console.log("⚙️  Task is still working...");
        } else if (currentState === "submitted") {
          console.log("📝 Task is submitted, waiting to start...");
        }

        // 等待下次轮询
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      if (attempt >= maxAttempts) {
        console.log(`⏰ Polling timed out after ${maxAttempts} attempts`);
      }
    } else if (result.kind === "message") {
      const responseText = result.parts
        .filter((part) => part.kind === "text")
        .map((part) => part.text)
        .join(" ");
      console.log("💬 Direct message response:", responseText);
      console.log("⚡ Response was immediate (no task created)");
    }

    console.log("✅ Test completed successfully!");
  } catch (error) {
    console.error("💥 Test failed:", error);
  }
}

// 运行测试
testHelloWorldAgent();
