'use client';

import * as React from 'react';
import { cn } from 'cn';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

/** Tooltip do shadcn com os tokens do tema (navy sobre papel não; navy cheio com texto papel, 12px). */
function TooltipProvider({ delayDuration = 300, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />;
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  );
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({ className, sideOffset = 4, children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-72 rounded-md bg-navy-900 px-2.5 py-1.5 text-[12px] leading-snug text-paper shadow-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[1px] bg-navy-900 fill-navy-900" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/** Dica com atalho: "Add wall" + `kbd`. */
function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-1.5 rounded-sm border border-paper/30 px-1 font-mono text-[11px] text-paper/80">{children}</kbd>;
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Kbd };
