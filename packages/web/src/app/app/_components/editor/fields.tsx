'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMeasure, parseMeasureText } from '@/lib/editor/measure';
import { cn } from '@/lib/utils';

/**
 * Campos do inspetor (10-design §3, exceção dos inspetores): inputs controlados que confirmam no blur/Enter,
 * Esc reverte, erro inline. O valor de fora (draft) só substitui o texto quando o campo não está em foco —
 * assim um arraste (S21.3) atualiza o campo sem apagar o que o humano está digitando.
 */

export function Field({ id, label, hint, error, children, className }: { id: string; label: ReactNode; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={id} className="text-[13px] text-ink-2">
        {label}
      </Label>
      {children}
      {error !== undefined ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p className="text-[12px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export type Parse<T> = { ok: true; value: T } | { ok: false; message: string };

export interface CommitInputProps<T> {
  id: string;
  value: T;
  format: (v: T) => string;
  parse: (text: string) => Parse<T>;
  onCommit: (v: T) => void;
  equals?: ((a: T, b: T) => boolean) | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  mono?: boolean | undefined;
  className?: string | undefined;
  inputMode?: 'text' | 'numeric' | 'decimal' | undefined;
  'aria-label'?: string | undefined;
}

export function CommitInput<T>({ id, value, format, parse, onCommit, equals = Object.is, placeholder, disabled, mono = true, className, inputMode, 'aria-label': ariaLabel }: CommitInputProps<T>) {
  const [text, setText] = useState(() => format(value));
  const [error, setError] = useState<string | undefined>(undefined);
  const focused = useRef(false);
  // Último valor confirmado: Enter confirma e tira o foco na mesma passada, antes de o React re-renderizar;
  // sem isto o blur compararia com a prop antiga e confirmaria de novo (dois commits, dois undos).
  const committed = useRef<T>(value);

  // Valor novo de fora (outro campo, undo, arraste): só entra no texto quando o campo não está em foco.
  useEffect(() => {
    committed.current = value;
    if (!focused.current) {
      setText(format(value));
      setError(undefined);
    }
    // `format` é função de módulo, estável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commitNow = (): boolean => {
    const r = parse(text);
    if (!r.ok) {
      setError(r.message);
      return false;
    }
    setError(undefined);
    if (equals(r.value, committed.current)) setText(format(committed.current));
    else {
      committed.current = r.value;
      onCommit(r.value);
    }
    return true;
  };

  return (
    <div className="space-y-1">
      <Input
      id={id}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      inputMode={inputMode}
      aria-label={ariaLabel}
      aria-invalid={error !== undefined || undefined}
      className={cn('h-8 text-[13px]', mono && 'font-mono', className)}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        commitNow();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (commitNow()) e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setText(format(committed.current));
          setError(undefined);
          e.currentTarget.blur();
        }
      }}
      />
      {error !== undefined ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const sameNumber = (a: number | undefined, b: number | undefined): boolean => a === b || (a !== undefined && b !== undefined && Math.abs(a - b) < 1e-9);

export interface MeasureInputProps {
  id: string;
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  signed?: boolean;
  positive?: boolean;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Medida em pés-pol ou polegadas; vazio = campo limpo (salvo `required`). */
export function MeasureInput({ id, value, onCommit, signed, positive, required, placeholder = `e.g. 12'-6 1/2"`, disabled, className, 'aria-label': ariaLabel }: MeasureInputProps) {
  const parse = (text: string): Parse<number | undefined> => {
    const r = parseMeasureText(text, { signed: signed === true });
    if (!r.ok) return r;
    if (r.value === undefined && required === true) return { ok: false, message: 'Required' };
    if (r.value !== undefined && positive === true && r.value <= 0) return { ok: false, message: 'Must be more than zero' };
    return r;
  };
  return <CommitInput id={id} value={value} format={formatMeasure} parse={parse} equals={sameNumber} onCommit={onCommit} placeholder={placeholder} disabled={disabled} className={className} aria-label={ariaLabel} />;
}

export interface NumberInputProps {
  id: string;
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  integer?: boolean;
  min?: number;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  unit?: string;
}

const formatNumber = (v: number | undefined): string => (v === undefined ? '' : String(v));

/** Número puro (plies, jacks, pavimentos, psf, mph, graus). */
export function NumberInput({ id, value, onCommit, integer, min, required, placeholder, disabled }: NumberInputProps) {
  const parse = (text: string): Parse<number | undefined> => {
    const t = text.trim();
    if (t === '') return required === true ? { ok: false, message: 'Required' } : { ok: true, value: undefined };
    const n = Number(t.replace(',', '.'));
    if (!Number.isFinite(n)) return { ok: false, message: 'Use a number' };
    if (integer === true && !Number.isInteger(n)) return { ok: false, message: 'Use a whole number' };
    if (min !== undefined && n < min) return { ok: false, message: `Must be ${min} or more` };
    return { ok: true, value: n };
  };
  return <CommitInput id={id} value={value} format={formatNumber} parse={parse} equals={sameNumber} onCommit={onCommit} placeholder={placeholder} disabled={disabled} inputMode={integer === true ? 'numeric' : 'decimal'} />;
}

export interface TextInputProps {
  id: string;
  value: string | undefined;
  onCommit: (v: string | undefined) => void;
  required?: boolean;
  validate?: (v: string) => string | undefined;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
}

const formatText = (v: string | undefined): string => v ?? '';

/** Texto livre; vazio = campo limpo (salvo `required`); `validate` devolve a mensagem de erro. */
export function TextInput({ id, value, onCommit, required, validate, placeholder, disabled, mono = false }: TextInputProps) {
  const parse = (text: string): Parse<string | undefined> => {
    const t = text.trim();
    if (t === '') return required === true ? { ok: false, message: 'Required' } : { ok: true, value: undefined };
    const err = validate?.(t);
    return err === undefined ? { ok: true, value: t } : { ok: false, message: err };
  };
  return <CommitInput id={id} value={value} format={formatText} parse={parse} onCommit={onCommit} placeholder={placeholder} disabled={disabled} mono={mono} />;
}

/** Lista de medidas separadas por vírgula (pré-cortes, estoque). */
export function MeasureListInput({ id, value, onCommit, placeholder = `e.g. 92 5/8", 104 5/8"` }: { id: string; value: number[] | undefined; onCommit: (v: number[] | undefined) => void; placeholder?: string }) {
  const format = (v: number[] | undefined): string => (v ?? []).map(formatMeasure).join(', ');
  const parse = (text: string): Parse<number[] | undefined> => {
    const parts = text.split(/[,;]/).map((p) => p.trim()).filter((p) => p !== '');
    if (parts.length === 0) return { ok: true, value: undefined };
    const out: number[] = [];
    for (const p of parts) {
      const r = parseMeasureText(p);
      if (!r.ok) return r;
      if (r.value === undefined || r.value <= 0) return { ok: false, message: 'Each length must be more than zero' };
      out.push(r.value);
    }
    return { ok: true, value: out };
  };
  const equals = (a: number[] | undefined, b: number[] | undefined): boolean => format(a) === format(b);
  return <CommitInput id={id} value={value} format={format} parse={parse} equals={equals} onCommit={onCommit} placeholder={placeholder} />;
}

export const NONE = '__none__';

export interface EnumSelectProps {
  id: string;
  value: string | undefined;
  options: readonly { value: string; label: string }[];
  onChange: (v: string | undefined) => void;
  /** Rótulo da opção "sem valor"; ausente = sem essa opção. */
  noneLabel?: string;
  disabled?: boolean;
}

/** Select controlado; `undefined` é a opção `noneLabel` (apaga a chave). */
export function EnumSelect({ id, value, options, onChange, noneLabel, disabled }: EnumSelectProps) {
  const labels = new Map(options.map((o) => [o.value, o.label]));
  const current = value ?? NONE;
  return (
    <Select value={current} onValueChange={(v) => onChange(v === NONE ? undefined : v)} disabled={disabled}>
      <SelectTrigger id={id} className="h-8 w-full text-[13px]">
        <SelectValue>{current === NONE ? (noneLabel ?? '—') : (labels.get(current) ?? current)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {noneLabel !== undefined ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Booleano opcional como select de dois rótulos (exterior/interior, bearing/non-bearing). */
export function BoolSelect({ id, value, onChange, trueLabel, falseLabel, noneLabel = 'Not set' }: { id: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void; trueLabel: string; falseLabel: string; noneLabel?: string }) {
  return (
    <EnumSelect
      id={id}
      value={value === undefined ? undefined : value ? 'true' : 'false'}
      options={[
        { value: 'true', label: trueLabel },
        { value: 'false', label: falseLabel },
      ]}
      onChange={(v) => onChange(v === undefined ? undefined : v === 'true')}
      noneLabel={noneLabel}
    />
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{title}</p>
        {actions}
      </div>
      {children}
    </section>
  );
}
