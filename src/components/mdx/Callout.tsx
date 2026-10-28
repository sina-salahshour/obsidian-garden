import { motion, useReducedMotion } from "motion/react";
import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
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

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Plain text of a title node (for comparing a custom title with the type name). */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

type Props = Omit<React.ComponentProps<"aside">, "ref"> & {
  "data-callout"?: string;
  "data-callout-fold"?: string;
};

/**
 * Obsidian callout. Tinted by type (see .callout[data-callout] tokens in app.css).
 * Foldable callouts (`> [!note]-` / `+`) get a real button with an animated height (instant under
 * reduced motion). A closed body stays mounted as `hidden="until-found"`: aria-controls resolves,
 * find-in-page reveals it, and a URL hash pointing inside opens it.
 * Exposed as a labelled `note` (not an `<aside>` landmark); when a custom title hides the type,
 * screen readers still hear it ("Warning: …").
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
  // `shown` lags `open` on close, so the body is hidden only once the fold animation ends
  const [shown, setShown] = useState(open);
  const bodyId = useId();
  const titleId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const typeName = type.charAt(0).toUpperCase() + type.slice(1);
  const titleText = textOf(title).trim().toLowerCase();
  const customTitle = title != null && titleText !== type && titleText !== rawType.toLowerCase();

  const toggle = (next: boolean) => {
    if (next) setShown(true);
    setOpen(next);
  };

  // hidden="until-found" (React only knows the boolean): find-in-page can match and reveal it
  useIsoLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || !foldable) return;
    if (!shown) el.setAttribute("hidden", "until-found");
    const onMatch = () => toggle(true);
    el.addEventListener("beforematch", onMatch);
    return () => el.removeEventListener("beforematch", onMatch);
  }, [shown, foldable]);

  // a link to a heading or footnote inside a closed callout opens it
  useEffect(() => {
    if (!foldable) return;
    const check = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (target && bodyRef.current?.contains(target)) {
        toggle(true);
        requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
      }
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [foldable]);

  const heading = (
    <>
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--c)_14%,transparent)] text-[var(--c)]">
        <Icon size={14} />
      </span>
      <span
        id={titleId}
        className="min-w-0 flex-1 font-semibold text-[color-mix(in_oklab,var(--c)_78%,var(--fg))] [&_code]:text-[0.85em]"
      >
        {customTitle && <span className="sr-only">{typeName}: </span>}
        {title ?? typeName}
      </span>
    </>
  );

  return (
    <div
      {...rest}
      role="note"
      aria-labelledby={titleId}
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
          onClick={() => toggle(!open)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[color-mix(in_oklab,var(--c)_6%,transparent)] focus-visible:-outline-offset-2"
        >
          {heading}
          <motion.span
            initial={false}
            animate={{ rotate: open ? 0 : -90 }}
            transition={reduce ? { duration: 0 } : spring.snappy}
            className="text-[var(--c)] opacity-70"
          >
            <ChevronDown size={16} />
          </motion.span>
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 pt-3 pb-1">{heading}</div>
      )}
      <motion.div
        ref={bodyRef}
        id={bodyId}
        hidden={!shown}
        initial={false}
        animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
        transition={
          reduce
            ? { duration: 0 }
            : { height: { duration: 0.32, ease: ease.out }, opacity: { duration: 0.2 } }
        }
        onAnimationComplete={() => {
          if (!open) setShown(false);
        }}
        className="overflow-hidden"
      >
        <div className="callout-body px-4 pt-1 pb-3.5 [&>*:first-child]:mt-1 [&>*:last-child]:mb-0 [&_p]:my-2.5 [&_pre]:my-3 [&_ul]:my-2.5 [&_ol]:my-2.5">
          {body}
        </div>
      </motion.div>
    </div>
  );
}
