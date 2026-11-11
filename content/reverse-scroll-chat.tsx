import { AnimatePresence, motion } from "motion/react";
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";

type Message = {
	id: number;
	from: "you" | "them";
	text: string;
};

const SEED: Message[] = [
	{ id: 1, from: "them", text: "hey — try the scroll trick live" },
	{ id: 2, from: "you", text: "the history should stick to the bottom, right?" },
	{ id: 3, from: "them", text: "yep. send a few messages, then scroll up" },
	{ id: 4, from: "you", text: "and new ones should not yank me back down?" },
	{
		id: 5,
		from: "them",
		text: "exactly — only if you are already at the bottom. that is the whole point.",
	},
	{ id: 6, from: "them", text: "no scrollTop math. just flex-direction: column-reverse." },
];

const REPLIES = [
	"nice — notice the scroller never jumped",
	"still anchored. CSS did the work.",
	"scroll up mid-conversation; keep typing",
	"column-reverse puts scroll origin at the bottom",
	"the inner wrapper keeps message order normal",
	"append chronologically; the layout sticks itself",
];

/** Match the site's motion vocabulary (src/lib/motion.ts) without importing blog internals. */
const spring = {
	snappy: { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.6 },
	layout: { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.8 },
};

const easeOut = [0.16, 1, 0.3, 1] as const;

function cx(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}

/**
 * Mini chat that demos bottom-anchored history via nested flex + column-reverse.
 * Lives in the vault next to the note; sync copies it into content/ for the MDX import.
 */
