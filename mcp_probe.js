// Probe an MCP server: initialize + tools/list, print tool names + params.
// Usage: node mcp_probe.js <cmd> [args...]
const { spawn } = require('child_process');
const cmd = process.argv[2];
const args = process.argv.slice(3);
const srv = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'], shell: true });

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
function send(method, params) {
  return new Promise(res => {
    const myId = ++id;
    pending[myId] = res;
    srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
  });
}
function notify(method, params) {
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

(async () => {
  await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bench', version: '1.0' } });
  notify('notifications/initialized');
  const tools = await send('tools/list', {});
  const list = (tools.result && tools.result.tools) || [];
  console.log('=== ' + list.length + ' tools ===');
  for (const t of list) {
    const params = Object.keys((t.inputSchema && t.inputSchema.properties) || {});
    console.log(t.name + '  [' + params.join(', ') + ']');
  }
  srv.kill();
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
