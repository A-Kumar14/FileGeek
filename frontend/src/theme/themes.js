/**
 * FileGeek Theme Definitions
 * Each theme is a map of CSS custom-property names → values.
 * ThemeContext injects these on `document.documentElement`.
 */

export const THEMES = {
    cortex: {
        '--bg-primary':        '#FFF9F5',
        '--bg-secondary':      '#FFFFFF',
        '--bg-tertiary':       '#FFF0E6',
        '--bg-hover':          '#FFE4CC',
        '--fg-primary':        '#1C0A00',
        '--fg-secondary':      '#6B3A2A',
        '--fg-dim':            '#A07060',
        '--accent':            '#F97316',
        '--accent-secondary':  '#FBBF24',
        '--accent-dim':        'rgba(249,115,22,0.08)',
        '--accent-glow':       '0 8px 32px rgba(249,115,22,0.22)',
        '--border':            'rgba(249,115,22,0.15)',
        '--border-focus':      '#F97316',
        '--error':             '#DC2626',
        '--warning':           '#D97706',
        '--success':           '#059669',
        '--shadow':            '0 4px 24px rgba(249,115,22,0.10)',
        '--radius':            '12px',
    },
    brutalist_dark: {
        '--bg-primary': '#000000',     // Brutalist Black
        '--bg-secondary': '#0D0D0D',   // Carbon Base
        '--bg-tertiary': '#111111',
        '--bg-hover': '#1A1A1A',
        '--fg-primary': '#E5E5E5',     // Terminal White
        '--fg-secondary': '#888888',   // Dim Gray
        '--fg-dim': '#666666',
        '--accent': '#00FF00',         // Geek Green
        '--accent-dim': 'rgba(0,255,0,0.15)',
        '--accent-glow': '0 0 12px rgba(0,255,0,0.4)',
        '--border': '#333333',         // Steel Gray
        '--border-focus': '#00FF00',
        '--error': '#FF4444',
        '--warning': '#FFAA00',
        '--success': '#00FF00',
        '--shadow': 'none',
    },
    paper_white: {
        '--bg-primary': '#F8F9FA',
        '--bg-secondary': '#FFFFFF',
        '--bg-tertiary': '#F0F2F5',
        '--bg-hover': '#E8EAED',
        '--fg-primary': '#1A1A2E',
        '--fg-secondary': '#4A4A6A',
        '--fg-dim': '#9A9AB0',
        '--accent': '#0070F3',
        '--accent-dim': 'rgba(0,112,243,0.1)',
        '--accent-glow': '0 0 12px rgba(0,112,243,0.3)',
        '--border': '#E2E8F0',
        '--border-focus': '#CBD5E1',
        '--error': '#DC2626',
        '--warning': '#D97706',
        '--success': '#059669',
        '--shadow': '0 4px 24px rgba(0,0,0,0.08)',
    },
    cyber_amber: {
        '--bg-primary': '#000000',
        '--bg-secondary': '#050505',
        '--bg-tertiary': '#0A0A0A',
        '--bg-hover': '#0D0D0D',
        '--fg-primary': '#FFBF00',
        '--fg-secondary': '#CC9900',
        '--fg-dim': '#664C00',
        '--accent': '#FFD700',
        '--accent-dim': 'rgba(255,191,0,0.1)',
        '--accent-glow': '0 0 20px rgba(255,191,0,0.6), 0 0 40px rgba(255,191,0,0.2)',
        '--border': '#332600',
        '--border-focus': '#FFBF00',
        '--error': '#FF0000',
        '--warning': '#FF4500',
        '--success': '#39FF14',
        '--shadow': '0 4px 24px rgba(255,191,0,0.15)',
    },
    solarized: {
        '--bg-primary': '#F4ECD8',
        '--bg-secondary': '#EDE0C4',
        '--bg-tertiary': '#E8D9B7',
        '--bg-hover': '#DDD0AA',
        '--fg-primary': '#2C1810',
        '--fg-secondary': '#5C3D2E',
        '--fg-dim': '#A08060',
        '--accent': '#8B4513',
        '--accent-dim': 'rgba(139,69,19,0.1)',
        '--accent-glow': '0 0 12px rgba(139,69,19,0.3)',
        '--border': '#C4A882',
        '--border-focus': '#A08060',
        '--error': '#C0392B',
        '--warning': '#D35400',
        '--success': '#27AE60',
        '--shadow': '0 4px 24px rgba(0,0,0,0.15)',
    },
};

export const FONTS = {
    inter_sans: { '--font-family': "'Inter', system-ui, sans-serif", '--font-mono': "'JetBrains Mono', 'Courier New', monospace" },
    jetbrains_mono: { '--font-family': "'JetBrains Mono', 'Courier New', monospace", '--font-mono': "'JetBrains Mono', 'Courier New', monospace" },
    open_dyslexic: { '--font-family': "'OpenDyslexic', 'Comic Sans MS', sans-serif", '--font-mono': "'OpenDyslexic Mono', 'Courier New', monospace" },
};

export const DENSITY = {
    compact: { '--spacing-unit': '4px', '--radius': '0px', '--line-height': '1.4' },
    spacious: { '--spacing-unit': '8px', '--radius': '0px', '--line-height': '1.6' },
};

export const THEME_NAMES = ['cortex', 'brutalist_dark', 'paper_white', 'cyber_amber', 'solarized'];
export const FONT_NAMES = ['jetbrains_mono', 'inter_sans', 'open_dyslexic'];
export const DENSITY_NAMES = ['compact', 'spacious'];
