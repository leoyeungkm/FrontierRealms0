// 列出 GLB 內的 node/mesh 名稱（檢查可開關的裝備部件）
import { readFileSync } from 'fs';

for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const meshNodes = (json.nodes || [])
    .filter(n => n.mesh !== undefined)
    .map(n => n.name || '(unnamed)');
  console.log(`\n=== ${file} ===`);
  console.log(meshNodes.join('\n'));
}
