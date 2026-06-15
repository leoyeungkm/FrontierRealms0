// 檢查 GLB 內 mesh 節點：有無 skin（SkinnedMesh）、parent 節點名（配件掛點）
import { readFileSync } from 'fs';

for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const parentOf = {};
  json.nodes.forEach((n, i) => (n.children || []).forEach(c => { parentOf[c] = i; }));
  console.log(`\n=== ${file} ===`);
  json.nodes.forEach((n, i) => {
    if (n.mesh === undefined) return;
    const p = parentOf[i];
    const pname = p !== undefined ? (json.nodes[p].name || `#${p}`) : '(root)';
    console.log(`${n.name}  skin=${n.skin !== undefined ? 'YES' : 'no '}  parent=${pname}`);
  });
}
