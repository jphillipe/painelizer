'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { modKey } from '@/lib/platform';

/** Lista de atalhos do editor (M5), aberta por `?` ou pelo botão da toolbar. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const mod = modKey();
  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: 'Walls and openings',
      rows: [
        ['N', 'Add a wall after the selected one (turning left from its end)'],
        ['O', 'Add an opening at the center of the selected wall'],
        ['Delete', 'Remove the selection (with the plan focused)'],
        [']  /  [', 'Next / previous wall'],
        ['Esc', 'Clear the selection'],
        [`${mod}+Z  /  ${mod}+Shift+Z`, 'Undo / redo'],
      ],
    },
    {
      title: 'Plan (click it first)',
      rows: [
        ['← → ↑ ↓', 'Nudge the selected wall or opening by 1"'],
        ['Shift + arrows', 'Nudge by 1/8"'],
        ['Alt + arrows', 'Nudge by 12"'],
        ['+  /  −', 'Zoom in / out'],
        ['F', 'Fit the plan in view'],
        ['Drag an end', 'Move it along the axis (Shift = 1/8" snap)'],
        ['Drag an opening', 'Slide it along the wall'],
        ['Scroll / pinch', 'Zoom at the pointer'],
      ],
    },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Shortcuts don’t fire while you type in a field.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.title}>
              <p className="eyebrow mb-2">{g.title}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {g.rows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt>
                      <kbd className="rounded-sm border border-line bg-paper-2 px-1.5 py-0.5 font-mono text-[12px] whitespace-nowrap">{k}</kbd>
                    </dt>
                    <dd className="text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
