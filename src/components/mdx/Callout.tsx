import { AnimatePresence, motion } from "motion/react";
import {
  Children,
  isValidElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "~/lib/cn";
import { ease, spring } from "~/lib/motion";
import {
  AlertTriangle,
  Bug,
  CheckCircle,
  ChevronDown,
  ClipboardList,
  Flame,
  HelpCircle,
  Info,
  ListOrdered,
  Pencil,
  Quote,
  XCircle,
  Zap,
} from "../ui/icons";

type IconCmp = (p: { size?: number; className?: string }) => ReactNode;
const ICONS: Record<string, IconCmp> = {
  note: Pencil,
  abstract: ClipboardList,
  summary: ClipboardList,
  tldr: ClipboardList,
  info: Info,
  todo: CheckCircle,
  tip: Flame,
  hint: Flame,
  important: Flame,
  success: CheckCircle,
  check: CheckCircle,
  done: CheckCircle,
  question: HelpCircle,
  help: HelpCircle,
  faq: HelpCircle,
  warning: AlertTriangle,
  caution: AlertTriangle,
  attention: AlertTriangle,
  failure: XCircle,
  fail: XCircle,
  missing: XCircle,
  danger: Zap,
  error: Zap,
  bug: Bug,
  example: ListOrdered,
  quote: Quote,
  cite: Quote,
};

type ElementWithClass = ReactElement<{ className?: string; children?: ReactNode }>;
const hasClass = (node: ReactNode, cls: string): node is ElementWithClass =>
  isValidElement<{ className?: string }>(node) &&
  typeof node.props.className === "string" &&
  node.props.className.split(/\s+/).includes(cls);

/** Pull the title text and body out of B's `aside[data-callout]` markup. */
export function splitCallout(children: ReactNode): { title: ReactNode; body: ReactNode } {
  const nodes = Children.toArray(children);
  const titleEl = nodes.find((n) => hasClass(n, "callout-title"));
  const bodyEl = nodes.find((n) => hasClass(n, "callout-content"));
  let title: ReactNode = null;
  if (titleEl) {
    const inner = Children.toArray(titleEl.props.children);
    const text = inner.find((n) => hasClass(n, "callout-title-text"));
    title = text ? text.props.children : titleEl.props.children;
  }
  const body = bodyEl ? bodyEl.props.children : nodes.filter((n) => n !== titleEl);
  return { title, body };
}

type Props = React.ComponentProps<"aside"> & {
  "data-callout"?: string;
  "data-callout-fold"?: string;
};

/**
 * Obsidian callout. Tinted by type (see .callout[data-callout] tokens in app.css).
 * Foldable callouts (`> [!note]-` / `+`) get a real button with an animated height.
 */
export function Callout({
  "data-callout": rawType = "note",
  "data-callout-fold": fold,
  children,
  className,
  ...rest
}: Props) {
  const type = rawType.toLowerCase();
  const Icon = ICONS[type] ?? Pencil;
  const { title, body } = splitCallout(children);
  const foldable = fold === "open" || fold === "closed";
  const [open, setOpen] = useState(fold !== "closed");
  const bodyId = useId();

  const heading = (
    <>
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--c)_14%,transparent)] text-[var(--c)]">
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1 font-semibold text-[color-mix(in_oklab,var(--c)_78%,var(--fg))] [&_code]:text-[0.85em]">
        {title ?? type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    </>
  );

  return (
    <aside
      {...rest}
      data-callout={type}
      className={cn(
        "callout my-7 overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--c)_22%,var(--line))] bg-[color-mix(in_oklab,var(--c)_5%,var(--surface))] text-[0.96em]",
        className,
      )}
    >
      {foldable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[color-mix(in_oklab,var(--c)_6%,transparent)] focus-visible:-outline-offset-2"
        >
          {heading}
          <motion.span
            animate={{ rotate: open ? 0 : -90 }}
            transition={spring.snappy}
            className="text-[var(--c)] opacity-70"
          >
            <ChevronDown size={16} />
          </motion.span>
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 pt-3 pb-1">{heading}</div>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.32, ease: ease.out }, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className="callout-body px-4 pt-1 pb-3.5 [&>*:first-child]:mt-1 [&>*:last-child]:mb-0 [&_p]:my-2.5 [&_pre]:my-3 [&_ul]:my-2.5 [&_ol]:my-2.5">
              {body}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
