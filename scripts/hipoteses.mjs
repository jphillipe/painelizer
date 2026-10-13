// Gera docs/08-revisar.md: toda hipótese em vigor (pendência aberta em docs/05-pendencias.md) com o ponto do
// código, dos fixtures e dos testes que depende dela. Uso: `pnpm hipoteses`. Só lê e escreve docs; não toca o motor.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PENDENCIAS = join(root, 'docs', '05-pendencias.md');
const OUT = join(root, 'docs', '08-revisar.md');
const SCAN = ['packages/core/src', 'packages/core/test', 'packages/cli/src', 'packages/cli/test', 'packages/cli/examples'];

// --- 1. pendências -------------------------------------------------------------------------------------
const lines = readFileSync(PENDENCIAS, 'utf8').split('\n');
const items = [];
let cur = null;
for (const line of lines) {
  const start = line.match(/^- \[([ x])\] \*\*(P\d+) — (.+?)\*\*(.*)$/);
  if (start) {
    cur = { open: start[1] === ' ', id: start[2], title: start[3].replace(/\.$/, ''), text: start[4].trim() };
    items.push(cur);
    continue;
  }
  if (cur && /^ {2}\S/.test(line)) { cur.text += ' ' + line.trim(); continue; }
  cur = null;
}
const hypothesisOf = (text) => {
  const all = [...text.matchAll(/hipótese(?: de medida)?:\s*(.+?)(?=\s—\s(?:S\d|Checkpoint|feita)|\.\s+\*\*Resposta|$)/g)];
  if (all.length === 0) return null;
  return all[all.length - 1][1].replace(/\s+/g, ' ').replace(/[.;]\s*$/, '');
};

// --- 2. referências no código ---------------------------------------------------------------------------
const refs = new Map(); // id -> Set("path:line")
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('__snapshots__')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(ts|json|mjs)$/.test(name)) continue;
    const src = readFileSync(p, 'utf8').split('\n');
    src.forEach((l, i) => {
      // só comentários e $comment: um id de abertura "P1" num fixture não é referência a pendência
      const isComment = /\/\/|^\s*\*|\/\*|\$comment/.test(l);
      if (!isComment) return;
      for (const m of l.matchAll(/\bP(\d{1,2})\b/g)) {
        const id = `P${m[1]}`;
        if (!refs.has(id)) refs.set(id, new Set());
        refs.get(id).add(`${relative(root, p).replace(/\\/g, '/')}:${i + 1}`);
      }
    });
  }
};
for (const d of SCAN) walk(join(root, d));

// --- 3. saída --------------------------------------------------------------------------------------------
const open = items.filter((it) => it.open);
const answered = items.filter((it) => !it.open);
const fmtRefs = (id) => {
  const r = [...(refs.get(id) ?? [])].sort();
  if (r.length === 0) return '—';
  const shown = r.slice(0, 5).map((x) => `\`${x}\``).join(', ');
  return r.length > 5 ? `${shown} (+${r.length - 5})` : shown;
};
const today = new Date().toISOString().slice(0, 10);
let md = `# 08 — Revisar com a fábrica\n\n`;
md += `Gerado por \`pnpm hipoteses\` em ${today}. Não edite à mão: a fonte é \`05-pendencias.md\` (pendência aberta = hipótese em vigor) e os comentários do código que citam o número da pendência. Quando a fábrica responder, registre a resposta em \`05-pendencias.md\`, mude o código nos pontos listados, confirme fixtures e rode o script de novo.\n\n`;
md += `**${open.length} hipóteses em vigor**, ${answered.length} pendências respondidas.\n\n`;
md += `| P | Assunto | Hipótese em vigor | Onde mexer quando responderem |\n|---|---|---|---|\n`;
for (const it of open) {
  const h = hypothesisOf(it.text) ?? '*(sem hipótese registrada — registrar)*';
  md += `| ${it.id} | ${it.title} | ${h} | ${fmtRefs(it.id)} |\n`;
}
const orphans = [...refs.keys()].filter((id) => !items.some((it) => it.id === id)).sort();
if (orphans.length) md += `\n**Citadas no código sem entrada em 05-pendencias:** ${orphans.join(', ')}.\n`;
const noHyp = open.filter((it) => !hypothesisOf(it.text)).map((it) => it.id);
if (noHyp.length) md += `\n**Abertas sem hipótese registrada:** ${noHyp.join(', ')}. Toda pendência aberta precisa de uma.\n`;
md += `\n## Respondidas\n\n${answered.map((it) => `- ${it.id} — ${it.title}`).join('\n')}\n`;
writeFileSync(OUT, md);
console.log(`${open.length} hipóteses em vigor, ${answered.length} respondidas → docs/08-revisar.md`);
if (noHyp.length) console.log(`sem hipótese: ${noHyp.join(', ')}`);
if (orphans.length) console.log(`citadas no código sem pendência: ${orphans.join(', ')}`);
