import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState } from "react";
import { GitHubProfileLink } from "~/components/ui/GitHubProfileLink";
import { ArrowUpRight, Minus, Plus, Reset } from "~/components/ui/icons";
import { SelectField, type SelectOption } from "~/components/ui/SelectField";
import { buttonStyles } from "~/components/ui/States";
import { getAuthorProfile } from "~/content/functions";
import { githubProfileLogin } from "~/lib/github-profile";
import { enter, spring, tapPress } from "~/lib/motion";
import {
  fontSizeSetting,
  readingSpeedSetting,
  resetReadingPreferences,
  setReadingPreference,
  useReadingPreference,
} from "~/lib/reading-preferences";
import { seo, siteUrlFrom } from "~/lib/seo";
import { resetAppearance, setColorPalette, setThemePreference, useTheme } from "~/lib/theme";
import type { ThemePreference } from "~/lib/theme-script";
import { site } from "~/site.config";

declare const __SITE_BUILD__: {
  version: string;
  builtAt: string;
  environment: string | null;
  commit: string | null;
};

const build = __SITE_BUILD__;
const buildDate = new Intl.DateTimeFormat(site.locale, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
}).format(new Date(build.builtAt));
const environment =
  build.environment === "production"
    ? "Production"
    : build.environment === "preview"
      ? "Preview"
      : import.meta.env.DEV || build.environment === "development"
        ? "Development"
        : "Local build";

export const Route = createFileRoute("/settings")({
  // Full SSR includes the public author snapshot and deployment details. Browser preferences
  // hydrate locally, with theme and font size restored before paint by the document.
  ssr: true,
  loader: () => getAuthorProfile(),
  head: ({ matches }) =>
    seo({
      siteUrl: siteUrlFrom(matches),
      title: "Settings",
      description: `Customize the appearance and reading experience on ${site.title}.`,
      path: "/settings",
      noindex: true,
    }),
  component: SettingsPage,
});

const sectionStyles = "space-y-5 border-t border-line pt-6";
const headingStyles = "font-serif text-2xl font-medium tracking-tight";
const rowStyles = "grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6";
const linkStyles =
  "inline-flex items-center gap-1 text-accent-strong underline decoration-accent-line underline-offset-4 hover:decoration-current";
