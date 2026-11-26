import { motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "~/lib/cn";
import { spring } from "~/lib/motion";
import { Check, ChevronDown, SearchIcon } from "./icons";

export type SelectOption<T extends string> = { value: T; label: string; swatches?: string[] };

function measurePopup(trigger: HTMLElement) {
  const bounds = trigger.getBoundingClientRect();
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop ?? 0;
  const bottom = top + (viewport?.height ?? window.innerHeight);
  const below = bottom - bounds.bottom;
  const above = bounds.top - top;
  const placeAbove = below < 264 && above > below;
  return { above: placeAbove, height: Math.max(0, (placeAbove ? above : below) - 12) };
}

export function SelectField<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  searchLabel,
  disabled,
  describedBy,
}: {
  id: string;
  label: string;
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  searchLabel?: string;
  disabled?: boolean;
  describedBy?: string;
}) {
  const uniqueId = useId();
  const listId = `${uniqueId}-options`;
  const popupId = `${uniqueId}-popup`;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ text: "", time: 0 });
  const [popup, setPopup] = useState<{ above: boolean; height: number } | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.value === value);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
    : options;
  const active = filtered[activeIndex];
  const optionId = (index: number) => `${listId}-${index}`;
  const activeId = popup && active ? optionId(activeIndex) : undefined;
  const isOpen = popup !== null;

  useEffect(() => {
    if (!isOpen) return;
    if (searchLabel) search.current?.focus({ preventScroll: true });
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setPopup(null);
    };
    const reposition = () => {
      const button = trigger.current;
      if (button) setPopup((current) => (current ? measurePopup(button) : null));
    };
    const viewport = window.visualViewport;
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", reposition);
    viewport?.addEventListener("resize", reposition);
    viewport?.addEventListener("scroll", reposition);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", reposition);
      viewport?.removeEventListener("resize", reposition);
      viewport?.removeEventListener("scroll", reposition);
    };
  }, [isOpen, searchLabel]);

  useEffect(() => {
    if (!activeId) return;
    const option = document.getElementById(activeId);
    const list = option?.parentElement;
    if (!option || !list) return;
    const item = option.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (item.top < viewport.top) list.scrollTop -= viewport.top - item.top;
    if (item.bottom > viewport.bottom) list.scrollTop += item.bottom - viewport.bottom;
  }, [activeId, normalizedQuery]);

  const open = (index = selectedIndex) => {
    const button = trigger.current;
    if (!button) return;
    setQuery("");
    setActiveIndex(index);
    setPopup(measurePopup(button));
  };

  const choose = (option: SelectOption<T> | undefined, returnFocus: boolean) => {
    if (option) onChange(option.value);
    typeahead.current = { text: "", time: 0 };
    setPopup(null);
    if (returnFocus) trigger.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const fromSearch = event.target === search.current;
    const { key } = event;
    if (key === "Escape" && popup) {
      event.preventDefault();
      event.stopPropagation();
      choose(undefined, true);
    } else if (key === "Tab" && popup && !searchLabel) {
      choose(active, false);
    } else if (key === "Enter" || (key === " " && !fromSearch)) {
      event.preventDefault();
      if (popup) {
        if (active) choose(active, true);
      } else open();
    } else if (key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault();
      const direction = key === "ArrowUp" ? -1 : 1;
      if (popup)
        setActiveIndex(Math.max(0, Math.min(filtered.length - 1, activeIndex + direction)));
      else open(key === "ArrowUp" ? 0 : selectedIndex);
    } else if (!fromSearch && (key === "Home" || key === "End")) {
      event.preventDefault();
      const index = key === "Home" ? 0 : filtered.length - 1;
      if (popup) setActiveIndex(index);
      else open(index);
    } else if (
      !searchLabel &&
      key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const time = performance.now();
      const previous = time - typeahead.current.time < 700 ? typeahead.current.text : "";
      const letter = key.toLowerCase();
      const cycling = previous === letter;
      const text = cycling ? letter : previous + letter;
      typeahead.current = { text, time };
      const start = cycling ? (popup ? activeIndex : selectedIndex) + 1 : 0;
      for (let offset = 0; offset < options.length; offset++) {
        const index = (start + offset) % options.length;
        if (options[index]?.label.toLowerCase().startsWith(text)) {
          event.preventDefault();
          if (popup) setActiveIndex(index);
          else open(index);
          break;
        }
      }
    }
  };

  return (
    <div
      ref={root}
      className={cn("relative min-w-0 sm:w-60", popup && "z-20")}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!popup || !next) return;
        if (
          !event.currentTarget.contains(next) ||
          (next === trigger.current && event.target === search.current)
        ) {
          setPopup(null);
        }
      }}
    >
      <button
        id={id}
        ref={trigger}
        type="button"
        role={searchLabel ? undefined : "combobox"}
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy ? `${id}-value ${describedBy}` : `${id}-value`}
        aria-haspopup={searchLabel ? "dialog" : "listbox"}
        aria-expanded={!!popup}
        aria-controls={popup ? (searchLabel ? popupId : listId) : undefined}
        aria-activedescendant={searchLabel ? undefined : activeId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onClick={() => (popup ? setPopup(null) : open())}
        className="flex h-12 w-full items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-left text-sm font-medium text-fg shadow-[var(--shadow-sm)] transition-colors hover:border-line-strong aria-expanded:border-accent-line disabled:opacity-60"
      >
        <span id={`${id}-value`} className="min-w-0 flex-1 truncate">
          {selected?.label ?? value}
        </span>
        <Swatches colors={selected?.swatches} />
        <motion.span
          className="shrink-0 text-subtle"
          initial={false}
          animate={{ rotate: popup ? 180 : 0 }}
          transition={spring.snappy}
        >
          <ChevronDown size={15} />
        </motion.span>
      </button>
      {popup && (
        <motion.div
          id={popupId}
          role={searchLabel ? "dialog" : undefined}
          aria-label={searchLabel ? label : undefined}
          initial={{ opacity: 0, y: popup.above ? 4 : -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.snappy}
          className={cn(
            "absolute inset-x-0 flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-lg)]",
            popup.above ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
          style={{ maxHeight: `min(17rem, ${popup.height}px)` }}
        >
          {searchLabel && (
            <div className="mx-1.5 mt-1.5 flex shrink-0 items-center gap-2 rounded-lg bg-sunken px-2.5 text-muted focus-within:ring-1 focus-within:ring-ring">
              <SearchIcon size={15} className="shrink-0" />
              <input
                ref={search}
                role="combobox"
                aria-label={searchLabel}
                aria-expanded="true"
                aria-autocomplete="list"
                aria-controls={listId}
                aria-activedescendant={activeId}
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={`${searchLabel}…`}
                className="h-11 min-w-0 w-full bg-transparent text-base text-fg outline-none focus-visible:outline-none placeholder:text-subtle"
              />
            </div>
          )}
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="themed-scrollbar min-h-0 overflow-y-auto overscroll-contain p-1.5"
          >
            {filtered.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={option.value === value}
                data-active={index === activeIndex || undefined}
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={(event) => {
                  if (event.pointerType === "mouse") setActiveIndex(index);
                }}
                onClick={() => choose(option, true)}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm text-muted aria-selected:font-medium aria-selected:text-accent-strong data-[active]:bg-sunken data-[active]:text-fg"
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <Swatches colors={option.swatches} />
                <Check
                  size={14}
                  className={cn(
                    "shrink-0 text-accent-strong",
                    option.value !== value && "invisible",
                  )}
                />
              </li>
            ))}
          </ul>
          {!filtered.length && (
            <p role="status" className="px-3 pb-3 text-sm text-muted">
              No matching palettes.
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}

function Swatches({ colors }: { colors?: string[] }) {
  if (!colors?.length) return null;
  return (
    <span aria-hidden="true" className="flex shrink-0 gap-0.5">
      {colors.map((color, index) => (
        <span
          key={index}
          className="size-2.5 rounded-full border border-fg/15"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}
