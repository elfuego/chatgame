const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3001;
const MAX_NAME_LENGTH = 20;
const MAX_MESSAGE_LENGTH = 500;
const MAX_QUOTE_LENGTH = 1000;
const HEARTBEAT_INTERVAL = 30000;

// Where new figures start by default, as percentages of the game area (y is the position of the feet)
const AREA = { minX: 8, maxX: 92, minY: 35, maxY: 92 };

// Every article has its own chat: article id -> room (lowercased name -> { name, socket, x, y, color }).
// Chats that don't belong to an article (no article id) share the room with the empty id.
const rooms = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomPosition() {
  const between = (min, max) => Math.round((min + Math.random() * (max - min)) * 10) / 10;
  return { x: between(AREA.minX, AREA.maxX), y: between(AREA.minY, AREA.maxY) };
}

// Clients that know where their figure should start (for instance on an article) can send it
function startPosition(data) {
  if (typeof data.x === "number" && typeof data.y === "number") {
    return { x: clamp(data.x, 0, 100), y: clamp(data.y, 0, 100) };
  }
  return randomPosition();
}

function userPositions(room) {
  return Object.fromEntries([...room.values()].map(({ name, x, y }) => [name, { x, y }]));
}

// A color is a key of the palette in the client (red, blue, ...), an empty string is the default color
function validateColor(rawColor) {
  return typeof rawColor === "string" && /^[a-z]{0,20}$/.test(rawColor) ? rawColor : "";
}

function userColors(room) {
  return Object.fromEntries([...room.values()].map(({ name, color }) => [name, color]));
}

// Article ids look like "a1234567", a missing id means a chat that isn't tied to an article
function validateArticleId(rawArticleId) {
  if (rawArticleId === undefined || rawArticleId === null || rawArticleId === "") return { articleId: "" };
  if (typeof rawArticleId !== "string" || !/^[\w.:-]{1,64}$/.test(rawArticleId)) return { error: "Ongeldig artikel." };
  return { articleId: rawArticleId };
}

const server = new WebSocketServer({ port: PORT });

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

// Messages only go to the users of the same article
function broadcast(room, payload) {
  for (const { socket } of room.values()) {
    send(socket, payload);
  }
}

function userNames(room) {
  return [...room.values()].map((user) => user.name);
}

// `currentName` is the requester's own name, which they may keep or re-case
function validateName(room, rawName, currentName = null) {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) return { error: "Vul een naam in." };
  if (name.length > MAX_NAME_LENGTH) return { error: `De naam mag maximaal ${MAX_NAME_LENGTH} tekens bevatten.` };
  const key = name.toLowerCase();
  if (room.has(key) && key !== currentName?.toLowerCase()) return { error: `De naam "${name}" is al in gebruik.` };
  return { name };
}

function handleJoin(socket, data) {
  if (socket.userName) {
    send(socket, { type: "error", reason: "Je bent al in de chat." });
    return;
  }

  const { articleId, error: articleError } = validateArticleId(data.articleId);
  if (articleError) {
    send(socket, { type: "join-rejected", reason: articleError });
    return;
  }

  const room = rooms.get(articleId) ?? new Map();
  const { name, error } = validateName(room, data.name);
  if (error) {
    send(socket, { type: "join-rejected", reason: error });
    return;
  }

  rooms.set(articleId, room);
  socket.userName = name;
  socket.articleId = articleId;
  socket.room = room;
  room.set(name.toLowerCase(), { name, socket, color: validateColor(data.color), ...startPosition(data) });

  send(socket, { type: "joined", name, users: userNames(room), positions: userPositions(room), colors: userColors(room) });
  broadcast(room, { type: "user-joined", name, users: userNames(room), positions: userPositions(room), colors: userColors(room) });
  console.log(`+ ${name} in ${articleId || "(geen artikel)"} (${room.size} online)`);
}

function handleMessage(socket, data) {
  if (!socket.userName) {
    send(socket, { type: "error", reason: "Ga eerst naar de chat." });
    return;
  }

  const text = typeof data.text === "string" ? data.text.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  if (!text) return;

  broadcast(socket.room, { type: "message", name: socket.userName, text, time: Date.now() });
}

