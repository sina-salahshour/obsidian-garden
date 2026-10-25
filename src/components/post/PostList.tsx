import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { PostMeta } from "~/content/types";
import { cn } from "~/lib/cn";
import { spring } from "~/lib/motion";
import { PostCard, type PostCardProps } from "./PostCard";

/**
 * Animated list: when filters change, surviving cards glide to their new slots
 * (layout), leaving cards fade out without blocking, new ones rise in with a stagger
 * (CSS `.enter` on mount, so the first paint and no-JS readers are never hidden).
 */
export function PostList({
  posts,
  className,
  cardProps,
  seriesTitles,
}: {
  posts: PostMeta[];
  className?: string;
  cardProps?: Omit<PostCardProps, "post">;
  /** folder -> display title */
  seriesTitles?: Record<string, string>;
}) {
  return (
    <LayoutGroup>
      <ul className={cn("grid gap-4", className)}>
        <AnimatePresence mode="popLayout" initial={false}>
          {posts.map((post, i) => (
            <motion.li
              key={post.slug}
              layout="position"
              initial={false}
              exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
              transition={{ layout: spring.layout }}
              className="enter"
              style={{ "--i": i } as React.CSSProperties}
            >
              <PostCard
                post={post}
                seriesTitle={post.folder ? seriesTitles?.[post.folder] : undefined}
                {...cardProps}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </LayoutGroup>
  );
}
