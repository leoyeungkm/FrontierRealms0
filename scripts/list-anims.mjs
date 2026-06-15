// 列出 GLB 的 animation 剪輯名
import { readFileSync } from 'fs';
const buf = readFileSync(process.argv[2]);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
console.log((json.animations || []).map(a => a.name).join('\n'));