// A quote is a piece of the article that someone selected, everybody on the same article gets it
function handleQuote(socket, data) {
  if (!socket.userName) {
    send(socket, { type: "error", reason: "Ga eerst naar de chat." });
    return;
  }

  const text = typeof data.text === "string" ? data.text.replace(/\s+/g, " ").trim().slice(0, MAX_QUOTE_LENGTH) : "";
  if (!text) return;

  broadcast(socket.room, { type: "quote", name: socket.userName, text, time: Date.now() });
}

// What someone has selected in the article right now, as text: every reader finds it in their own layout.
// `occurrence` tells which match of the text it is, an empty text means the selection is gone.
function handleSelectText(socket, data) {
  if (!socket.userName) {
    send(socket, { type: "error", reason: "Ga eerst naar de chat." });
    return;
  }

  const text = typeof data.text === "string" ? data.text.replace(/\s+/g, " ").trim().slice(0, MAX_QUOTE_LENGTH) : "";
  const occurrence = Number.isInteger(data.occurrence) && data.occurrence >= 0 ? data.occurrence : 0;

  broadcast(socket.room, { type: "user-selected", name: socket.userName, text, occurrence });
}

function handleMove(socket, data) {
  if (!socket.userName) {
    send(socket, { type: "error", reason: "Ga eerst naar de chat." });
    return;
  }
  if (typeof data.x !== "number" || typeof data.y !== "number") return;

  const user = socket.room.get(socket.userName.toLowerCase());
  user.x = clamp(data.x, 0, 100);
  user.y = clamp(data.y, 0, 100);

  broadcast(socket.room, { type: "user-moved", name: user.name, x: user.x, y: user.y });
}

// Add further profile fields (avatar, ...) here
function handleUpdateProfile(socket, data) {
  if (!socket.userName) {
    send(socket, { type: "error", reason: "Ga eerst naar de chat." });
    return;
  }

  const room = socket.room;
  const oldName = socket.userName;
  const { name, error } = validateName(room, data.name, oldName);
  if (error) {
    send(socket, { type: "profile-rejected", reason: error });
    return;
  }

  // Clients that don't send a color keep the one they have
  const oldColor = room.get(oldName.toLowerCase()).color;
  const color = "color" in data ? validateColor(data.color) : oldColor;
  if (name === oldName && color === oldColor) return;

  // Rebuild the map so the user keeps their place in the list
  const entries = [...room.entries()].map(([key, user]) =>
    user.socket === socket ? [name.toLowerCase(), { ...user, name, color }] : [key, user],
  );
  room.clear();
  for (const [key, user] of entries) room.set(key, user);
  socket.userName = name;

  // A rename includes the colors, so a new color along with it needs no message of its own
  if (name !== oldName) {
    broadcast(room, { type: "user-renamed", oldName, name, users: userNames(room), positions: userPositions(room), colors: userColors(room) });
    console.log(`~ ${oldName} is now ${name} in ${socket.articleId || "(geen artikel)"}`);
  } else {
    broadcast(room, { type: "user-recolored", name, users: userNames(room), positions: userPositions(room), colors: userColors(room) });
    console.log(`~ ${name} is now ${color || "default"} in ${socket.articleId || "(geen artikel)"}`);
  }
}

function handleLeave(socket) {
  const name = socket.userName;
  if (!name) return;

  const room = socket.room;
  room.delete(name.toLowerCase());
  socket.userName = null;
  socket.room = null;

  // An empty room is dropped, so articles nobody is chatting on don't pile up
  if (room.size === 0) {
    rooms.delete(socket.articleId);
  } else {
    broadcast(room, { type: "user-left", name, users: userNames(room), positions: userPositions(room), colors: userColors(room) });
  }
  console.log(`- ${name} from ${socket.articleId || "(geen artikel)"} (${room.size} online)`);
}

const handlers = {
  join: handleJoin,
  message: handleMessage,
  quote: handleQuote,
  "select-text": handleSelectText,
  move: handleMove,
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
      send(socket, { type: "error", reason: "Ongeldig bericht." });
      return;
    }

    if (data === null || typeof data !== "object" || Array.isArray(data) || typeof data.type !== "string") {
       send(socket, { type: "error", reason: "Ongeldig bericht." });
       return;
     }
    const handler = Object.prototype.hasOwnProperty.call(handlers, data.type) ? handlers[data.type] : undefined;

    if (handler) {
      handler(socket, data);
    } else {
      send(socket, { type: "error", reason: `Onbekend berichttype "${data.type}".` });
    }
  });

  socket.on("error", () => socket.terminate());
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
