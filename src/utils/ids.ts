// 產生帶前綴的短 id：ds_ = 資料集、db_ = 儀表板、w_ = widget。
// 使用亂數，只能在事件處理中呼叫，不要在 render 裡呼叫。

export function createId(prefix: 'ds' | 'db' | 'w'): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
