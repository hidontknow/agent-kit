#!/usr/bin/env node
'use strict';
/**
 * Minimal MCP server over stdio (newline-delimited JSON-RPC 2.0), no dependencies.
 * Use it as a template for your own local tools.
 */
const crypto = require('crypto');
const readline = require('readline');

const TOOLS = {
  now: {
    description: 'Current date and time, optionally in an IANA time zone.',
    inputSchema: { type: 'object', properties: { timeZone: { type: 'string', description: 'e.g. Asia/Shanghai' } } },
    run: ({ timeZone } = {}) => new Date().toLocaleString('sv-SE', { timeZone, hour12: false }) + (timeZone ? ` (${timeZone})` : ' (local)'),
  },
  uuid: {
    description: 'Generate one or more random UUID v4 values.',
    inputSchema: { type: 'object', properties: { count: { type: 'integer', minimum: 1, maximum: 100 } } },
    run: ({ count = 1 } = {}) => Array.from({ length: Math.min(Math.max(count, 1), 100) }, () => crypto.randomUUID()).join('\n'),
  },
  hash: {
    description: 'Hash text with md5, sha1, sha256 or sha512.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, algorithm: { type: 'string', enum: ['md5', 'sha1', 'sha256', 'sha512'] } },
      required: ['text'],
    },
    run: ({ text, algorithm = 'sha256' }) => crypto.createHash(algorithm).update(text).digest('hex'),
  },
};

function respond(id, result, error) {
  process.stdout.write(JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result }) + '\n');
}

function handle(msg) {
  const { id, method, params = {} } = msg;
  if (id === undefined) return; // notification
  switch (method) {
    case 'initialize':
      return respond(id, {
        protocolVersion: params.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'kit-tools', version: '0.1.0' },
      });
    case 'ping':
      return respond(id, {});
    case 'tools/list':
      return respond(id, { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) });
    case 'tools/call': {
      const tool = TOOLS[params.name];
      if (!tool) return respond(id, null, { code: -32602, message: `Unknown tool: ${params.name}` });
      try {
        return respond(id, { content: [{ type: 'text', text: String(tool.run(params.arguments || {})) }] });
      } catch (e) {
        return respond(id, { content: [{ type: 'text', text: e.message }], isError: true });
      }
    }
    default:
      return respond(id, null, { code: -32601, message: `Method not found: ${method}` });
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  try { handle(JSON.parse(line)); } catch (e) { respond(null, null, { code: -32700, message: 'Parse error' }); }
});
