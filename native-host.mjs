#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";

const SOCKET_PATH = "/tmp/agy-brave-cowork.sock";

// Track pending requests from local MCP clients: id -> { resolve, reject, timer }
const pending = new Map();

function sendNativeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([header, json]));
}

// Read length-prefixed Native Messaging frames from stdin
let stdinBuf = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  stdinBuf = Buffer.concat([stdinBuf, chunk]);
  while (stdinBuf.length >= 4) {
    const msgLen = stdinBuf.readUInt32LE(0);
    if (stdinBuf.length < 4 + msgLen) break;
    const body = stdinBuf.subarray(4, 4 + msgLen).toString("utf8");
    stdinBuf = stdinBuf.subarray(4 + msgLen);
    try {
      const msg = JSON.parse(body);
      const entry = pending.get(msg.id);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(msg.id);
        entry.resolve(msg);
      }
    } catch {
      // Ignore malformed message
    }
  }
});

process.stdin.on("end", cleanupAndExit);
process.on("SIGINT", cleanupAndExit);
process.on("SIGTERM", cleanupAndExit);

function cleanupAndExit() {
  try {
    if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
  } catch {
    // Ignore
  }
  process.exit(0);
}

try {
  if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
} catch {
  // Ignore
}

const server = net.createServer((conn) => {
  let lineBuf = "";
  conn.setEncoding("utf8");
  conn.on("data", (data) => {
    lineBuf += data;
    let idx;
    while ((idx = lineBuf.indexOf("\n")) !== -1) {
      const line = lineBuf.slice(0, idx).trim();
      lineBuf = lineBuf.slice(idx + 1);
      if (!line) continue;

      let req;
      try {
        req = JSON.parse(line);
      } catch {
        conn.write(JSON.stringify({ ok: false, error: "Invalid JSON" }) + "\n");
        continue;
      }

      const id = String(req.id || `${Date.now()}-${Math.random()}`);
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Timed out waiting for Brave extension response"));
        }, 15000);
        pending.set(id, { resolve, reject, timer });
        sendNativeMessage({ id, action: req.action, params: req.params || {} });
      })
        .then((res) => {
          conn.write(JSON.stringify(res) + "\n");
        })
        .catch((err) => {
          conn.write(
            JSON.stringify({
              id,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }) + "\n"
          );
        });
    }
  });
});

server.listen(SOCKET_PATH, () => {
  try {
    fs.chmodSync(SOCKET_PATH, 0o600);
  } catch {
    // Ignore
  }
});
