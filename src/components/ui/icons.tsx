import { motion, type Variants } from "motion/react";
import { useEffect, useRef, useState, type ReactNode, type SVGProps } from "react";
import { ease, spring } from "~/lib/motion";

/** 24px stroke icons in one consistent style (1.75 stroke, round caps). */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/**
 * Icons animate on their own: each one finds its host, the nearest link, button, label,
 * listbox option or `[data-icon-host]`, and plays its `hover` variant while that host is
 * hovered (mouse/pen), keyboard-focused or `aria-selected` (command palette rows).
 * An icon without a host inherits the variant of the nearest motion ancestor spreading
 * `{...hoverTrigger}` (lib/motion.ts): stat cells, cards, callout headings.
 * Static icons and the server render are unaffected; MotionConfig reducedMotion="user"
 * switches the transforms off.
 */
const HOST = "a,button,label,[role=option],[data-icon-host]";

function useHostState(ref: React.RefObject<SVGSVGElement | null>) {
  const [state, setState] = useState<"rest" | "hover">();
  useEffect(() => {
    const host = ref.current?.closest<HTMLElement>(HOST);
    if (!host) return;
    let pointer = false;
    let focus = false;
    let selected = false;
    const sync = () => setState(pointer || focus || selected ? "hover" : "rest");
    const enter = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      pointer = true;
      sync();
    };
    const leave = () => {
      pointer = false;
      sync();
    };
    const focusIn = () => {
      focus = host.matches(":focus-visible") || !!host.querySelector(":focus-visible");
      sync();
    };
    const focusOut = () => {
      focus = false;
      sync();
    };
    const readSelected = () => {
      selected = host.getAttribute("aria-selected") === "true";
      sync();
    };
    readSelected();
    const observer = new MutationObserver(readSelected);
    observer.observe(host, { attributes: true, attributeFilter: ["aria-selected"] });
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("focusin", focusIn);
    host.addEventListener("focusout", focusOut);
    return () => {
      observer.disconnect();
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("focusin", focusIn);
      host.removeEventListener("focusout", focusOut);
    };
  }, [ref]);
  return state;
}

function Icon({ size = 16, children, ...props }: IconProps) {
  const ref = useRef<SVGSVGElement>(null);
  const state = useHostState(ref);
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {/* `state` is undefined until a host is found, so a host-less icon inherits its
          ancestor's variant. Motion fixes a node's place in the variant tree when it is
          created, so the key remounts the group as a controlling node once a host exists. */}
      <motion.g key={state ? "host" : "inherit"} initial={false} animate={state}>
        {children}
      </motion.g>
    </svg>
  );
}

/* ---- navigation ---- */

