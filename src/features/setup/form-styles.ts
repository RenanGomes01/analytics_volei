/** Estilos compartilhados dos formulários de cadastro (alvos de toque ≥ 48px). */
const fieldClass = "min-h-12 rounded-xl border-2 border-zinc-700 bg-zinc-900 px-3 text-lg text-zinc-100 outline-none focus:border-amber-400";

export const inputClass = `${fieldClass} w-full min-w-0`;

/** Nº da camisa: largura própria (sem o `w-full` do inputClass, que brigava com `w-20` no flex). */
export const numberInputClass = `${fieldClass} w-full min-w-0 text-center tabular-nums`;

export const segmentedClass = (active: boolean) =>
  `min-h-12 flex-1 rounded-xl px-3 text-base font-semibold ${active ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`;

export const secondaryButton = "min-h-12 rounded-xl bg-zinc-800 px-4 font-semibold disabled:opacity-40";
export const primaryButton = "min-h-12 rounded-xl bg-amber-400 px-4 font-bold text-zinc-950 disabled:opacity-40";
