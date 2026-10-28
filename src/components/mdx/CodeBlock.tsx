import { AnimatePresence, motion } from "motion/react";
import { Children, isValidElement, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/cn";
import { copyText } from "~/lib/hooks";
import { spring } from "~/lib/motion";
import { Check, Copy } from "../ui/icons";
import { scrollRegion, useOverflow } from "./useOverflow";

const LABELS: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  sh: "Shell",
  bash: "Bash",
  shell: "Shell",
  zsh: "Shell",
  json: "JSON",
  css: "CSS",
  html: "HTML",
  md: "Markdown",
  markdown: "Markdown",
  py: "Python",
  python: "Python",
  rs: "Rust",
  rust: "Rust",
  go: "Go",
  yaml: "YAML",
  yml: "YAML",
  diff: "Diff",
  txt: "Text",
  text: "Text",
  plaintext: "Text",
};

type Props = React.ComponentProps<"pre"> & { "data-language"?: string };

function languageOf(props: Props): string | undefined {
  if (props["data-language"]) return props["data-language"];
  const code = Children.toArray(props.children).find(isValidElement) as
    | React.ReactElement<{ className?: string }>
    | undefined;
  return code?.props.className?.match(/language-([\w-]+)/)?.[1];
}

/**
 * Shiki block with a language label and a copy button that morphs into a check. The result is
 * announced through a polite status next to the button (the button's name never changes), and a
 * block that scrolls sideways becomes a focusable, named region so the keyboard can scroll it.
 */
export function CodeBlock(props: Props) {
  const { className, "data-language": _lang, tabIndex: _tab, ...rest } = props;
  const lang = languageOf(props);
  const label = lang ? (LABELS[lang] ?? lang) : null;
  const ref = useRef<HTMLPreElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copied = status === "copied";
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const overflowing = useOverflow(ref);

  const onCopy = async () => {
    const text = ref.current?.querySelector("code")?.innerText ?? ref.current?.innerText ?? "";
    setStatus((await copyText(text.replace(/\n$/, ""))) ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 1600);
  };

  return (
    <div className="code-block not-prose group/code relative my-6 overflow-hidden rounded-xl border border-line bg-sunken">
      <div className="flex h-10 items-center justify-between border-b border-line pr-1.5 pl-4">
        <span className="font-mono text-[0.6875rem] tracking-wide text-subtle uppercase">
          {label ?? "Code"}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={label ? `Copy ${label} code` : "Copy code"}
          className="relative inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted transition-colors hover:bg-surface hover:text-fg"
        >
          <span className="relative grid size-4 place-items-center">
            <AnimatePresence initial={false} mode="popLayout">
              {copied ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={spring.snappy}
                  className="text-[var(--c-success)]"
                >
                  <Check size={15} strokeWidth={2.2} />
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={spring.snappy}
                >
                  <Copy size={14} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span className="hidden sm:inline" aria-hidden="true">
            {copied ? "Copied" : status === "failed" ? "Failed" : "Copy"}
          </span>
        </button>
        <span className="sr-only" role="status">
          {copied ? "Copied to clipboard" : status === "failed" ? "Could not copy the code" : ""}
        </span>
      </div>
      <pre
        ref={ref}
        className={cn(className)}
        {...rest}
        {...scrollRegion(overflowing, label ? `${label} code` : "Code")}
      />
    </div>
  );
}
