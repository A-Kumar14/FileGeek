import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import ForceGraph2D from 'react-force-graph-2d';

// Node color by type
const NODE_COLOR = {
    query:   '#F97316', // accent orange — center
    topic:   '#7C3AED', // purple — section headers
    concept: '#0EA5E9', // sky blue — bold terms
    source:  '#059669', // green — web sources
};

const NODE_RADIUS = {
    query:   10,
    topic:   7,
    concept: 5,
    source:  6,
};

const LEGEND = [
    { type: 'query',   label: 'Query' },
    { type: 'topic',   label: 'Topic' },
    { type: 'concept', label: 'Concept' },
    { type: 'source',  label: 'Source' },
];

export default function KnowledgeGraph({ nodes = [], links = [], onNodeClick }) {
    const containerRef = useRef(null);
    const graphRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 680, height: 420 });
    const [hovered, setHovered] = useState(null);

    // Measure container
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            setDimensions({ width: width || 680, height: height || 420 });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Center graph on first render
    useEffect(() => {
        if (graphRef.current && nodes.length > 0) {
            setTimeout(() => {
                graphRef.current.zoomToFit(400, 40);
            }, 300);
        }
    }, [nodes]);

    const handleNodeClick = useCallback((node) => {
        if (node.url) {
            window.open(node.url, '_blank', 'noopener');
            return;
        }
        // Dispatch to GlobalCommandBar
        const text = `Tell me more about "${node.name}"`;
        window.dispatchEvent(new CustomEvent('fg:set-input', { detail: { text } }));
        if (onNodeClick) onNodeClick(node);
    }, [onNodeClick]);

    const drawNode = useCallback((node, ctx, globalScale) => {
        const r = NODE_RADIUS[node.type] || 5;
        const color = NODE_COLOR[node.type] || '#888';

        // Glow for hovered
        if (hovered?.id === node.id) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
            ctx.fillStyle = color + '33';
            ctx.fill();
        }

        // Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        // Label (only if zoomed in enough or it's the query node)
        const fontSize = Math.min(12 / globalScale, 5);
        if (globalScale > 0.5 || node.type === 'query') {
            ctx.font = `600 ${fontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#111827';
            const label = node.name.length > 20 ? node.name.slice(0, 18) + '…' : node.name;
            ctx.fillText(label, node.x, node.y + r + fontSize * 1.2);
        }
    }, [hovered]);

    if (nodes.length === 0) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, border: '1px solid var(--border)', borderRadius: '12px', bgcolor: 'var(--bg-secondary)' }}>
                <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.8rem', color: 'var(--fg-dim)' }}>
                    Graph will appear once the answer loads
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Legend */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', px: 0.5 }}>
                {LEGEND.map(({ type, label }) => (
                    <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: NODE_COLOR[type], flexShrink: 0 }} />
                        <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.65rem', color: 'var(--fg-secondary)' }}>
                            {label}
                        </Typography>
                    </Box>
                ))}
                <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.65rem', color: 'var(--fg-dim)', ml: 'auto' }}>
                    Click a node to explore · Scroll to zoom
                </Typography>
            </Box>

            {/* Graph canvas */}
            <Box
                ref={containerRef}
                sx={{
                    width: '100%',
                    height: 420,
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    bgcolor: 'var(--bg-secondary)',
                    cursor: 'grab',
                    '&:active': { cursor: 'grabbing' },
                }}
            >
                <ForceGraph2D
                    ref={graphRef}
                    graphData={{ nodes, links }}
                    width={dimensions.width}
                    height={dimensions.height}
                    backgroundColor="transparent"
                    nodeCanvasObject={drawNode}
                    nodeCanvasObjectMode={() => 'replace'}
                    nodeVal={(node) => (NODE_RADIUS[node.type] || 5) * 2}
                    linkColor={() => 'rgba(0,0,0,0.12)'}
                    linkWidth={1}
                    linkDirectionalParticles={1}
                    linkDirectionalParticleWidth={1.5}
                    linkDirectionalParticleColor={() => 'rgba(249,115,22,0.6)'}
                    onNodeClick={handleNodeClick}
                    onNodeHover={(node) => setHovered(node || null)}
                    cooldownTicks={80}
                    d3AlphaDecay={0.03}
                    d3VelocityDecay={0.3}
                    enableZoomInteraction
                    enablePanInteraction
                />
            </Box>
        </Box>
    );
}