/** Magnifier sweeps side to side, scanning. */
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <motion.g variants={scan}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </motion.g>
  </Icon>
);
/** Arrows slide out in their direction and a twin slides in behind (clipped by the viewBox). */
export const ArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <SlideThrough dx={22}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </SlideThrough>
  </Icon>
);
export const ArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <SlideThrough dx={-22}>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </SlideThrough>
  </Icon>
);
export const ArrowUp = (p: IconProps) => (
  <Icon {...p}>
    <SlideThrough dy={-22}>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </SlideThrough>
  </Icon>
);
export const ArrowUpRight = (p: IconProps) => (
  <Icon {...p}>
    <SlideThrough dx={20} dy={-20}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </SlideThrough>
  </Icon>
);
/** Nudges once in the direction it points (rotated parents flip it along). */
export const ChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <motion.path d="m6 9 6 6 6-6" variants={nudgeDown} />
  </Icon>
);
/** The two sheets slide apart. */
export const Copy = (p: IconProps) => (
  <Icon {...p}>
    <motion.rect x="9" y="9" width="11" height="11" rx="2.5" variants={sheetFront} />
    <motion.path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" variants={sheetBack} />
  </Icon>
);
/** Turns a quarter. */
export const Close = (p: IconProps) => (
  <Icon {...p}>
    <motion.path d="M6 6l12 12M18 6 6 18" variants={quarterTurn} />
  </Icon>
);
/** Leans like an italic. */
export const Hash = (p: IconProps) => (
  <Icon {...p}>
    <motion.path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" variants={lean} />
  </Icon>
);
/** The two links tug apart and snap back. */
export const LinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <motion.path
      d="M10 14a4.5 4.5 0 0 0 6.4 0l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4L11.5 6"
      custom={1}
      variants={tug}
    />
    <motion.path
      d="M14 10a4.5 4.5 0 0 0-6.4 0l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.3-1.2"
      custom={-1}
      variants={tug}
    />
  </Icon>
);
/** The shackle lifts open. */
export const Lock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2.5" />
    <motion.path d="M8 11V8a4 4 0 0 1 8 0v3" variants={shackle} />
  </Icon>
);
/** Hands sweep round on hover (minute hand a full turn, hour hand one hour). */
export const Clock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <motion.g variants={clockMinute}>
      <Pivot />
      <path d="M12 12V7.5" />
    </motion.g>
    <motion.g variants={clockHour}>
      <Pivot />
      <path d="m12 12 3 2" />
    </motion.g>
  </Icon>
);
/** On hover the binding rings hop and a day gets marked. */
export const Calendar = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2.5" />
    <path d="M4 10h16" />
    <motion.path d="M9 3v4M15 3v4" variants={calendarRings} />
    <motion.circle
      cx="15.5"
      cy="15"
      r="1.4"
      fill="currentColor"
      stroke="none"
      variants={calendarDay}
    />
  </Icon>
);
/** The stack fans out on hover: the top sheet lifts and a middle sheet slides out. */
export const Layers = (p: IconProps) => (
  <Icon overflow="visible" {...p}>
    <motion.path d="m3 13 9 5 9-5" variants={layerBottom} />
    <motion.path d="m3 13 9 5 9-5" variants={layerMiddle} />
    <motion.path d="m12 3 9 5-9 5-9-5 9-5Z" variants={layerTop} />
  </Icon>
);
/** Lines shrink and regrow one after another. */
export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    {[6, 12, 18].map((y, i) => (
      <motion.path
        key={y}
        d={`M9 ${y}h11`}
        custom={i}
        style={{ originX: 0 }}
        variants={lineRipple}
      />
    ))}
    <circle cx="4.5" cy="6" r=".6" fill="currentColor" />
    <circle cx="4.5" cy="12" r=".6" fill="currentColor" />
    <circle cx="4.5" cy="18" r=".6" fill="currentColor" />
  </Icon>
);
/** Nodes pulse in turn, like a signal passing through the graph. */
export const GraphIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m8.4 7.7 7.2-1.2M7.3 9.2l4.5 6.6M17.2 8.4l-3.2 7.3" />
    <motion.circle cx="6" cy="7" r="2.5" custom={0} variants={nodePulse} />
    <motion.circle cx="18" cy="6" r="2.5" custom={1} variants={nodePulse} />
    <motion.circle cx="13" cy="18" r="2.5" custom={2} variants={nodePulse} />
  </Icon>
);
/** Broadcasts: the dot, then each wave, light up outward. */
export const Rss = (p: IconProps) => (
  <Icon {...p}>
    <motion.circle cx="6" cy="18" r="1" fill="currentColor" custom={0} variants={broadcast} />
    <motion.path d="M5 11a8 8 0 0 1 8 8" custom={1} variants={broadcast} />
    <motion.path d="M5 5a14 14 0 0 1 14 14" custom={2} variants={broadcast} />
  </Icon>
);
export const Book = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z" />
    <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" />
  </Icon>
);
/** Turns a quarter. */
export const Plus = (p: IconProps) => (
  <Icon {...p}>
    <motion.path d="M12 5v14M5 12h14" variants={quarterTurn} />
  </Icon>
);
/** Squeezes in, like zooming out. */
export const Minus = (p: IconProps) => (
  <Icon {...p}>
    <motion.path d="M5 12h14" variants={squeeze} />
  </Icon>
);
/** The corners push outward. */
export const Expand = (p: IconProps) => (
  <Icon {...p}>
    <motion.path d="M15 4h5v5M20 4l-6 6" custom={1} variants={pushOut} />
    <motion.path d="M9 20H4v-5M4 20l6-6" custom={-1} variants={pushOut} />
  </Icon>
);
/** Spins a full turn backwards. */
export const Reset = (p: IconProps) => (
  <Icon {...p}>
    <motion.g variants={rewind}>
      <Pivot />
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
    </motion.g>
  </Icon>
);
/** Presses in, like the key it stands for. */
export const CornerEnter = (p: IconProps) => (
  <Icon {...p}>
    <motion.g variants={press}>
      <path d="M20 5v7a3 3 0 0 1-3 3H5" />
      <path d="m9 11-4 4 4 4" />
    </motion.g>
  </Icon>
);
/** The text lines are written again. */
export const FileText = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5" />
    <motion.path d="M9 13h6" custom={0} variants={writeLine} />
    <motion.path d="M9 17h4" custom={1} variants={writeLine} />
  </Icon>
);
export const Sparkle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3c.5 4.5 2 6 6.5 6.5-4.5.5-6 2-6.5 6.5-.5-4.5-2-6-6.5-6.5C10 9 11.5 7.5 12 3Z" />
    <path d="M19 15c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z" />
  </Icon>
);

