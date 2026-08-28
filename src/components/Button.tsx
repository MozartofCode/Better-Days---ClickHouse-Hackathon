"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

const variants: Record<Variant, string> = {
  primary: "bg-(--color-primary) text-white hover:bg-(--color-primary-hover)",
  secondary:
    "bg-(--color-surface) text-(--color-text) border border-(--color-border) hover:border-(--color-primary)",
  ghost: "text-(--color-text-muted) hover:text-(--color-text)",
};

export default function Button({ variant = "primary", className = "", ...rest }: Props) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...rest} />;
}
