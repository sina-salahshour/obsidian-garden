import { motion } from "motion/react";
import { use, useId, useState } from "react";
import { cn } from "~/lib/cn";
import { spring } from "~/lib/motion";
import { Close } from "../ui/icons";
import { Overlay, overlayButton } from "../ui/Overlay";
import { InLink } from "./link-context";

/** "/attachments/react/fiber-tree_v2.png" -> "fiber tree v2": a name for images without alt text. */
export function nameFromSrc(src: string): string {
  const file = src.split(/[?#]/)[0]!.split("/").pop() ?? "";
  let name = file;
  try {
    name = decodeURIComponent(file);
  } catch {
    // keep the raw name
  }
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lazy image that zooms into a lightbox: the same element (shared layoutId) flies from
 * its place in the text to the centre of the screen and back. Inside a link it is a plain image
 * (a button inside a link would nest two controls). Controls are named by the alt text, else by
 * the humanised file name.
 */
export function ZoomImage({
  src,
  alt = "",
  title,
  className,
  width,
  height,
  ...rest
}: React.ComponentProps<"img">) {
  const [open, setOpen] = useState(false);
  const layoutId = `img-${useId()}`;
  const inLink = use(InLink);
  if (!src) return null;
  const name = alt || nameFromSrc(src) || "image";
  if (inLink)
    return (
      <img
        src={src}
        alt={alt}
        title={title}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className={cn("inline-block h-auto max-w-full align-middle", className)}
        {...rest}
      />
    );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Enlarge image: ${name}`}
        className="not-prose my-6 block w-full cursor-zoom-in rounded-xl"
      >
        <motion.img
          layoutId={layoutId}
          transition={spring.panel}
          src={src}
          alt={alt}
          title={title}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          className={cn(
            "mx-auto h-auto max-w-full rounded-xl border border-line bg-sunken",
            className,
          )}
          {...(rest as object)}
        />
      </button>
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        label={`Image: ${name}`}
        className="grid place-items-center p-4 sm:p-10"
      >
        <motion.img
          layoutId={layoutId}
          transition={spring.panel}
          src={src}
          alt={alt}
          onClick={() => setOpen(false)}
          className="pointer-events-auto max-h-[88dvh] max-w-full cursor-zoom-out rounded-xl object-contain shadow-[var(--shadow-lg)]"
        />
        {alt && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.15 } }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-x-4 bottom-5 text-center text-sm text-white/90 [text-shadow:0_1px_8px_rgb(0_0_0/0.5)]"
          >
            {alt}
          </motion.p>
        )}
        <div className="absolute top-4 right-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close image"
            className={overlayButton}
          >
            <Close size={18} />
          </button>
        </div>
      </Overlay>
    </>
  );
}
