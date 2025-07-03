const apiEndpoint = atom.config.get('pulsar-edit-mcp-server.apiEndpoint');
const apiKey = atom.config.get('pulsar-edit-mcp-server.apiKey');

var mcpTools = null;
var chatDisplay = null;
var llmContextHistory = [{
  role: "system",
  content: "You are a helpful coding assistant with access to the user's Pulsar editor IDE."
}];

function updateChatHistory(sender, message) {
    if (chatDisplay != null) {
      const msg = document.createElement('div');
      msg.classList.add('message', sender.toLowerCase());
      msg.textContent = message;
      chatDisplay.appendChild(msg);
      msg.scrollIntoView({block: 'end'});
      //chatDisplay.value += `[${sender}]: ${message}\n`;
    } else {
        console.error('Chat display element not provided!');
    }
}

async function getMcpTools(mcpClient) {
  if (mcpTools == null) {
    const { tools } = await mcpClient.listTools();
    console.log("Fetching available tools");
    var openAiTools = tools.map(t => ({
      type: "function",
      function: {
        name:        t.name,
        description: t.description ?? "",
        parameters:  t.inputSchema
      }
    }));
  } else {
    console.log("Found available tools");
  }
  return openAiTools;
}

async function chatToLLM(message, mcpClient) {
  var newContext = {
    role: "user",
    content: message
  };
  llmContextHistory.push(newContext);
  await callLLM(mcpClient);
}

async function toolToLLM(tc, toolResult, mcpClient) {
  var newContext = {
    role: "tool",
    name: tc.function.name,
    content: JSON.stringify(toolResult.content),
    tool_call_id: tc.id
  };
  llmContextHistory.push(newContext);
  await callLLM(mcpClient);
}

async function callLLM(mcpClient) {
  let returnMessage = null;
  const availableTools = await getMcpTools(mcpClient);
  const requestData = {
    model: "gpt-4o",
    messages: llmContextHistory,
    tools: availableTools,
    tool_choice: "auto",
    max_tokens: 1000,
  };

  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("RECEIVED: " + JSON.stringify(data));

    llmContextHistory.push(
      data.choices[0].message
    );

    // Handle Tool Calls
    for (const tc of data.choices[0].message.tool_calls ?? []) {
      const args = JSON.parse(tc.function.arguments);
      console.log("CALLING TOOL: " + tc.function.name);
      console.log("TOOL ARGS: " + tc.function.arguments);
      const toolResult = await mcpClient.callTool({
        name: tc.function.name,
        arguments: args
      });
      console.log("TOOL RESULT: " + JSON.stringify(toolResult.content));
      await toolToLLM(tc,toolResult,mcpClient);
    }

    // Update chat area with message response after all tools have been executed
    returnMessage = data.choices?.[0]?.message?.content?.trim?.() || "";
    if (returnMessage) {
      updateChatHistory('Assistant', returnMessage);
    }
  } catch (error) {
    console.error('Error calling LLM API:', error);
    throw error;
  }
}

async function handleSendMessage(inChatDisplay, message, mcpClient) {
    console.log('Message from UI:', message);
    chatDisplay = inChatDisplay;
    updateChatHistory('User', message);
    chatToLLM(message, mcpClient);
}

module.exports = {
    updateChatHistory,
    callLLM,
    handleSendMessage,
};
