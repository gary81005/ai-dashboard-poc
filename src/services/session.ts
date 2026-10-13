// 登入世代：登出或換帳號時加一，讓上一位使用者還在進行中的請求作廢。
//
// 非同步流程開始時呼叫 sessionGuard() 記下當時的世代，寫入 store 前呼叫它檢查；
// 世代已經變了，代表使用者換了，結果直接丟掉，不要寫回剛清空的 store。

let generation = 0;

export function invalidateSession(): void {
  generation += 1;
}

export function sessionGuard(): () => boolean {
  const mine = generation;
  return () => mine === generation;
}
