// 把系統匯出的原始活頁簿轉成標準化活頁簿（流程見 src/services/standardizeWorkbook.ts）。
// 資料集頁的「資料標準化」按鈕做的是同一件事；這個指令適合批次處理或在本機檢查產出檔。
//
// 用法：npm run standardize -- <原始檔.xlsx> [輸出檔.xlsx] [--spec=crm]
//   沒給輸出檔時，寫在原始檔旁邊，檔名加上「_標準化」。
//   沒給 --spec 時依工作表名稱自動辨識來源（設定清單見 src/utils/standardize/specs/）。
//
// 原始檔與輸出檔通常是真實資料：放在 docs/poc/（已被 .gitignore 排除），不要 commit。
// 需要 Node 24 以上（直接執行 TypeScript），見 .nvmrc。

import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { standardizedName, standardizeWorkbook } from '../../src/services/standardizeWorkbook.ts';

const args = process.argv.slice(2);
const specId = args.find((a) => a.startsWith('--spec='))?.slice('--spec='.length);
const [input, outputArg] = args.filter((a) => !a.startsWith('--'));
if (!input) {
  console.error('用法：npm run standardize -- <原始檔.xlsx> [輸出檔.xlsx] [--spec=crm]');
  process.exit(1);
}
const output = outputArg ?? join(dirname(input), standardizedName(basename(input)));

const STAGES = { read: '讀取原始檔', transform: '轉換', write: '產生標準化檔' } as const;
let started = performance.now();
let current: keyof typeof STAGES | null = null;
const lap = () => {
  const now = performance.now();
  if (current) console.log(`${STAGES[current]}（${((now - started) / 1000).toFixed(1)} 秒）`);
  started = now;
};

const file = await readFile(input);
const result = await standardizeWorkbook(
  file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer,
  basename(input),
  {
    specId,
    onStage: (stage) => {
      lap();
      current = stage;
    },
  },
);
lap();
await writeFile(output, new Uint8Array(result.buffer));

console.log(`來源：${result.source.label}`);
console.log(result.tables.map((t) => `${t.sheet} ${t.rows} 列`).join('、'));
for (const issue of result.issues) {
  const pct = issue.base === 0 ? 0 : (issue.affected / issue.base) * 100;
  console.log(
    `  [${issue.severity}] ${issue.id} ${issue.name}：${issue.affected} 筆（${pct.toFixed(1)}%）`,
  );
}
console.log(`已寫出 ${output}`);
