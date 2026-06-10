"use client";

import { useState, useEffect, useRef } from "react";

interface SimEdge {
    source: string;
    target: string;
    idealLength?: number;
    strength?: number;
}

type Positioned<T> = T & { x: number; y: number; vx: number; vy: number };

export function useSpringSimulation<TNode extends { id: string }>(
    nodes: TNode[],
    edges: SimEdge[],
    options: {
        width?: number;
        height?: number;
        repulsion?: number;
        idealLength?: number;
        paddingX?: number;
        paddingY?: number;
        maxSteps?: number;
        instant?: boolean;
    } = {}
): Positioned<TNode>[] {
    const {
        width = 600,
        height = 400,
        repulsion = 800,
        idealLength = 120,
        paddingX = 40,
        paddingY = 20,
        maxSteps = 150,
        instant = false,
    } = options;

    const [positions, setPositions] = useState<Positioned<TNode>[]>([]);
    const animRef = useRef<number | null>(null);

    useEffect(() => {
        if (nodes.length === 0) { setPositions([]); return; }

        const sim: Positioned<TNode>[] = nodes.map((n, i) => {
            const angle = (2 * Math.PI * i) / nodes.length;
            const r = Math.min(width, height) * 0.35;
            return { ...n, x: width / 2 + r * Math.cos(angle), y: height / 2 + r * Math.sin(angle), vx: 0, vy: 0 };
        });

        let step = 0;

        function runStep() {
            step++;
            const alpha = 1 - step / maxSteps;

            for (let i = 0; i < sim.length; i++) {
                for (let j = i + 1; j < sim.length; j++) {
                    const dx = sim[j].x - sim[i].x;
                    const dy = sim[j].y - sim[i].y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const f = (repulsion / (dist * dist)) * alpha;
                    sim[i].vx -= (dx / dist) * f;
                    sim[i].vy -= (dy / dist) * f;
                    sim[j].vx += (dx / dist) * f;
                    sim[j].vy += (dy / dist) * f;
                }
            }

            for (const edge of edges) {
                const src = sim.find((n) => n.id === edge.source);
                const tgt = sim.find((n) => n.id === edge.target);
                if (!src || !tgt) continue;
                const dx = tgt.x - src.x;
                const dy = tgt.y - src.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const f = ((dist - (edge.idealLength ?? idealLength)) / dist) * (edge.strength ?? 0.3) * alpha;
                src.vx += dx * f; src.vy += dy * f;
                tgt.vx -= dx * f; tgt.vy -= dy * f;
            }

            for (const n of sim) {
                n.vx += (width / 2 - n.x) * 0.01 * alpha;
                n.vy += (height / 2 - n.y) * 0.01 * alpha;
                n.vx *= 0.8;
                n.vy *= 0.8;
                n.x = Math.max(paddingX, Math.min(width - paddingX, n.x + n.vx));
                n.y = Math.max(paddingY, Math.min(height - paddingY, n.y + n.vy));
            }
        }

        if (instant) {
            while (step < maxSteps) runStep();
            setPositions([...sim]);
            return;
        }

        function tick() {
            if (step >= maxSteps) { setPositions([...sim]); return; }
            runStep();
            setPositions([...sim]);
            animRef.current = requestAnimationFrame(tick);
        }

        if (animRef.current) cancelAnimationFrame(animRef.current);
        animRef.current = requestAnimationFrame(tick);
        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, edges]);

    return positions;
}
