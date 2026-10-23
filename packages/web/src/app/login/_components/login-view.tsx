'use client';

import { useShellMode } from '@/components/shell-layout';
import { sketchPieces } from '@/lib/login-sketch';
import { LoginForm } from './login-form';
import { WallSplitSketch } from './login-stage';

/** Peças da parede do palco: o rodapé diz o que o desenho mostra, não um número de outro projeto. */
const PIECES = sketchPieces().length;

/**
 * Tela de login (V1B, docs/10-design.md §4): palco navy em tela cheia com a parede que se monta e se divide em
 * painéis, e o card de vidro com o formulário por cima. Em telas estreitas a parede fica acima do card, menor.
 * Pede o modo `stage` ao shell: largura toda, sem rodapé, rolagem normal.
 */
export function LoginView({ next }: { next: string }) {
  useShellMode('stage');
  return (
    <section className="login-surface on-navy relative flex flex-1 flex-col text-paper">
      <div className="relative mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-8 px-4 pt-10 pb-12 sm:px-8 lg:min-h-[calc(100dvh-72px)] lg:px-20 lg:pt-14">
        <header className="step-enter relative z-10 max-w-xl space-y-2">
          <p className="eyebrow !text-gold-300">Framing · splitting · numbering</p>
          <h2 className="font-display text-4xl leading-none tracking-tight text-paper sm:text-5xl">One wall in, numbered panels out.</h2>
        </header>

        <div className="relative flex flex-1 flex-col items-center gap-8 lg:block">
          <WallSplitSketch className="w-full max-w-3xl opacity-90 lg:absolute lg:top-[72px] lg:left-0 lg:w-[76%] lg:max-w-none" />
          <div
            className="step-enter relative z-10 w-full max-w-[400px] rounded-lg border border-paper/15 bg-navy-900/85 p-7 shadow-2 backdrop-blur-md sm:p-9 lg:absolute lg:top-1/2 lg:right-0 lg:-translate-y-1/2"
            style={{ '--i': 2 } as React.CSSProperties}
          >
            <div className="space-y-2">
              <p className="eyebrow !text-gold-300">Sign in</p>
              <h1 className="text-[34px] leading-tight text-paper">Welcome back.</h1>
              <p className="text-sm text-paper/75">Use the account the National Lumber team created for you.</p>
            </div>
            <LoginForm next={next} tone="dark" className="mt-6" />
          </div>
        </div>

        <p className="relative z-10 font-mono text-[12px] text-paper/55">W01 · 18&apos;-0&quot; · 2x6 · exterior · bearing → 2 panels · {PIECES} pieces</p>
      </div>
    </section>
  );
}
