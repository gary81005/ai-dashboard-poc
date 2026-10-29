// 在瀏覽器觸發檔案下載（儀表板匯出 JSON、資料標準化的 xlsx）：建立暫時的 Blob 網址並模擬點擊連結。

export function downloadFile(fileName: string, data: BlobPart, type: string): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadJson(fileName: string, data: unknown): void {
  downloadFile(fileName, JSON.stringify(data, null, 2), 'application/json');
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
