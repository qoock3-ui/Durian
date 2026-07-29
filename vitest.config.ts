import { defineConfig } from "vitest/config";

// 只跑 tests/ 底下的純函式測試。這裡刻意不掛 workers 環境:會出錯的是解析與
// 對獎那幾支純函式,它們不需要 D1 也不需要 fetch,能用最短的迴圈驗完最好。
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
