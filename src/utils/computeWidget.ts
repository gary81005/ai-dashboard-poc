// 元件的「算」與「畫」分開（ADR 0012）：這裡把 widget 設定 ＋ 查詢輸入算成結果，
// components/widgets/ 的元件只拿結果畫圖。
//
// 結果只有資料與文字，可以存成 JSON：分享連結存的就是這份結果，看的人不需要原始資料列。
// 設定不完整、沒有資料、欄位遺失都轉成 message，由元件顯示成提示文字，render 時不會丟錯。

import {
  queryCategorical,
  queryPie,
  queryScatter,
  queryTable,
  queryValue,
  sortCategorical,
} from './query.ts';
import type {
  CategoricalResult,
  PieResult,
  QueryContext,
  ScatterResult,
  TableResult,
  ValueResult,
} from './query.ts';
import { runQuery } from './runQuery.ts';
import type { QueryOutcome } from './runQuery.ts';
import type { TextWidget, Widget } from '../types/index.ts';

// 要查詢資料的元件；文字元件不查詢，直接顯示內容。
export type DataWidget = Exclude<Widget, TextWidget>;

export type WidgetMessage = { status: 'message'; tone: 'muted' | 'error'; message: string };

export type WidgetResult =
  | { status: 'ok'; type: 'line' | 'bar' | 'combo' | 'radar'; data: CategoricalResult }
  | { status: 'ok'; type: 'pie'; data: PieResult }
  | { status: 'ok'; type: 'scatter'; data: ScatterResult }
  | { status: 'ok'; type: 'gauge' | 'kpi'; data: ValueResult }
  | { status: 'ok'; type: 'table'; data: TableResult }
  | WidgetMessage;

const muted = (message: string): WidgetMessage => ({ status: 'message', tone: 'muted', message });

function failure(outcome: Extract<QueryOutcome<unknown>, { ok: false }>): WidgetMessage {
  return {
    status: 'message',
    tone: 'error',
    message: outcome.missing
      ? `欄位遺失：「${outcome.missing.header}」不在目前的資料表中，請重新指定欄位`
      : `無法產生圖表：${outcome.message}`,
  };
}

export function computeWidget(widget: DataWidget, ctx: QueryContext): WidgetResult {
  switch (widget.type) {
    case 'line':
    case 'bar': {
      const { x, y, group } = widget.encoding;
      if (!x || y.length === 0) return muted('請設定 X 軸，並放入至少一個數值欄位');
      const outcome = runQuery(() => queryCategorical(ctx, x.field, y, group?.field));
      if (!outcome.ok) return failure(outcome);
      // 長條圖可以依數值排序、只留前 N 個（ADR 0008），合起來就是排名圖。
      const data =
        widget.type === 'bar'
          ? sortCategorical(outcome.value, widget.options?.sort, widget.options?.limit)
          : outcome.value;
      if (data.categories.length === 0) return muted('沒有符合條件的資料');
      return { status: 'ok', type: widget.type, data };
    }
    case 'combo': {
      const { x, y } = widget.encoding;
      if (!x || y.length === 0) return muted('請設定 X 軸，並放入至少一個數值欄位');
      const outcome = runQuery(() =>
        queryCategorical(
          ctx,
          x.field,
          y.map(({ field, agg }) => ({ field, agg })),
        ),
      );
      if (!outcome.ok) return failure(outcome);
      if (outcome.value.categories.length === 0) return muted('沒有符合條件的資料');
      return { status: 'ok', type: 'combo', data: outcome.value };
    }
    case 'radar': {
      const { x, y, group } = widget.encoding;
      if (!x || y.length === 0) return muted('請設定軸的分類欄位，並放入至少一個數值欄位');
      const outcome = runQuery(() => queryCategorical(ctx, x.field, y, group?.field));
      if (!outcome.ok) return failure(outcome);
      const data = outcome.value;
      // 少於 3 個軸畫不出雷達圖。
      if (data.categories.length < 3) {
        return muted(
          `雷達圖至少需要 3 個軸，「${data.xField.header}」目前只有 ${data.categories.length} 個值`,
        );
      }
      return { status: 'ok', type: 'radar', data };
    }
    case 'pie': {
      const { category, value } = widget.encoding;
      if (!category || !value) return muted('請設定分類欄位與數值欄位');
      const outcome = runQuery(() => queryPie(ctx, category.field, value));
      if (!outcome.ok) return failure(outcome);
      if (outcome.value.items.length === 0) return muted('沒有大於 0 的數值可以畫圓餅圖');
      return { status: 'ok', type: 'pie', data: outcome.value };
    }
    case 'scatter': {
      const { x, y, color, detail } = widget.encoding;
      if (!x || !y) return muted('請設定 X 軸與 Y 軸的數值欄位');
      const outcome = runQuery(() => queryScatter(ctx, x, y, color?.field, detail?.field));
      if (!outcome.ok) return failure(outcome);
      if (outcome.value.series.every((s) => s.points.length === 0)) {
        return muted('沒有可以畫成點的數值資料');
      }
      return { status: 'ok', type: 'scatter', data: outcome.value };
    }
    case 'gauge': {
      const { value } = widget.encoding;
      if (!value) return muted('請放入一個數值欄位');
      const outcome = runQuery(() => queryValue(ctx, value));
      if (!outcome.ok) return failure(outcome);
      if (outcome.value.value === null) return muted('沒有可以顯示的數值');
      return { status: 'ok', type: 'gauge', data: outcome.value };
    }
    case 'kpi': {
      const { value, trend } = widget.encoding;
      if (!value) return muted('請放入一個數值欄位');
      const outcome = runQuery(() => queryValue(ctx, value, trend?.field));
      if (!outcome.ok) return failure(outcome);
      return { status: 'ok', type: 'kpi', data: outcome.value };
    }
    case 'table': {
      const { columns } = widget.encoding;
      if (columns.length === 0) return muted('請放入至少一個欄位');
      const outcome = runQuery(() => queryTable(ctx, columns));
      if (!outcome.ok) return failure(outcome);
      return { status: 'ok', type: 'table', data: outcome.value };
    }
  }
}
