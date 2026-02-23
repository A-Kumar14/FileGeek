import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  Box,
  InputBase,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import {
  Search,
  Settings,
  Home,
  FileText,
  FileQuestion,
  Trash2,
  Upload,
  Keyboard,
  LogOut,
  Image,
  File,
  Layout,
  Minimize2,
  Palette,
  BookOpen,
  Brain,
  Cpu,
  Headphones,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFile } from '../contexts/FileContext';
import { useChatContext } from '../contexts/ChatContext';
import { useAuth } from '../contexts/AuthContext';
import { useThemeMode } from '../theme/ThemeContext';
import { useModelContext } from '../contexts/ModelContext';

export default function CommandPalette({ onOpenDashboard }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const fileInputRef = useRef(null);

  const navigate = useNavigate();
  const { logout } = useAuth();
  const { file, files, activeFileIndex, setActiveFileIndex, removeFile, handleFileSelect } = useFile();
  const { sendMessage, clearMessages, clearAllSessions } = useChatContext();
  const { setTheme, setLayoutMode } = useThemeMode();
  const { selectedModel, setSelectedModel } = useModelContext();
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  }, [logout, navigate]);

  const handleUploadTrigger = () => {
    setOpen(false);
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  // Get file type icon
  const getFileIcon = (fileName) => {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') return <FileText className="w-4 h-4" />;
    if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return <Image className="w-4 h-4" />;
    if (['docx', 'txt'].includes(ext)) return <File className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  const commands = useMemo(() => {
    const cmds = [
      // Upload action - Always first
      {
        id: 'upload',
        label: 'UPLOAD_NEW_FILE',
        icon: <Upload className="w-4 h-4" />,
        category: 'FILE_ACTIONS',
        action: handleUploadTrigger,
        priority: 1000,
      },

      // Navigation
      {
        id: 'settings',
        label: 'OPEN_SETTINGS',
        icon: <Settings className="w-4 h-4" />,
        category: 'NAVIGATION',
        action: () => navigate('/settings'),
        priority: 90,
      },
      {
        id: 'home',
        label: 'GO_HOME',
        icon: <Home className="w-4 h-4" />,
        category: 'NAVIGATION',
        action: () => { removeFile(); clearMessages(); navigate('/'); },
        priority: 95,
      },

      // Actions
      {
        id: 'clear-sessions',
        label: 'CLEAR_ALL_HISTORY',
        icon: <Trash2 className="w-4 h-4" />,
        category: 'ACTIONS',
        action: () => clearAllSessions(),
        priority: 80,
      },
      {
        id: 'logout',
        label: 'LOGOUT',
        icon: <LogOut className="w-4 h-4" />,
        category: 'ACTIONS',
        action: handleLogout,
        priority: 70,
      },

      // Help
      {
        id: 'shortcuts',
        label: 'KEYBOARD_SHORTCUTS',
        icon: <Keyboard className="w-4 h-4" />,
        category: 'HELP',
        action: () => setShowShortcuts(true),
        priority: 60,
      },
    ];

    // Add current file actions if file exists
    if (file) {
      cmds.push(
        {
          id: 'summarize',
          label: 'SUMMARIZE_DOCUMENT',
          icon: <FileText className="w-4 h-4" />,
          category: 'AI_ACTIONS',
          action: () => sendMessage('Summarize this document'),
          priority: 100,
        },
        {
          id: 'quiz',
          label: 'GENERATE_QUIZ',
          icon: <FileQuestion className="w-4 h-4" />,
          category: 'AI_ACTIONS',
          action: () => sendMessage('Generate a quiz from this document'),
          priority: 98,
        },
        {
          id: 'remove-file',
          label: 'REMOVE_CURRENT_FILE',
          icon: <Trash2 className="w-4 h-4" />,
          category: 'FILE_ACTIONS',
          action: () => { removeFile(); clearMessages(); },
          priority: 88,
        },
      );
    }

    // Add all files to the command palette
    if (files && files.length > 0) {
      files.forEach((f, idx) => {
        const fileName = f.fileName || f.name || 'Untitled';
        const isActive = idx === activeFileIndex;

        cmds.push({
          id: `file-${idx}`,
          label: fileName,
          icon: getFileIcon(fileName),
          category: 'YOUR_FILES',
          action: () => setActiveFileIndex(idx),
          priority: isActive ? 500 : 400, // Active file has higher priority
          isFile: true,
          isActive,
        });
      });
    }

    // ── WORKFLOWS ─────────────────────────────────────────────────────────────
    cmds.push(
      {
        id: 'podcast',
        label: 'GENERATE_PODCAST_SCRIPT',
        icon: <Headphones className="w-4 h-4" />,
        category: 'WORKFLOWS',
        action: () => sendMessage('Generate a podcast script summarizing this document.'),
        priority: 82,
      },
    );

    // ── MODEL SELECTION ────────────────────────────────────────────────────────
    const MODELS = [
      { id: 'grok-3', name: 'Grok 3', badge: 'DEFAULT' },
      { id: 'gpt-4o', name: 'GPT-4o', badge: 'OPENAI' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', badge: 'OPENAI' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', badge: 'GEMINI' },
    ];
    MODELS.forEach((m) => {
      cmds.push({
        id: `model-${m.id}`,
        label: `USE_${m.name.toUpperCase().replace(/[\s.]/g, '_')}`,
        icon: <Cpu className="w-4 h-4" />,
        category: 'MODELS',
        action: () => setSelectedModel(m.id),
        priority: 45,
        isActive: m.id === selectedModel,
      });
    });

    // ── THEMES ────────────────────────────────────────────────────────────────
    const AVAILABLE_THEMES = ['cortex', 'brutalist_dark', 'paper_white', 'cyber_amber', 'solarized'];
    AVAILABLE_THEMES.forEach((t) => {
      cmds.push({
        id: `theme-cmd-${t}`,
        label: `SWITCH_THEME_${t.toUpperCase()}`,
        icon: <Palette className="w-4 h-4" />,
        category: 'THEMES',
        action: () => setTheme(t),
        priority: 40,
      });
    });

    // ── Slash Commands ────────────────────────────────────────────────────────
    // These are always available when typed with a leading /
    cmds.push(
      {
        id: 'slash-quiz',
        label: '/quiz — Generate quiz from document',
        icon: <FileQuestion className="w-4 h-4" />,
        category: 'SLASH_COMMANDS',
        action: () => sendMessage('Generate a quiz from this document'),
        priority: 105,
        isSlash: true,
      },
      {
        id: 'slash-summarize',
        label: '/summarize — Summarize this document',
        icon: <FileText className="w-4 h-4" />,
        category: 'SLASH_COMMANDS',
        action: () => sendMessage('Summarize this document in detail'),
        priority: 103,
        isSlash: true,
      },
      {
        id: 'slash-flashcards',
        label: '/flashcards — Generate flashcards',
        icon: <Brain className="w-4 h-4" />,
        category: 'SLASH_COMMANDS',
        action: () => sendMessage('Generate flashcards from this document'),
        priority: 102,
        isSlash: true,
      },
      {
        id: 'slash-dashboard',
        label: '/dashboard — Open Document Dashboard',
        icon: <BookOpen className="w-4 h-4" />,
        category: 'SLASH_COMMANDS',
        action: () => { if (onOpenDashboard) onOpenDashboard(); else navigate('/explore'); },
        priority: 101,
        isSlash: true,
      },
      // Theme switchers
      ...[
        { id: 'cortex', label: 'Cortex' },
        { id: 'brutalist_dark', label: 'Brutalist Dark' },
        { id: 'paper_white', label: 'Paper White' },
        { id: 'cyber_amber', label: 'Cyber Amber' },
        { id: 'solarized', label: 'Solarized' },
      ].map(({ id, label }) => ({
        id: `slash-theme-${id}`,
        label: `/theme ${id} — Switch to ${label} theme`,
        icon: <Palette className="w-4 h-4" />,
        category: 'SLASH_COMMANDS',
        action: () => setTheme(id),
        priority: 98,
        isSlash: true,
      })),
      // Layout modes
      {
        id: 'slash-analyst',
        label: '/analyst — Switch to Analyst Mode (multi-pane)',
        icon: <Layout className="w-4 h-4" />,
        category: 'SLASH_COMMANDS',
        action: () => setLayoutMode('analyst'),
        priority: 97,
        isSlash: true,
      },
      {
        id: 'slash-focus',
        label: '/focus — Switch to Focus Mode (minimalist)',
        icon: <Minimize2 className="w-4 h-4" />,
        category: 'SLASH_COMMANDS',
        action: () => setLayoutMode('focus'),
        priority: 96,
        isSlash: true,
      },
    );

    return cmds;
  }, [file, files, activeFileIndex, navigate, removeFile, clearMessages, clearAllSessions, sendMessage, setActiveFileIndex, handleLogout, setTheme, setLayoutMode, onOpenDashboard, selectedModel, setSelectedModel]);

  const filtered = useMemo(() => {
    const trimmed = query.trim();

    // ── Slash command mode: query starts with '/' ─────────────────────────────
    if (trimmed.startsWith('/')) {
      const slashQuery = trimmed.toLowerCase();
      return commands
        .filter((cmd) => cmd.isSlash && cmd.label.toLowerCase().includes(slashQuery))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }

    if (!trimmed) {
      // Sort by priority when no search query
      return [...commands].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }

    const q = trimmed.toLowerCase();
    return commands
      .filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(q) ||
          cmd.category.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        // Prioritize exact matches
        const aExact = a.label.toLowerCase() === q;
        const bExact = b.label.toLowerCase() === q;
        if (aExact !== bExact) return aExact ? -1 : 1;

        // Then by priority
        return (b.priority || 0) - (a.priority || 0);
      });
  }, [commands, query]);

  useEffect(() => { setSelectedIndex(0); }, [query, open]);
  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const executeCommand = useCallback((cmd) => {
    setOpen(false);
    setQuery('');
    setTimeout(() => cmd.action(), 50);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      executeCommand(filtered[selectedIndex]);
    }
  }, [filtered, selectedIndex, executeCommand]);

  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <>
      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            mt: '12vh',
            mx: 'auto',
            bgcolor: 'var(--bg-secondary)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            boxShadow: 'var(--accent-glow)',
            overflow: 'hidden',
          },
        }}
        slotProps={{
          backdrop: {
            sx: { backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' },
          },
        }}
        TransitionProps={{ onEntered: () => inputRef.current?.focus() }}
      >
        {/* Search input */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.25,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Search className="w-4 h-4 text-mono-dim" />
          <InputBase
            inputRef={inputRef}
            placeholder="Search commands, files..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            fullWidth
            sx={{
              fontSize: '0.95rem',
              fontFamily: 'var(--font-family)',
              fontWeight: 400,
              color: 'var(--fg-primary)',
              '& input::placeholder': { color: 'var(--fg-dim)', opacity: 1 },
            }}
          />
          <Typography sx={{ fontSize: '0.65rem', color: 'var(--fg-dim)', border: '1px solid var(--border)', borderRadius: '8px', px: 0.75, py: 0.25, fontFamily: 'monospace' }}>
            {navigator.platform?.includes('Mac') ? '⌘K' : 'Ctrl+K'}
          </Typography>
        </Box>

        {/* Command list */}
        <List
          ref={listRef}
          dense
          sx={{ maxHeight: 420, overflow: 'auto', py: 0.5, px: 0.5 }}
          role="listbox"
          className="custom-scrollbar"
        >
          {filtered.length === 0 && (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography sx={{ color: '#888', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                [NO_RESULTS_FOUND]
              </Typography>
            </Box>
          )}

          {filtered.map((cmd, idx) => {
            const showCategory = idx === 0 || filtered[idx - 1].category !== cmd.category;
            return (
              <React.Fragment key={cmd.id}>
                {showCategory && (
                  <Typography
                    sx={{
                      px: 1.5,
                      pt: idx === 0 ? 0.5 : 1.5,
                      pb: 0.4,
                      display: 'block',
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      fontSize: '0.62rem',
                      color: 'var(--fg-dim)',
                    }}
                  >
                    {cmd.category.replace(/_/g, ' ')}
                  </Typography>
                )}
                <ListItemButton
                  role="option"
                  aria-selected={idx === selectedIndex}
                  selected={idx === selectedIndex}
                  onClick={() => executeCommand(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  sx={{
                    py: 0.75,
                    px: 1.5,
                    mb: 0.15,
                    borderRadius: '10px',
                    bgcolor: cmd.isActive ? 'var(--accent-dim)' : 'transparent',
                    '&.Mui-selected': {
                      bgcolor: 'var(--accent-dim)',
                      '&:hover': { bgcolor: 'var(--accent-dim)' },
                    },
                    '&:hover': { bgcolor: 'var(--accent-dim)' },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32, color: idx === selectedIndex ? 'var(--accent)' : cmd.isActive ? 'var(--accent)' : 'var(--fg-dim)' }}>
                    {cmd.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={cmd.label}
                    primaryTypographyProps={{
                      fontFamily: 'var(--font-family)',
                      fontWeight: cmd.isActive ? 600 : 400,
                      fontSize: '0.85rem',
                      color: idx === selectedIndex ? 'var(--fg-primary)' : cmd.isActive ? 'var(--accent)' : 'var(--fg-secondary)',
                      noWrap: true,
                    }}
                  />
                  {cmd.isActive && (
                    <Typography sx={{ fontSize: '0.6rem', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '8px', px: 0.75, py: 0.1, ml: 1 }}>
                      active
                    </Typography>
                  )}
                </ListItemButton>
              </React.Fragment>
            );
          })}
        </List>

        {/* Footer hints */}
        <Box sx={{ display: 'flex', gap: 2, px: 2, py: 0.75, borderTop: '1px solid var(--border)' }}>
          {[
            { key: '↑↓', label: 'Navigate' },
            { key: '↵', label: 'Select' },
            { key: 'Esc', label: 'Close' },
          ].map(({ key, label }) => (
            <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography sx={{ fontSize: '0.62rem', color: 'var(--fg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', px: 0.6, py: 0.15 }}>
                {key}
              </Typography>
              <Typography sx={{ fontSize: '0.62rem', color: 'var(--fg-dim)' }}>
                {label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Dialog>

      {/* Keyboard Shortcuts Dialog */}
      <Dialog
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { bgcolor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px' },
        }}
      >
        <Box sx={{ px: 3, py: 2 }}>
          <Typography sx={{ fontWeight: 700, mb: 2, color: 'var(--fg-primary)', fontSize: '0.95rem' }}>
            Keyboard Shortcuts
          </Typography>
          {[
            { keys: navigator.platform?.includes('Mac') ? '⌘K' : 'Ctrl+K', desc: 'Command palette' },
            { keys: 'Enter', desc: 'Send message' },
            { keys: 'Shift+Enter', desc: 'New line' },
            { keys: 'Esc', desc: 'Close dialogs' },
            { keys: '← →', desc: 'Prev / next page' },
            { keys: '+  −', desc: 'Zoom in / out' },
          ].map(({ keys, desc }) => (
            <Box key={desc} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, borderBottom: '1px solid var(--border)' }}>
              <Typography sx={{ fontSize: '0.8rem', color: 'var(--fg-secondary)' }}>{desc}</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: '8px', px: 0.75, py: 0.2 }}>
                {keys}
              </Typography>
            </Box>
          ))}
        </Box>
      </Dialog>
    </>
  );
}
