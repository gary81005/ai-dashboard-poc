// Vitest 只測 src/utils/ 與 src/services/parseWorkbook.ts 這類純邏輯（ADR 0010），不跑 React 元件，
// 所以不載入 vite.config.ts 的 React Compiler，也不需要瀏覽器環境。
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
