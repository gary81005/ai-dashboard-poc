// 編輯模式的「＋ 新增元件」選單：建立空白 widget、放到格線最下方並自動選取，接著在元件設定面板設定。

import { useState } from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { WIDGET_TYPE_LABELS, WIDGET_TYPES } from '../../constants/widgetTypes.ts';
import { useAppStore } from '../../store/appStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { Dashboard, WidgetType } from '../../types/index.ts';
import { createWidget, nextLayoutItem } from '../../utils/widgetEditing.ts';

export function AddWidgetButton({ dashboard }: { dashboard: Dashboard }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const addWidget = useAppStore((s) => s.addWidget);
  const selectWidget = useUiStore((s) => s.selectWidget);

  const add = (type: WidgetType) => {
    setAnchor(null);
    const widget = createWidget(type);
    addWidget(dashboard.id, widget, nextLayoutItem(dashboard.layout, widget));
    selectWidget(widget.id);
  };

  return (
    <>
      <Button variant='outlined' onClick={(e) => setAnchor(e.currentTarget)}>
        ＋ 新增元件
      </Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {WIDGET_TYPES.map((type) => (
          <MenuItem key={type} onClick={() => add(type)}>
            {WIDGET_TYPE_LABELS[type]}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
