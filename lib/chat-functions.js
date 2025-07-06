const apiEndpointPrefix = atom.config.get('pulsar-edit-mcp-server.apiEndpointPrefix');
const apiKey = atom.config.get('pulsar-edit-mcp-server.apiKey');
const hljs = require('highlight.js');

var mcpTools = null;
var chatDisplay = null;
var marked = null;
var DOMPurify = null;
var currentModel = null;
var cachedModels = null;
var llmContextHistory = [{
  role: "system",
  content: "You are a helpful coding assistant with access to the user's Pulsar editor IDE."
}];

function updateChatHistory(sender, markdownText) {
  if (!chatDisplay) return console.error('Chat display missing');
  const rawHtml = marked.parse(markdownText, { breaks: true });
  const safeHtml = DOMPurify.sanitize(rawHtml);
  const msg = document.createElement('div');
  msg.classList.add('message', sender.toLowerCase());
  msg.innerHTML = safeHtml;
  chatDisplay.appendChild(msg);
  msg.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
  msg.scrollIntoView({ block: 'end' });
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
  updateLlmContextHistory(newContext);
  await callLLM(mcpClient);
}

async function toolToLLM(tc, toolResult, mcpClient) {
  var newContext = {
    role: "tool",
    name: tc.function.name,
    content: JSON.stringify(toolResult.content),
    tool_call_id: tc.id
  };
  updateLlmContextHistory(newContext);
  await callLLM(mcpClient);
}

async function callLLM(mcpClient) {
  let returnMessage = null;
  const availableTools = await getMcpTools(mcpClient);
  const requestData = {
    model: currentModel,
    messages: llmContextHistory,
    tools: availableTools,
    tool_choice: "auto",
    max_tokens: 1000,
  };

  try {
    const response = await fetch(apiEndpointPrefix + '/v1/chat/completions', {
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

    updateLlmContextHistory(
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

async function fetchModels() {
  if (cachedModels) {
    console.log("RETURNING CACHED MODEL LIST");
    return cachedModels;
  }
  console.log("FETCHING MODEL LIST");
  const res = await fetch(apiEndpointPrefix + '/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`Model list failed: ${res.statusText}`);
  const data = await res.json();
  cachedModels = data.data?.map(m => m.id) ?? [];
  console.log("Available models:", cachedModels);
  return cachedModels;
}

async function handleSendMessage(inChatDisplay, inMarked, inDOMPurify, message, inModel, mcpClient) {
  console.log('Message from UI:', message);
  currentModel = inModel;
  chatDisplay = inChatDisplay;
  marked = inMarked;
  DOMPurify = inDOMPurify;

  updateChatHistory('User', message);
  chatToLLM(message, mcpClient);
}

function updateLlmContextHistory(inMessage) {
  // llama.cpp server does not like null content
  if (!inMessage.hasOwnProperty('content')) {
    inMessage['content'] = "";
  }
  if (inMessage['content'] == null) {
    inMessage['content'] = "";
  }
  llmContextHistory.push(inMessage);
}

function clearContextHistory() {
  llmContextHistory.length = 0;
}

module.exports = {
  updateChatHistory,
  callLLM,
  fetchModels,
  handleSendMessage,
  clearContextHistory
};
