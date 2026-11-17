const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3001;
const MAX_NAME_LENGTH = 20;
const MAX_MESSAGE_LENGTH = 500;
const HEARTBEAT_INTERVAL = 30000;

// lowercased name -> { name, socket }
const users = new Map();

const server = new WebSocketServer({ port: PORT });

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcast(payload) {
  for (const { socket } of users.values()) {
    send(socket, payload);
  }
}

function userNames() {
  return [...users.values()].map((user) => user.name);
}

// `currentName` is the requester's own name, which they may keep or re-case
function validateName(rawName, currentName = null) {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) return { error: "Please enter a name." };
  if (name.length > MAX_NAME_LENGTH) return { error: `Name can be at most ${MAX_NAME_LENGTH} characters.` };
  const key = name.toLowerCase();
  if (users.has(key) && key !== currentName?.toLowerCase()) return { error: `The name "${name}" is already taken.` };
  return { name };
}

function handleJoin(socket, data) {
  if (socket.userName) {
    send(socket, { type: "error", reason: "You already joined." });
    return;
  }

  const { name, error } = validateName(data.name);
  if (error) {
    send(socket, { type: "join-rejected", reason: error });
    return;
  }

  socket.userName = name;
  users.set(name.toLowerCase(), { name, socket });

  send(socket, { type: "joined", name, users: userNames() });
  broadcast({ type: "user-joined", name, users: userNames() });
  console.log(`+ ${name} (${users.size} online)`);
}

function handleMessage(socket, data) {
  if (!socket.userName) {
    send(socket, { type: "error", reason: "Join the chat first." });
    return;
  }

  const text = typeof data.text === "string" ? data.text.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  if (!text) return;

  broadcast({ type: "message", name: socket.userName, text, time: Date.now() });
}

// Add further profile fields (color, avatar, ...) here
function handleUpdateProfile(socket, data) {
  if (!socket.userName) {
    send(socket, { type: "error", reason: "Join the chat first." });
    return;
  }

  const oldName = socket.userName;
  const { name, error } = validateName(data.name, oldName);
  if (error) {
    send(socket, { type: "profile-rejected", reason: error });
    return;
  }
  if (name === oldName) return;

  // Rebuild the map so the user keeps their place in the list
  const entries = [...users.entries()].map(([key, user]) =>
    user.socket === socket ? [name.toLowerCase(), { name, socket }] : [key, user],
  );
  users.clear();
  for (const [key, user] of entries) users.set(key, user);
  socket.userName = name;

  broadcast({ type: "user-renamed", oldName, name, users: userNames() });
  console.log(`~ ${oldName} is now ${name}`);
}

function handleLeave(socket) {
  const name = socket.userName;
  if (!name) return;

  users.delete(name.toLowerCase());
  socket.userName = null;
  broadcast({ type: "user-left", name, users: userNames() });
  console.log(`- ${name} (${users.size} online)`);
}

const handlers = {
  join: handleJoin,
  message: handleMessage,
  "update-profile": handleUpdateProfile,
};

server.on("connection", (socket) => {
  socket.isAlive = true;
  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      send(socket, { type: "error", reason: "Invalid message." });
      return;
    }

    const handler = handlers[data.type];
    if (handler) {
      handler(socket, data);
    } else {
      send(socket, { type: "error", reason: `Unknown type "${data.type}".` });
    }
  });

  socket.on("close", () => handleLeave(socket));
});

// Drop dead connections so their names become available again
const heartbeat = setInterval(() => {
  for (const socket of server.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, HEARTBEAT_INTERVAL);

server.on("close", () => clearInterval(heartbeat));

console.log(`Chat server listening on ws://localhost:${PORT}`);
