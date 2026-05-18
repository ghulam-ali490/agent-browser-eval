// Dump full inputSchema for named tools of an MCP server.
// Usage: node mcp_schema.js "<tool1,tool2,...>" <cmd> [args...]
const { spawn } = require('child_process');
const want = process.argv[2].split(',');
const cmd = process.argv[3];
const args = process.argv.slice(4);
const srv = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'ignore'], shell: true });

let buf = '';
const pending = {};
srv.stdout.on('data', d => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
  }
});
let id = 0;
const send = (method, params) => new Promise(res => {
  const myId = ++id; pending[myId] = res;
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
});
const notify = (method, params) => srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');

(async () => {
  await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'b', version: '1' } });
  notify('notifications/initialized');
  const tools = (await send('tools/list', {})).result.tools;
  for (const t of tools) {
    if (!want.includes(t.name)) continue;
    console.log('### ' + t.name);
    const props = (t.inputSchema && t.inputSchema.properties) || {};
    const req = (t.inputSchema && t.inputSchema.required) || [];
    for (const [k, v] of Object.entries(props)) {
      console.log('  ' + k + (req.includes(k) ? '*' : '') + ': ' + (v.type || (v.enum ? 'enum' : '?')) +
        (v.enum ? ' ' + JSON.stringify(v.enum) : '') +
        (v.description ? ' — ' + v.description.split('\n')[0].slice(0, 80) : ''));
    }
  }
  srv.kill();
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