/* ---- callout icons ---- */
/** On hover the pencil writes: it bobs along to the right, inking a wavy line from its tip. */
export const Pencil = (p: IconProps) => (
  <Icon overflow="visible" {...p}>
    <motion.path d="M4 20q1-2 2 0t2 0 2 0" variants={pencilInk} />
    <motion.g variants={pencilBody}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </motion.g>
  </Icon>
);
/** On hover the lines are wiped and written again, one after the other. */
export const ClipboardList = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2.5" />
    <path d="M9 4.5V3h6v1.5" />
    <motion.path d="M9 11h6" custom={0} variants={writeLine} />
    <motion.path d="M9 15h4" custom={1} variants={writeLine} />
  </Icon>
);
/** The dot of the "i" hops. */
export const Info = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" />
    <motion.circle cx="12" cy="8" r=".6" fill="currentColor" variants={hop} />
  </Icon>
);
/** The tick is drawn again. */
export const CheckCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <motion.path d="m8.5 12.2 2.4 2.3 4.6-5" custom={0} variants={writeLine} />
  </Icon>
);
/** Flickers like a 2D flame on hover, with an inner tongue lighting up. */
export const Flame = (p: IconProps) => (
  <Icon overflow="visible" {...p}>
    <motion.path
      d="M12 21a6 6 0 0 0 6-6c0-3.5-2.5-5.5-3.5-8-1 1.5-1.5 2.5-3 3 0-2.5-1-5-3-7 0 4-3.5 6.5-3.5 12a6 6 0 0 0 6 6Z"
      style={{ originY: 1 }}
      variants={flameOuter}
    />
    <motion.path
      d="M12 18.5a2.4 2.4 0 0 0 2.4-2.4c0-1.5-1.2-2.4-2.4-4-1.2 1.6-2.4 2.5-2.4 4a2.4 2.4 0 0 0 2.4 2.4Z"
      style={{ originY: 1 }}
      variants={flameInner}
    />
  </Icon>
);
/** Used for "copied" feedback: the tick draws itself in when it mounts. */
export const Check = (p: IconProps) => (
  <Icon {...p}>
    <motion.path
      d="m5 12.5 4.5 4.5L19 7.5"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.3, ease: ease.out }}
    />
  </Icon>
);
/** The question mark tilts its head. */
export const HelpCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <motion.g variants={ponder}>
      <path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" />
    </motion.g>
  </Icon>
);
/** Shakes on its base, like a sign in the wind. */
export const AlertTriangle = (p: IconProps) => (
  <Icon overflow="visible" {...p}>
    <motion.g style={{ originY: 1 }} variants={shake}>
      <path d="M10.3 4.2 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4" />
      <circle cx="12" cy="16.8" r=".6" fill="currentColor" />
    </motion.g>
  </Icon>
);
/** The cross turns a quarter. */
export const XCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <motion.path d="m9.5 9.5 5 5M14.5 9.5l-5 5" variants={quarterTurn} />
  </Icon>
);
/** Strikes: a jolt and a flash of fill. */
export const Zap = (p: IconProps) => (
  <Icon overflow="visible" {...p}>
    <motion.path
      d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z"
      fill="currentColor"
      fillOpacity={0}
      variants={strike}
    />
  </Icon>
);
/** Wiggles, scuttling. */
export const Bug = (p: IconProps) => (
  <Icon overflow="visible" {...p}>
    <motion.g variants={scuttle}>
      <rect x="8" y="7" width="8" height="13" rx="4" />
      <path d="M9.5 7a2.5 2.5 0 0 1 5 0M4 13h4M16 13h4M5 8l3 2M19 8l-3 2M5 19l3-2M19 19l-3-2M12 11v9" />
    </motion.g>
  </Icon>
);
/** Lines shrink and regrow one after another. */
export const ListOrdered = (p: IconProps) => (
  <Icon {...p}>
    {[6, 12, 18].map((y, i) => (
      <motion.path
        key={y}
        d={`M10 ${y}h10`}
        custom={i}
        style={{ originX: 0 }}
        variants={lineRipple}
      />
    ))}
    <path d="M4 5l1.5-1v5M4 13.5a1.5 1.5 0 1 1 2.5 1L4 17h3" />
  </Icon>
);
/** The marks bounce in turn, as if spoken. */
export const Quote = (p: IconProps) => (
  <Icon overflow="visible" {...p}>
    <motion.path d="M7 7h4v4c0 3-1.5 5-4 6" custom={0} variants={hopInTurn} />
    <motion.path d="M14 7h4v4c0 3-1.5 5-4 6" custom={1} variants={hopInTurn} />
  </Icon>
);
/** GitHub's mark (Octicon mark-github, 16px grid): a filled brand glyph, not a stroke icon. */
export const GithubIcon = (p: IconProps) => (
  <Icon viewBox="0 0 16 16" fill="currentColor" stroke="none" {...p}>
    <motion.g variants={wave}>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </motion.g>
  </Icon>
);

