'use babel';

import { handleSendMessage } from './chat-functions';

export default class ChatPanel {
  static mcpClient = null;

  constructor(serializedState) {
    this.element = document.createElement('div');
    this.element.classList.add('chat-panel', 'settings-view');

    const chatDisplay = document.createElement('div');
    chatDisplay.id = 'chat-display';
    chatDisplay.classList.add('chat-display');
    chatDisplay.setAttribute('tabindex', '-1');

    const chatInputContainer = document.createElement('div');
    chatInputContainer.id = 'chat-input-container';

    const chatInput = document.createElement('textarea');
    chatInput.rows = 3;
    chatInput.id = 'chat-input';
    chatInput.placeholder = 'Type your message...';
    chatInput.classList.add('input-textarea','native-key-bindings');

    // Accept chat message with enter key
    chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.handleSend();
      }
    });

    const sendButton = document.createElement('button');
    sendButton.textContent = 'Send';
    sendButton.id = 'send-button';
    sendButton.classList.add('btn','btn-primary');
    sendButton.addEventListener('click', () => this.handleSend());

    chatInputContainer.appendChild(chatInput);
    chatInputContainer.appendChild(sendButton);

    this.element.appendChild(chatDisplay);
    this.element.appendChild(chatInputContainer);
  }

  getTitle() {
    return 'LLM Chat';
  }

  getURI() {
    return 'atom://pulsar-edit-mcp-server/chat';
  }

  getDefaultLocation() {
    return 'right';
  }

  getAllowedLocations() {
    return ['left','right'];
  }

  getPreferredWidth() {
    return 300;
  }

  setMcpClient(inClient) {
    console.log("Setting MCP Client in chat pane");
    this.mcpClient = inClient;
  }

  handleSend() {
    const chatInput = this.element.querySelector('#chat-input');
    const chatDisplay = this.element.querySelector('#chat-display');
    if (chatInput.value) {
      handleSendMessage(chatDisplay, chatInput.value, this.mcpClient);
      chatInput.value = '';
    }
  }

  getElement() {
    return this.element;
  }
}
