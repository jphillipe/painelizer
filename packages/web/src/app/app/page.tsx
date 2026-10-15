import { listExamples } from '@/services/panels.service';

/**
 * Visualizador (S20.1 traz o formulário e o resultado). Na S20.0 é o shell com o tema e a prova de que
 * o servidor lê os pacotes do workspace: os exemplos vêm do service, que importa `cli/examples`.
 */
export default function ViewerPage() {
  const examples = listExamples();
  return (
    <div className="grid gap-8 lg:grid-cols-5">
      <section className="lg:col-span-2">
        <p className="eyebrow">01 · Project</p>
        <h1 className="mt-2">From drawings to panels.</h1>
        <p className="mt-3 text-ink-2">
          Paste or open a project JSON, or pick an example. The engine is deterministic: same input, same sheets.
        </p>
        <ul className="mt-6 divide-y divide-line-faint rounded-md border bg-card shadow-1">
          {examples.map((e) => (
            <li key={e.id} className="flex items-center justify-between px-4 py-3">
              <span>{e.label}</span>
              <code className="text-ink-3">{e.id}</code>
            </li>
          ))}
        </ul>
      </section>
      <section className="lg:col-span-3">
        <p className="eyebrow">02 · Panels</p>
        <div className="mt-2 rounded-md border border-dashed bg-paper-2 p-10 text-center text-ink-3">
          Generate panels to see the plan, the sheets and the files here.
        </div>
      </section>
    </div>
  );
}