/* ---------------------------------------------------------------------------------------
   Variants. `rest` is the static drawing; `hover` is the micro-interaction. One-shot
   gestures use keyframes that end where they started, so hover can be held indefinitely.
   --------------------------------------------------------------------------------------- */

/** Invisible disc centred on (12,12): gives a rotating group a bbox centred on the dial. */
const Pivot = () => <circle cx="12" cy="12" r="6" stroke="none" fill="none" />;

/** Two copies: the visible one leaves by (dx,dy), its twin arrives from the opposite side. */
function SlideThrough({
  dx = 0,
  dy = 0,
  children,
}: {
  dx?: number;
  dy?: number;
  children: ReactNode;
}) {
  return (
    <>
      <motion.g
        variants={{ rest: { x: 0, y: 0 }, hover: { x: dx, y: dy } }}
        transition={spring.snappy}
      >
        {children}
      </motion.g>
      <motion.g
        style={{ x: -dx, y: -dy }}
        variants={{ rest: { x: -dx, y: -dy }, hover: { x: 0, y: 0 } }}
        transition={spring.snappy}
      >
        {children}
      </motion.g>
    </>
  );
}

const once = (duration = 0.45) => ({ duration, ease: ease.inOut });

const scan: Variants = {
  rest: { rotate: 0 },
  hover: { rotate: [0, -14, 10, 0], transition: once(0.55) },
};
const nudgeDown: Variants = {
  rest: { y: 0 },
  hover: { y: [0, 2.5, 0], transition: once(0.4) },
};
const sheetFront: Variants = {
  rest: { x: 0, y: 0, transition: spring.snappy },
  hover: { x: 1, y: 1, transition: spring.snappy },
};
const sheetBack: Variants = {
  rest: { x: 0, y: 0, transition: spring.snappy },
  hover: { x: -1.5, y: -1.5, transition: spring.snappy },
};
const quarterTurn: Variants = {
  rest: { rotate: 0, transition: spring.snappy },
  hover: { rotate: 90, transition: spring.snappy },
};
const lean: Variants = {
  rest: { skewX: 0, scale: 1, transition: spring.snappy },
  hover: { skewX: -12, scale: 1.08, transition: spring.snappy },
};
const tug: Variants = {
  rest: { x: 0, y: 0 },
  hover: (d: number) => ({
    x: [0, 1.4 * d, 0],
    y: [0, -1.4 * d, 0],
    transition: once(0.45),
  }),
};
const shackle: Variants = {
  rest: { y: 0, transition: spring.snappy },
  hover: { y: -2, transition: spring.snappy },
};
const lineRipple: Variants = {
  rest: { scaleX: 1 },
  hover: (i: number) => ({
    scaleX: [1, 0.4, 1],
    transition: { ...once(0.45), delay: i * 0.07 },
  }),
};
const nodePulse: Variants = {
  rest: { scale: 1 },
  hover: (i: number) => ({
    scale: [1, 1.35, 1],
    transition: { ...once(0.4), delay: i * 0.1 },
  }),
};
const broadcast: Variants = {
  rest: { opacity: 1 },
  hover: (i: number) => ({
    opacity: [1, 0.2, 1],
    transition: { ...once(0.5), delay: i * 0.12 },
  }),
};
const squeeze: Variants = {
  rest: { scaleX: 1 },
  hover: { scaleX: [1, 0.55, 1], transition: once(0.4) },
};
const pushOut: Variants = {
  rest: { x: 0, y: 0, transition: spring.snappy },
  hover: (d: number) => ({ x: 1.5 * d, y: -1.5 * d, transition: spring.snappy }),
};
const rewind: Variants = {
  rest: { rotate: 0, transition: { duration: 0 } },
  hover: { rotate: -360, transition: { duration: 0.6, ease: ease.out } },
};
const press: Variants = {
  rest: { x: 0 },
  hover: { x: [0, -2.5, 0], transition: once(0.35) },
};
const hop: Variants = {
  rest: { y: 0 },
  hover: { y: [0, -2.5, 0], transition: once(0.4) },
};
const hopInTurn: Variants = {
  rest: { y: 0 },
  hover: (i: number) => ({ y: [0, -2, 0], transition: { ...once(0.35), delay: i * 0.1 } }),
};
const ponder: Variants = {
  rest: { rotate: 0 },
  hover: { rotate: [0, -14, 10, -4, 0], transition: once(0.6) },
};
const shake: Variants = {
  rest: { rotate: 0 },
  hover: { rotate: [0, -9, 8, -6, 4, -2, 0], transition: once(0.55) },
};
const strike: Variants = {
  rest: { scale: 1, fillOpacity: 0 },
  hover: { scale: [1, 1.15, 1], fillOpacity: [0, 0.45, 0, 0.3, 0], transition: once(0.5) },
};
const scuttle: Variants = {
  rest: { rotate: 0, x: 0 },
  hover: { rotate: [0, -8, 8, -8, 8, 0], x: [0, -0.5, 0.5, -0.5, 0.5, 0], transition: once(0.5) },
};
const wave: Variants = {
  rest: { rotate: 0 },
  hover: { rotate: [0, -12, 10, -6, 0], transition: once(0.6) },
};

