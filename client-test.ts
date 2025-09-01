import { A2AClient } from "@a2a-js/sdk/client";
import type { MessageSendParams } from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";

async function testHelloWorldAgent() {
  console.log("🚀 Testing Hello World A2A Agent");

  // 创建A2A客户端
  const client = new A2AClient("http://localhost:3000");

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
        blocking: true, // 阻塞模式，等待完整响应
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

      // 等待一段时间，然后获取任务状态
      await new Promise((resolve) => setTimeout(resolve, 1000));

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
      console.log("📊 Task status:", taskResult.status.state);

      if (taskResult.status.message) {
        const responseText = taskResult.status.message.parts
          .filter((part) => part.kind === "text")
          .map((part) => part.text)
          .join(" ");
        console.log("💬 Agent response:", responseText);
      }
    } else if (result.kind === "message") {
      const responseText = result.parts
        .filter((part) => part.kind === "text")
        .map((part) => part.text)
        .join(" ");
      console.log("💬 Direct message response:", responseText);
    }

    console.log("✅ Test completed successfully!");
  } catch (error) {
    console.error("💥 Test failed:", error);
  }
}

// 运行测试
testHelloWorldAgent();
