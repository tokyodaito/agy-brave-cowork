#!/usr/bin/env node
import net from "node:net";
import readline from "node:readline";

const SOCKET_PATH = "/tmp/agy-brave-cowork.sock";

const TOOLS = [
  {
    name: "brave_create_task_group",
    description:
      "Create a named, colored Brave tab group (collapsed in background by default) for a task session and open one or more background tabs inside it.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short task name displayed on the Brave tab group folder.",
        },
        url: {
          type: "string",
          description: "Initial URL to open in background inside the group (default: about:blank).",
        },
        urls: {
          type: "array",
          items: { type: "string" },
          description: "Multiple initial URLs to open in background inside the group.",
        },
        color: {
          type: "string",
          enum: ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"],
          description: "Tab group color (default: purple).",
        },
        collapsed: {
          type: "boolean",
          description: "Whether to collapse the folder immediately so it stays out of the way (default: true).",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "brave_open_tab_in_group",
    description:
      "Open a new tab inside an existing Brave task tab group (in background by default, preserving collapsed state).",
    inputSchema: {
      type: "object",
      properties: {
        groupId: { type: "number", description: "Tab group ID returned by brave_create_task_group." },
        url: { type: "string", description: "URL to load in the new tab." },
        active: { type: "boolean", description: "Bring tab to foreground (default: false)." },
      },
      required: ["groupId", "url"],
    },
  },
  {
    name: "brave_list_task_groups",
    description:
      "List all Brave tab groups, showing which ones belong to Antigravity agent sessions and listing their tabs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "brave_update_task_group",
    description: "Rename, recolor, collapse, or expand a Brave tab group.",
    inputSchema: {
      type: "object",
      properties: {
        groupId: { type: "number" },
        title: { type: "string" },
        color: {
          type: "string",
          enum: ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"],
        },
        collapsed: { type: "boolean" },
      },
      required: ["groupId"],
    },
  },
  {
    name: "brave_close_task_group",
    description:
      "Close all tabs in a Brave task group, deleting the group folder cleanly after the task is complete.",
    inputSchema: {
      type: "object",
      properties: {
        groupId: { type: "number", description: "Tab group ID to close and delete." },
      },
      required: ["groupId"],
    },
  },
  {
    name: "brave_close_all_task_groups",
    description: "Close and delete all active Antigravity agent task groups in Brave.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "brave_set_tab_indicator",
    description:
      "Show or hide the subtle visual agent indicator border and Stop pill on a Brave tab.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number" },
        active: { type: "boolean", description: "true to show, false to hide (default: true)." },
        label: { type: "string", description: "Status label displayed on the pill." },
      },
      required: ["tabId"],
    },
  },
  {
    name: "brave_search_history",
    description: "Search Brave browser history (read-only).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text (empty string returns most recent history)." },
        maxResults: { type: "number", description: "Max items to return (default: 20, max: 100)." },
      },
    },
  },
  {
    name: "brave_search_bookmarks",
    description: "Search Brave bookmarks (read-only).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text (empty string returns recent bookmarks)." },
      },
    },
  },
];

const ACTION_MAP = {
  brave_create_task_group: "create_task_group",
  brave_open_tab_in_group: "open_tab_in_group",
  brave_list_task_groups: "list_task_groups",
  brave_update_task_group: "update_task_group",
  brave_close_task_group: "close_task_group",
  brave_close_all_task_groups: "close_all_task_groups",
  brave_set_tab_indicator: "set_tab_indicator",
  brave_search_history: "search_history",
  brave_search_bookmarks: "search_bookmarks",
};

function callExtension(action, params) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(SOCKET_PATH);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let buf = "";

    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error("Timed out communicating with Antigravity Cowork Brave extension"));
    }, 15000);

    client.setEncoding("utf8");
    client.on("connect", () => {
      client.write(JSON.stringify({ id, action, params }) + "\n");
    });

    client.on("data", (chunk) => {
      buf += chunk;
      const idx = buf.indexOf("\n");
      if (idx === -1) return;
      clearTimeout(timer);
      const line = buf.slice(0, idx).trim();
      client.end();
      try {
        const res = JSON.parse(line);
        if (res.ok) resolve(res.result);
        else reject(new Error(res.error || "Extension returned an error"));
      } catch (err) {
        reject(err);
      }
    });

    client.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Cannot connect to Antigravity Cowork Brave extension (${err.code || err.message}). Make sure Brave is open and the extension is loaded in brave://extensions.`
        )
      );
    });
  });
}

function writeJsonRpc(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    return;
  }

  const { id, method, params } = req;

  // Notifications have no id
  if (id === undefined || id === null) {
    return;
  }

  try {
    if (method === "initialize") {
      writeJsonRpc({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion || "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "brave-cowork", version: "1.0.0" },
        },
      });
      return;
    }

    if (method === "ping") {
      writeJsonRpc({ jsonrpc: "2.0", id, result: {} });
      return;
    }

    if (method === "tools/list") {
      writeJsonRpc({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      return;
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const action = ACTION_MAP[toolName];
      if (!action) {
        writeJsonRpc({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        });
        return;
      }

      try {
        const result = await callExtension(action, params?.arguments || {});
        writeJsonRpc({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      } catch (err) {
        writeJsonRpc({
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: err instanceof Error ? err.message : String(err),
              },
            ],
          },
        });
      }
      return;
    }

    writeJsonRpc({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  } catch (err) {
    writeJsonRpc({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
});
