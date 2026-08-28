const STEPS = ["Upload", "Recognition", "Confirm mapping", "Results"] as const;

export default function StepProgress({ current }: { current: number }) {
  return (
    <ol className="mx-auto flex max-w-2xl items-center justify-between">
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const state = stepNum < current ? "done" : stepNum === current ? "active" : "upcoming";
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  state === "done"
                    ? "bg-(--color-primary) text-white"
                    : state === "active"
                      ? "border-2 border-(--color-primary) text-(--color-primary)"
                      : "border-2 border-(--color-border) text-(--color-text-muted)"
                }`}
              >
                {state === "done" ? "✓" : stepNum}
              </div>
              <span
                className={`text-xs font-medium ${
                  state === "upcoming" ? "text-(--color-text-muted)" : "text-(--color-text)"
                }`}
              >
                {label}
              </span>
            </div>
            {stepNum !== STEPS.length && (
              <div className={`mx-2 mb-5 h-0.5 flex-1 ${stepNum < current ? "bg-(--color-primary)" : "bg-(--color-border)"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