export function ReverseScrollChat({ className }: { className?: string }) {
	const uid = useId();
	const listId = `${uid}-log`;
	const draftId = `${uid}-draft`;
	const pillId = `${uid}-mode-pill`;
	const [messages, setMessages] = useState(SEED);
	const [draft, setDraft] = useState("");
	const [mode, setMode] = useState<"reverse" | "normal">("reverse");
	const [typing, setTyping] = useState(false);

	function send(text: string) {
		const trimmed = text.trim();
		if (!trimmed || typing) return;
		const yours: Message = { id: Date.now(), from: "you", text: trimmed };
		const replyText = REPLIES[messages.length % REPLIES.length]!;
		setMessages((prev) => [...prev, yours]);
		setDraft("");
		setTyping(true);
		window.setTimeout(() => {
			setMessages((prev) => [
				...prev,
				{ id: Date.now() + 1, from: "them", text: replyText },
			]);
			setTyping(false);
		}, 520);
	}

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		send(draft);
	}

	function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			send(draft);
		}
	}

	const reverse = mode === "reverse";
	const canSend = Boolean(draft.trim()) && !typing;

	return (
		<div
			className={cx(
				"not-prose my-8 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-sm)]",
				className,
			)}
		>
			<header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
				<div className="min-w-0">
					<p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-subtle uppercase">
						Live demo
					</p>
					<p className="mt-1 text-xs text-muted">
						{reverse
							? "Nested column-reverse — bottom-anchored, no scroll JS"
							: "Normal column — new messages fall below the fold"}
					</p>
				</div>

				<div
					className="inline-flex rounded-full border border-line bg-sunken/80 p-0.5"
					role="group"
					aria-label="Scroll mode"
				>
					{(
						[
							["reverse", "Reverse"],
							["normal", "Normal"],
						] as const
					).map(([value, label]) => {
						const active = mode === value;
						return (
							<button
								key={value}
								type="button"
								aria-pressed={active}
								onClick={() => setMode(value)}
								className={cx(
									"relative inline-flex h-8 items-center rounded-full px-3.5 text-xs font-medium transition-colors",
									active ? "text-accent-fg" : "text-muted hover:text-fg",
								)}
							>
								{active && (
									<motion.span
										layoutId={pillId}
										transition={spring.layout}
										className="absolute inset-0 rounded-full bg-accent shadow-[var(--shadow-sm)]"
									/>
								)}
								<span className="relative">{label}</span>
							</button>
						);
					})}
				</div>
			</header>

			<div
				id={listId}
				role="log"
				aria-live="polite"
				aria-relevant="additions"
				aria-label="Chat messages"
				className={cx(
					"scrollbar-thin h-72 overflow-y-auto overscroll-contain px-3.5 py-3.5 sm:h-80 sm:px-5",
					reverse && "flex flex-col-reverse",
				)}
			>
				{/*
          Reverse mode: one flex child inside column-reverse. That child is not
          flipped item-by-item, so chronological order still reads top → bottom,
          while the scroller's origin sits at the bottom.
        */}
				<div className={cx("flex flex-col gap-2.5", !reverse && "min-h-full justify-end")}>
					<AnimatePresence initial={false}>
						{messages.map((m) => (
							<motion.div
								key={m.id}
								layout="position"
								initial={{ opacity: 0, y: reverse ? 8 : 10, scale: 0.98 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								transition={{ duration: 0.28, ease: easeOut }}
								className={cx("flex", m.from === "you" ? "justify-end" : "justify-start")}
							>
								<div
									className={cx(
										"flex max-w-[88%] items-end gap-2 sm:max-w-[78%]",
										m.from === "you" && "flex-row-reverse",
									)}
								>
									<span
										aria-hidden="true"
										className={cx(
											"mb-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold tracking-wide",
											m.from === "you"
												? "bg-accent text-accent-fg"
												: "border border-line bg-sunken text-muted",
										)}
									>
										{m.from === "you" ? "Y" : "T"}
									</span>
									<div
										className={cx(
											"rounded-2xl px-3.5 py-2 text-sm leading-snug",
											m.from === "you"
												? "rounded-br-md bg-accent text-accent-fg"
												: "rounded-bl-md border border-line bg-bg text-fg",
										)}
									>
										<span className="sr-only">{m.from === "you" ? "You: " : "Them: "}</span>
										{m.text}
									</div>
								</div>
							</motion.div>
						))}
					</AnimatePresence>

					<AnimatePresence mode="popLayout">
						{typing && (
							<motion.div
								key="typing"
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -4 }}
								transition={{ duration: 0.16, ease: easeOut }}
								className="flex justify-start"
								aria-hidden="true"
							>
								<div className="flex items-end gap-2">
									<span className="mb-0.5 inline-flex size-6 items-center justify-center rounded-full border border-line bg-sunken text-[0.625rem] font-semibold text-muted">
										T
									</span>
									<div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-bg px-3.5 py-2.5">
										{[0, 1, 2].map((i) => (
											<motion.span
												key={i}
												className="size-1.5 rounded-full bg-subtle"
												animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
												transition={{
													duration: 0.9,
													repeat: Infinity,
													delay: i * 0.14,
													ease: "easeInOut",
												}}
											/>
										))}
									</div>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</div>

			<form
				onSubmit={onSubmit}
				className="flex items-end gap-2 border-t border-line bg-bg/50 px-3.5 py-3 sm:px-5"
			>
				<label className="sr-only" htmlFor={draftId}>
					Message
				</label>
				<textarea
					id={draftId}
					rows={1}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={onKeyDown}
					placeholder="Write a message…"
					disabled={typing}
					className="min-h-10 flex-1 resize-none rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-fg shadow-[var(--shadow-sm)] outline-none placeholder:text-subtle transition-[border-color,box-shadow] focus-visible:border-accent-line focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
				/>
				<motion.button
					type="submit"
					disabled={!canSend}
					whileHover={canSend ? { y: -1 } : undefined}
					whileTap={canSend ? { scale: 0.98 } : undefined}
					transition={spring.snappy}
					className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-fg px-4 text-sm font-medium text-bg transition-[background-color,opacity] hover:bg-fg/85 disabled:cursor-not-allowed disabled:opacity-35"
				>
					Send
				</motion.button>
			</form>
		</div>
	);
}
