// 檢查多個 GLB 的 skin joints 名稱順序是否一致（跨模型部件混搭的前提）
import { readFileSync } from 'fs';

const lists = [];
for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const names = (n) => json.nodes[n]?.name || `#${n}`;
  const skins = (json.skins || []).map(s => s.joints.map(names));
  console.log(`${file}: ${json.skins?.length || 0} skins, joints=${skins[0]?.length}`);
  lists.push({ file, joints: skins[0] || [] });
  // 同檔多 skin 是否一致
  for (let i = 1; i < skins.length; i++) {
    if (JSON.stringify(skins[i]) !== JSON.stringify(skins[0]))
      console.log(`  !! skin[${i}] differs from skin[0] within same file`);
  }
}
const ref = JSON.stringify(lists[0].joints);
for (const l of lists.slice(1)) {
  console.log(JSON.stringify(l.joints) === ref
    ? `MATCH: ${l.file} joints order identical to ${lists[0].file}`
    : `MISMATCH: ${l.file} differs!`);
}