const clockMinute: Variants = {
  rest: { rotate: 0, transition: { duration: 0 } },
  hover: { rotate: 360, transition: { duration: 0.9, ease: ease.out } },
};
const clockHour: Variants = {
  rest: { rotate: 0, transition: spring.soft },
  hover: { rotate: 30, transition: { duration: 0.9, ease: ease.out } },
};

const calendarRings: Variants = {
  rest: { y: 0 },
  hover: { y: [0, -1.75, 0], transition: { duration: 0.4, ease: ease.inOut } },
};
const calendarDay: Variants = {
  rest: { scale: 0, opacity: 0, transition: { duration: 0.12 } },
  hover: { scale: 1, opacity: 1, transition: { ...spring.snappy, delay: 0.12 } },
};

const layerTop: Variants = {
  rest: { y: 0, transition: spring.snappy },
  hover: { y: -2, transition: spring.snappy },
};
const layerMiddle: Variants = {
  rest: { y: 0, opacity: 0, transition: spring.snappy },
  hover: { y: -3, opacity: 1, transition: spring.snappy },
};
const layerBottom: Variants = {
  rest: { y: 0, transition: spring.snappy },
  hover: { y: 1, transition: spring.snappy },
};

const writeLine: Variants = {
  rest: { pathLength: 1, transition: { duration: 0 } },
  hover: (i: number) => ({
    pathLength: [0, 1],
    transition: { duration: 0.28, delay: 0.08 + i * 0.22, ease: ease.out },
  }),
};

const write = { duration: 0.7, ease: "linear" } as const;
const pencilBody: Variants = {
  rest: { x: 0, y: 0, transition: spring.snappy },
  // the tip follows the ink: one bob per wave crest
  hover: { x: [0, 1, 2, 3, 4, 5, 6], y: [0, -1, 0, -1, 0, -1, 0], transition: write },
};
const pencilInk: Variants = {
  rest: { pathLength: 0, opacity: 0, transition: { duration: 0.15 } },
  hover: { pathLength: [0, 1], opacity: 1, transition: { ...write, opacity: { duration: 0 } } },
};

const flicker = { duration: 1.1, repeat: Infinity, ease: "easeInOut" } as const;
const flameOuter: Variants = {
  rest: { scaleX: 1, scaleY: 1, skewX: 0, transition: spring.snappy },
  hover: {
    scaleX: [1, 0.95, 1.03, 0.97, 1],
    scaleY: [1, 1.08, 0.96, 1.05, 1],
    skewX: [0, -5, 3, -2, 0],
    transition: flicker,
  },
};
const flameInner: Variants = {
  rest: { opacity: 0, scale: 0.5, skewX: 0, transition: { duration: 0.15 } },
  hover: {
    opacity: 1,
    scale: [0.85, 1.15, 0.9, 1.1, 0.85],
    skewX: [0, 6, -4, 3, 0],
    transition: { opacity: { duration: 0.15 }, default: { ...flicker, duration: 0.8 } },
  },
};
