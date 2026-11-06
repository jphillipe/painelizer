'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/**
 * Um link para o admin copiar e mandar (S41): convite ou nova senha. Aparece uma vez — o banco não guarda o link —,
 * então o texto diz isso e o botão copia.
 */
export function LinkDialog({ link, onClose }: { link: { title: string; description: ReactNode; url: string } | undefined; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (link === undefined) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.');
    }
  };
  return (
    <Dialog
      open={link !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{link?.title}</DialogTitle>
          <DialogDescription>{link?.description}</DialogDescription>
        </DialogHeader>
        <Input aria-label="Link" readOnly value={link?.url ?? ''} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[13px]" />
        <DialogFooter>
          <Button variant="accent" onClick={() => void copy()}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
