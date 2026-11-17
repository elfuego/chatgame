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
    this.settingsDialog = this.$("#settings");
    this.settingsForm = this.$("#settings-form");
    this.settingsName = this.$("#settings-name");
    this.settingsError = this.$("#settings-error");

    this.joinForm.addEventListener("submit", (event) => this.handleJoinSubmit(event));
    this.messageForm.addEventListener("submit", (event) => this.handleMessageSubmit(event));
    this.$("#settings-open").addEventListener("click", () => this.openSettings());
    this.$("#settings-cancel").addEventListener("click", () => this.settingsDialog.close());
    this.settingsForm.addEventListener("submit", (event) => this.handleSettingsSubmit(event));
    this.settingsDialog.addEventListener("close", () => this.messageText.focus());

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

  openSettings() {
    this.settingsName.value = this.myName;
    this.settingsError.textContent = "";
    this.settingsDialog.showModal();
    this.settingsName.select();
  }

  showJoin(errorText = "") {
    this.settingsDialog.close();
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

  addPresenceNotice(names) {
    const others = names.filter((name) => name !== this.myName);
    this.addNotice(others.length ? `Already in the chat: ${others.join(", ")}.` : "You are the only one here.");
  }

  handleServerMessage(data) {
    switch (data.type) {
      case "joined":
        this.myName = data.name;
        this.messageList.replaceChildren();
        this.renderUsers(data.users);
        this.showChat();
        this.addPresenceNotice(data.users);
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
      case "user-renamed":
        this.handleUserRenamed(data);
        break;
      case "profile-rejected":
        this.settingsError.textContent = data.reason;
        break;
      case "message":
        this.addMessage(data);
        break;
      case "error":
        this.addNotice(`Error: ${data.reason}`);
        break;
    }
  }

  handleUserRenamed({ oldName, name, users }) {
    const isMe = oldName === this.myName;
    if (isMe) {
      this.myName = name;
      this.settingsDialog.close();
    }
    this.renderUsers(users);
    this.addNotice(isMe ? `You are now known as ${name}.` : `${oldName} is now known as ${name}.`);
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

  // Collects every setting in the dialog, add new fields (color, avatar, ...) here
  collectProfile() {
    return { name: this.settingsName.value };
  }

  handleSettingsSubmit(event) {
    event.preventDefault();
    this.settingsError.textContent = "";
    const profile = this.collectProfile();
    if (profile.name.trim() === this.myName) {
      this.settingsDialog.close();
      return;
    }
    this.send({ type: "update-profile", ...profile });
  }

  handleMessageSubmit(event) {
    event.preventDefault();
    const text = this.messageText.value.trim();
    if (!text) return;
    this.send({ type: "message", text });
    this.messageText.value = "";
  }
}
