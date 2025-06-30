// chat-functions.js
const apiEndpoint = atom.config.get('pulsar-edit-mcp-server.apiEndpoint');
const apiKey = atom.config.get('pulsar-edit-mcp-server.apiKey');

function updateChatHistory(chatDisplay, sender, message) {
    if (chatDisplay) {
        chatDisplay.value += `[${sender}]: ${message}\n`;
    } else {
        console.error('Chat display element not provided!');
    }
}

async function callLLM(message) {
    const requestData = {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a helpful coding assistant with access to the user's Pulsar editor IDE."
          },
          {
            role: "user",
            content: message
          }
        ],
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
        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error calling LLM API:', error);
        throw error;
    }
}

async function handleSendMessage(chatDisplay, message) {
    console.log('Message from UI:', message);
    updateChatHistory(chatDisplay, 'User', message);
    var llmResponse = await callLLM(chatDisplay.value);
    updateChatHistory(chatDisplay, 'Assistant', llmResponse);
}

module.exports = {
    updateChatHistory,
    callLLM,
    handleSendMessage,
};
