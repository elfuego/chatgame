import BaseComponent from "./BaseComponent.js";
import { initLayout } from "./layout.js";
import template from "../templates/chat-game.html";
import style from "../scss/chat-game.scss?inline";

/**
 * <chat-game server-url="ws://host:3001">
 *   <div slot="game">…</div>
 * </chat-game>
 */
export default class ChatGame extends BaseComponent {
  constructor() {
    super(template, style);
    this.socket = null;
    this.connecting = null;
    this.myName = null;
  }

  get serverUrl() {
    return this.getAttribute("server-url") || `ws://${location.hostname}:3001`;
  }

  connectedCallback() {
    super.connectedCallback();

    this.joinSection = this.$("#join");
    this.joinForm = this.$("#join-form");
    this.joinName = this.$("#join-name");
    this.joinError = this.$("#join-error");
    this.appSection = this.$("#app");
    this.messageList = this.$("#messages");
    this.userList = this.$("#users");
    this.userCount = this.$("#user-count");
    this.messageForm = this.$("#message-form");
    this.messageText = this.$("#message-text");

    this.joinForm.addEventListener("submit", (event) => this.handleJoinSubmit(event));
    this.messageForm.addEventListener("submit", (event) => this.handleMessageSubmit(event));

    initLayout(this.shadowRoot);
    this.joinName.focus();
  }

  disconnectedCallback() {
    this.closeSocket();
  }

  connect() {
    this.connecting ??= new Promise((resolve, reject) => {
      const socket = new WebSocket(this.serverUrl);
      this.socket = socket;

      // Ignore events from a socket that was replaced or closed on disconnect
      const ifCurrent = (handler) => (event) => {
        if (this.socket === socket) handler(event);
      };

      socket.addEventListener("open", () => resolve(socket), { once: true });
      socket.addEventListener("error", () => reject(new Error("Could not reach the chat server.")), { once: true });
      socket.addEventListener(
        "message",
        ifCurrent((event) => this.handleServerMessage(JSON.parse(event.data))),
      );
      socket.addEventListener("close", ifCurrent(() => this.handleDisconnect()));
    });
    return this.connecting;
  }

  send(payload) {
    this.socket.send(JSON.stringify(payload));
  }

  closeSocket() {
    const socket = this.socket;
    this.socket = null;
    this.connecting = null;
    this.myName = null;
    socket?.close();
  }

  showChat() {
    this.joinSection.hidden = true;
    this.appSection.hidden = false;
    this.messageText.focus();
  }

  showJoin(errorText = "") {
    this.appSection.hidden = true;
    this.joinSection.hidden = false;
    this.joinError.textContent = errorText;
    this.joinName.focus();
  }

  renderUsers(names) {
    this.userCount.textContent = names.length;
    this.userList.replaceChildren(
      ...names.map((name) => {
        const item = document.createElement("li");
        item.className = "user";
        item.textContent = name;
        if (name === this.myName) item.classList.add("is-me");
        return item;
      }),
    );
  }

  appendItem(item) {
    this.messageList.append(item);
    this.messageList.scrollTop = this.messageList.scrollHeight;
  }

  addMessage({ name, text, time }) {
    const item = document.createElement("li");
    item.className = "message";
    if (name === this.myName) item.classList.add("is-me");

    const meta = document.createElement("span");
    meta.className = "message__meta";
    meta.textContent = `${new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} `;

    const nameLabel = document.createElement("span");
    nameLabel.className = "message__name";
    nameLabel.textContent = name;
    meta.append(nameLabel);

    const body = document.createElement("span");
    body.className = "message__text";
    body.textContent = text;

    item.append(meta, body);
    this.appendItem(item);
  }

  addNotice(text) {
    const item = document.createElement("li");
    item.className = "notice";
    item.textContent = text;
    this.appendItem(item);
  }

  handleServerMessage(data) {
    switch (data.type) {
      case "joined":
        this.myName = data.name;
        this.messageList.replaceChildren();
        this.renderUsers(data.users);
        this.showChat();
        break;
      case "join-rejected":
        this.showJoin(data.reason);
        break;
      case "user-joined":
        this.renderUsers(data.users);
        this.addNotice(data.name === this.myName ? "You entered the chat." : `${data.name} entered the chat.`);
        break;
      case "user-left":
        this.renderUsers(data.users);
        this.addNotice(`${data.name} left the chat.`);
        break;
      case "message":
        this.addMessage(data);
        break;
      case "error":
        this.addNotice(`Error: ${data.reason}`);
        break;
    }
  }

  handleDisconnect() {
    this.socket = null;
    this.connecting = null;
    this.myName = null;
    this.showJoin("Disconnected from the chat server.");
  }

  async handleJoinSubmit(event) {
    event.preventDefault();
    this.joinError.textContent = "";
    try {
      await this.connect();
      this.send({ type: "join", name: this.joinName.value });
    } catch (error) {
      this.showJoin(error.message);
    }
  }

  handleMessageSubmit(event) {
    event.preventDefault();
    const text = this.messageText.value.trim();
    if (!text) return;
    this.send({ type: "message", text });
    this.messageText.value = "";
  }
}
