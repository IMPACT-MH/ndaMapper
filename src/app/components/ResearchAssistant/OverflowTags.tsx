"use client";

import { useState, useLayoutEffect, useRef } from "react";

export function OverflowTags({ items, itemClassName }: { items: string[]; itemClassName: string }) {
    const rowRef = useRef<HTMLDivElement>(null);
    const [cutoff, setCutoff] = useState<number | null>(null);
    const [expanded, setExpanded] = useState(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => {
        const el = rowRef.current;
        if (!el || el.children.length === 0) return;
        const firstTop = (el.children[0] as HTMLElement).offsetTop;
        let count = 0;
        for (const child of Array.from(el.children)) {
            if ((child as HTMLElement).offsetTop !== firstTop) break;
            count++;
        }
        if (count < items.length) setCutoff(count);
    }, []); // measure once on mount with all items visible

    const shown = !expanded && cutoff !== null ? items.slice(0, cutoff) : items;
    const hidden = items.length - shown.length;

    return (
        <div ref={rowRef} className="flex flex-wrap gap-1">
            {shown.map((item) => (
                <span key={item} className={itemClassName}>{item}</span>
            ))}
            {hidden > 0 && (
                <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(true); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(true); } }}
                    className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer underline decoration-dotted"
                >
                    +{hidden} more
                </span>
            )}
        </div>
    );
}
