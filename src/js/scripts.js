import { initLayout } from "./layout.js";

const SERVER_URL = `ws://${location.hostname}:3001`;

const joinSection = document.getElementById("join");
const joinForm = document.getElementById("join-form");
const joinName = document.getElementById("join-name");
const joinError = document.getElementById("join-error");

const appSection = document.getElementById("app");
const messageList = document.getElementById("messages");
const userList = document.getElementById("users");
const userCount = document.getElementById("user-count");
const messageForm = document.getElementById("message-form");
const messageText = document.getElementById("message-text");

let socket = null;
let connecting = null;
let myName = null;

function connect() {
  connecting ??= new Promise((resolve, reject) => {
    socket = new WebSocket(SERVER_URL);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", () => reject(new Error("Could not reach the chat server.")), { once: true });
    socket.addEventListener("message", (event) => handleServerMessage(JSON.parse(event.data)));
    socket.addEventListener("close", handleDisconnect);
  });
  return connecting;
}

function send(payload) {
  socket.send(JSON.stringify(payload));
}

function showChat() {
  joinSection.hidden = true;
  appSection.hidden = false;
  messageText.focus();
}

function showJoin(errorText = "") {
  appSection.hidden = true;
  joinSection.hidden = false;
  joinError.textContent = errorText;
  joinName.focus();
}

function renderUsers(names) {
  userCount.textContent = names.length;
  userList.replaceChildren(
    ...names.map((name) => {
      const item = document.createElement("li");
      item.className = "user";
      item.textContent = name;
      if (name === myName) item.classList.add("is-me");
      return item;
    }),
  );
}

function appendItem(item) {
  messageList.append(item);
  messageList.scrollTop = messageList.scrollHeight;
}

function addMessage({ name, text, time }) {
  const item = document.createElement("li");
  item.className = "message";
  if (name === myName) item.classList.add("is-me");

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
  appendItem(item);
}

function addNotice(text) {
  const item = document.createElement("li");
  item.className = "notice";
  item.textContent = text;
  appendItem(item);
}

function handleServerMessage(data) {
  switch (data.type) {
    case "joined":
      myName = data.name;
      messageList.replaceChildren();
      renderUsers(data.users);
      showChat();
      break;
    case "join-rejected":
      showJoin(data.reason);
      break;
    case "user-joined":
      renderUsers(data.users);
      addNotice(data.name === myName ? "You entered the chat." : `${data.name} entered the chat.`);
      break;
    case "user-left":
      renderUsers(data.users);
      addNotice(`${data.name} left the chat.`);
      break;
    case "message":
      addMessage(data);
      break;
    case "error":
      addNotice(`Error: ${data.reason}`);
      break;
  }
}

function handleDisconnect() {
  socket = null;
  connecting = null;
  myName = null;
  showJoin("Disconnected from the chat server.");
}

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  joinError.textContent = "";
  try {
    await connect();
    send({ type: "join", name: joinName.value });
  } catch (error) {
    showJoin(error.message);
  }
});

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageText.value.trim();
  if (!text) return;
  send({ type: "message", text });
  messageText.value = "";
});

initLayout();