const themeOptions: SelectOption<ThemePreference>[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const stepButtonStyles =
  "relative h-12 rounded-lg text-muted transition-colors hover:bg-sunken hover:text-fg focus-visible:z-10 aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted";

function SettingsPage() {
  const authorProfile = Route.useLoaderData();
  const { theme, canToggle, savedPalette, preference } = useTheme();
  const [reset, setReset] = useState(false);
  const author = site.defaultAuthor;
  const paletteOptions = site.colorPalettes.map((palette) => {
    const colors = palette[theme ?? "light"] ?? palette.light ?? palette.dark;
    return {
      value: palette.id,
      label: palette.name,
      swatches: colors ? [colors.bg, colors.surface, colors.fg, colors.accent, colors.warm] : [],
    };
  });

  const resetPreferences = () => {
    resetAppearance();
    resetReadingPreferences();
    setReset(true);
  };

  return (
    <main
      id="main"
      tabIndex={-1}
      className="container-page max-w-[42rem] py-10 outline-none sm:py-14"
    >
      <h1 {...enter(0, "font-serif text-4xl font-medium tracking-tight sm:text-5xl")}>Settings</h1>
      <div className="mt-8 space-y-8">
        <section aria-labelledby="appearance-title" {...enter(1, `relative z-10 ${sectionStyles}`)}>
          <h2 id="appearance-title" className={headingStyles}>
            Appearance
          </h2>
          <div className={rowStyles}>
            <div>
              <label id="theme-mode-label" htmlFor="theme-mode" className="font-medium">
                Theme
              </label>
              {!canToggle && (
                <p id="theme-note" className="mt-1 text-sm text-muted">
                  This palette is available in {savedPalette?.light ? "light" : "dark"} mode.
                </p>
              )}
            </div>
            <SelectField<ThemePreference>
              id="theme-mode"
              label="Theme"
              options={themeOptions}
              value={canToggle ? preference : savedPalette?.light ? "light" : "dark"}
              disabled={!canToggle}
              describedBy={canToggle ? undefined : "theme-note"}
              onChange={(mode) => {
                setReset(false);
                setThemePreference(mode);
              }}
            />
          </div>
          {site.colorPalettes.length > 1 && (
            <div className={rowStyles}>
              <label id="color-palette-label" htmlFor="color-palette" className="font-medium">
                Color palette
              </label>
              <SelectField
                id="color-palette"
                label="Color palette"
                searchLabel="Search palettes"
                options={paletteOptions}
                value={savedPalette?.id ?? ""}
                onChange={(id) => {
                  setReset(false);
                  setColorPalette(id);
                }}
              />
            </div>
          )}
          <PreferenceStepper
            name="fontSize"
            label="Base font size"
            suffix="%"
            spokenUnit="percent"
            onChange={() => setReset(false)}
          />
        </section>

        <section aria-labelledby="reading-title" {...enter(2, sectionStyles)}>
          <h2 id="reading-title" className={headingStyles}>
            Reading
          </h2>
          <PreferenceStepper
            name="speed"
            label="Auto-scroll speed"
            suffix="px/s"
            spokenUnit="pixels per second"
            description="How quickly a note moves when you turn on auto-scroll."
            onChange={() => setReset(false)}
          />
        </section>

        <section aria-labelledby="reset-title" {...enter(3, sectionStyles)}>
          <h2 id="reset-title" className={headingStyles}>
            Reset preferences
          </h2>
          <p className="text-sm text-muted">
            Clear the theme, palette, font size, and reading speed saved in this browser.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <motion.button
              type="button"
              onClick={resetPreferences}
              whileTap={tapPress}
              transition={spring.snappy}
              className={buttonStyles.secondary}
            >
              <Reset /> Reset to defaults
            </motion.button>
            <p role="status" className="text-sm text-muted">
              {reset ? "Preferences reset." : ""}
            </p>
          </div>
        </section>

        <section aria-labelledby="about-title" {...enter(4, sectionStyles)}>
          <h2 id="about-title" className={headingStyles}>
            About {site.title}
          </h2>
          <p className="text-sm leading-relaxed text-muted">{site.description}</p>
          <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted">Author</dt>
            <dd>
              {author.url && githubProfileLogin(author.url) ? (
                <GitHubProfileLink
                  href={author.url}
                  name={author.name}
                  profile={authorProfile}
                  className={linkStyles}
                />
              ) : author.url ? (
                <a href={author.url} className={linkStyles}>
                  {author.name} <ArrowUpRight size={13} />
                </a>
              ) : (
                author.name
              )}
              {author.description && <p className="mt-1 text-muted">{author.description}</p>}
            </dd>
            <dt className="text-muted">Version</dt>
            <dd className="tabular-nums">{build.version}</dd>
            <dt className="text-muted">Environment</dt>
            <dd>{environment}</dd>
            <dt className="text-muted">Built</dt>
            <dd>
              <time dateTime={build.builtAt}>{buildDate} UTC</time>
            </dd>
            {build.commit && (
              <>
                <dt className="text-muted">Revision</dt>
                <dd>
                  <code>{build.commit.slice(0, 12)}</code>
                </dd>
              </>
            )}
            {site.github && (
              <>
                <dt className="text-muted">Source</dt>
                <dd>
                  <a href={site.github} className={linkStyles}>
                    GitHub <ArrowUpRight size={13} />
                  </a>
                </dd>
              </>
            )}
          </dl>
        </section>
      </div>
    </main>
  );
}

function PreferenceStepper({
  name,
  label,
  suffix,
  spokenUnit,
  description,
  onChange,
}: {
  name: "fontSize" | "speed";
  label: string;
  suffix: string;
  spokenUnit: string;
  description?: string;
  onChange: () => void;
}) {
  const value = useReadingPreference(name);
  const [draft, setDraft] = useState<string | null>(null);
  const { min, max, step } = name === "fontSize" ? fontSizeSetting : readingSpeedSetting;
  const id = `setting-${name}`;
  const draftNumber = draft ? Number(draft) : value;
  const current = Number.isFinite(draftNumber) ? draftNumber : value;
  const commit = (number: number) => {
    const next = Math.max(min, Math.min(max, min + Math.round((number - min) / step) * step));
    setDraft(null);
    if (next !== value) {
      onChange();
      setReadingPreference(name, next);
    }
  };

  return (
    <div className={rowStyles}>
      <div>
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="mt-1 text-sm text-muted">
            {description}
          </p>
        )}
      </div>
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] rounded-xl border border-line bg-surface p-0.5 shadow-[var(--shadow-sm)] sm:w-60">
        {([-1, 1] as const).map((direction) => {
          const subtract = direction === -1;
          const atLimit = subtract ? current <= min : current >= max;
          const Icon = subtract ? Minus : Plus;
          return (
            <motion.button
              key={direction}
              type="button"
              tabIndex={-1}
              aria-label={`${subtract ? "Decrease" : "Increase"} ${label.toLowerCase()}`}
              aria-controls={id}
              aria-disabled={atLimit}
              onClick={() => {
                if (!atLimit) commit(current + direction * step);
              }}
              whileTap={atLimit ? undefined : tapPress}
              transition={spring.snappy}
              className={`${stepButtonStyles} ${subtract ? "col-start-1" : "col-start-3"} row-start-1 grid place-items-center`}
            >
              <Icon size={17} />
            </motion.button>
          );
        })}
        <label
          htmlFor={id}
          className="col-start-2 row-start-1 flex min-w-0 cursor-text items-center justify-center gap-1 border-x border-line px-1.5 focus-within:bg-accent-soft focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring"
        >
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={step}
            value={draft ?? value}
            aria-valuetext={`${draft ?? value} ${spokenUnit}`}
            aria-describedby={description ? `${id}-description` : undefined}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={() => {
              if (draft !== null) commit(current);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                commit(current + (event.key === "ArrowUp" ? step : -step));
              } else if (event.key === "Enter") {
                event.preventDefault();
                commit(current);
              } else if (event.key === "Escape" && draft !== null) {
                event.preventDefault();
                setDraft(null);
              }
            }}
            className="h-12 w-[3ch] min-w-0 appearance-none bg-transparent text-right text-base font-medium text-fg tabular-nums focus-visible:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span aria-hidden="true" className="shrink-0 text-xs text-muted">
            {suffix}
          </span>
        </label>
      </div>
    </div>
  );
}
