import { AnimatePresence, motion } from "motion/react";
import { Children, isValidElement, useRef, useState } from "react";
import { cn } from "~/lib/cn";
import { copyText } from "~/lib/hooks";
import { spring } from "~/lib/motion";
import { Check, Copy } from "../ui/icons";

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

/** Shiki block with a language label and a copy button that morphs into a check. */
export function CodeBlock(props: Props) {
  const { className, "data-language": _lang, ...rest } = props;
  const lang = languageOf(props);
  const label = lang ? (LABELS[lang] ?? lang) : null;
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const text = ref.current?.querySelector("code")?.innerText ?? ref.current?.innerText ?? "";
    if (await copyText(text.replace(/\n$/, ""))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
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
          aria-label={copied ? "Copied" : "Copy code"}
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
            {copied ? "Copied" : "Copy"}
          </span>
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? "Copied to clipboard" : ""}
          </span>
        </button>
      </div>
      <pre ref={ref} className={cn(className)} {...rest} />
    </div>
  );
}
