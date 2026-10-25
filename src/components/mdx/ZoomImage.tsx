import { motion } from "motion/react";
import { useId, useState } from "react";
import { cn } from "~/lib/cn";
import { spring } from "~/lib/motion";
import { Close } from "../ui/icons";
import { Overlay, overlayButton } from "../ui/Overlay";

/**
 * Lazy image that zooms into a lightbox: the same element (shared layoutId) flies from
 * its place in the text to the centre of the screen and back.
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
  if (!src) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={alt ? `Enlarge image: ${alt}` : "Enlarge image"}
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
        label={alt || "Image"}
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
