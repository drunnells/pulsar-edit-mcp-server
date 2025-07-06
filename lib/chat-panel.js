'use babel';

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { handleSendMessage, fetchModels, setModel, clearContextHistory } from './chat-functions';

export default class ChatPanel {
  static mcpClient = null;
  static llmModel = null;

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

    const modelSelect = document.createElement('select');
    modelSelect.id   = 'model-select';
    modelSelect.classList.add('input-select','native-key-bindings');
    fetchModels()
    .then(models => {
      models.forEach(id => {
        const opt = document.createElement('option');
        opt.value       = id;
        opt.textContent = id;
        modelSelect.appendChild(opt);
      });
      //modelSelect.value = getCurrentModel();
    })
    .catch(err => console.error('Could not load models:', err));

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

    const clearButton = document.createElement('button');
    clearButton.id        = 'clear-button';
    clearButton.textContent = 'Clear';
    clearButton.classList.add('btn', 'btn-error');
    clearButton.addEventListener('click', () => {
      chatDisplay.innerHTML = '';
      clearContextHistory();
    });

    this.modelSelect = modelSelect;
    chatInputContainer.appendChild(chatInput);
    chatInputContainer.appendChild(sendButton);
    chatInputContainer.appendChild(modelSelect);
    chatInputContainer.appendChild(clearButton);

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
    const model = (this.modelSelect?.value || "").trim() || "gpt-4o";
    if (!chatInput.value) return;
    handleSendMessage(chatDisplay, marked, DOMPurify,
                      chatInput.value, model, this.mcpClient)
      .catch(err => this.showError(err.message || 'Unexpected error'));
    chatInput.value = '';
  }

  showError(message) {
    const chatDisplay = this.element.querySelector('#chat-display');
    const errDiv = document.createElement('div');
    errDiv.classList.add('chat-message', 'chat-error');
    errDiv.textContent = message;
    chatDisplay.appendChild(errDiv);
    chatDisplay.scrollTop = chatDisplay.scrollHeight;     // autoscroll
  }

  getElement() {
    return this.element;
  }
}
