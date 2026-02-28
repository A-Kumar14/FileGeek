import React, { useState, useEffect } from 'react';
import { Box, Dialog, DialogContent, Typography, useMediaQuery, useTheme, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChatPanel from '../components/ChatPanel';
import CommandPalette from '../components/CommandPalette';
import SettingsContent from './SettingsContent';
import ArtifactPanel from '../components/ArtifactPanel';
import GlobalCommandBar from '../components/GlobalCommandBar';
import LeftDrawer from '../components/LeftDrawer';
import ErrorBoundary from '../components/ErrorBoundary';
import OnboardingModal from '../components/OnboardingModal';
import { useChatContext } from '../contexts/ChatContext';


export default function MainLayout() {
  const { artifacts, chatSessions } = useChatContext();

  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    return !localStorage.getItem('filegeek-onboarded');
  });

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // '?' key opens shortcuts cheat-sheet
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        setShortcutsOpen(open => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const hasArtifacts = artifacts && artifacts.length > 0;

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      background: 'var(--bg-primary)',
      color: 'var(--fg-primary)',
      overflow: 'hidden',
    }}>
      {isMobile ? (
        /* ── MOBILE LAYOUT ── */
        <>
          <Box sx={{
            display: 'flex', alignItems: 'center', px: 1.5,
            height: 48, borderBottom: '1px solid var(--border)',
            bgcolor: 'var(--bg-secondary)', gap: 1, flexShrink: 0,
          }}>
            <IconButton size="small" onClick={() => setMobileDrawerOpen(true)}
              sx={{ color: 'var(--fg-secondary)' }}>
              <MenuIcon sx={{ fontSize: 20 }} />
            </IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{
                width: 20, height: 20, borderRadius: '6px',
                bgcolor: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Typography sx={{ fontSize: '11px', color: '#FFF', fontWeight: 700, lineHeight: 1 }}>+</Typography>
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--fg-primary)' }}>
                FileGeek
              </Typography>
            </Box>
          </Box>

          <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <Box sx={{
              display: 'flex',
              flexDirection: 'column', flex: 1, minHeight: 0, bgcolor: 'var(--bg-primary)',
            }}>
              <ErrorBoundary><ChatPanel /></ErrorBoundary>
            </Box>
          </Box>

          <ErrorBoundary>
            <LeftDrawer
              open={mobileDrawerOpen}
              onClose={() => setMobileDrawerOpen(false)}
              onOpenSettings={() => { setMobileDrawerOpen(false); setSettingsOpen(true); }}
            />
          </ErrorBoundary>
        </>
      ) : (
        /* ── DESKTOP: 2-column (sidebar + main) ── */
        <Box sx={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: sidebarCollapsed ? '60px 1fr' : '260px 1fr',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          transition: 'grid-template-columns 0.22s ease',
        }}>
          {/* Left — Sidebar */}
          <Box sx={{
            borderRight: '1px solid var(--border)',
            height: '100%', overflow: 'hidden',
            bgcolor: 'var(--bg-secondary)',
          }}>
            <ErrorBoundary>
              <LeftDrawer
                embedded
                collapsed={sidebarCollapsed}
                onCollapse={() => setSidebarCollapsed(v => !v)}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </ErrorBoundary>
          </Box>

          {/* Right — Main content */}
          <Box sx={{
            display: 'flex',
            flexDirection: 'row',
            height: '100%',
            overflow: 'hidden',
          }}>
            {/* Chat panel + artifacts — always full width */}
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
                overflow: 'hidden',
                bgcolor: 'var(--bg-primary)',
                flex: 1,
              }}>
                <Box
                  id="main-content"
                  role="main"
                  aria-label="Chat"
                  sx={{
                    flex: hasArtifacts ? '0 0 60%' : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    minHeight: 0,
                    borderBottom: hasArtifacts ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <ErrorBoundary><ChatPanel /></ErrorBoundary>
                </Box>
                {hasArtifacts && (
                  <Box
                    role="complementary"
                    aria-label="Artifacts panel"
                    sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                  >
                    <ErrorBoundary><ArtifactPanel /></ErrorBoundary>
                  </Box>
                )}
              </Box>
          </Box>
        </Box>
      )}

      {/* Global floating command bar */}
      <GlobalCommandBar sidebarOffset={isMobile ? 0 : (sidebarCollapsed ? 60 : 260)} />

      {/* Command Palette (⌘K) */}
      <CommandPalette />

      {/* Settings Dialog */}
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'var(--bg-secondary)',
            color: 'var(--fg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
          },
        }}
      >
        <DialogContent>
          <SettingsContent />
        </DialogContent>
      </Dialog>

      {/* Shortcuts cheat-sheet */}
      <Dialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { bgcolor: 'var(--bg-secondary)', color: 'var(--fg-primary)', border: '1px solid var(--border)', borderRadius: '16px' } }}
      >
        <DialogContent sx={{ p: 2.5 }}>
          <Typography sx={{ fontSize: '0.65rem', color: 'var(--fg-dim)', mb: 2, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Keyboard Shortcuts
          </Typography>
          {[
            ['⌘K', 'Open Command Palette'],
            ['?', 'Toggle this cheat-sheet'],
            ['Esc', 'Close dialogs / palette'],
            ['Enter', 'Send message'],
          ].map(([key, desc]) => (
            <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75, borderBottom: '1px solid var(--border)' }}>
              <Typography sx={{ fontSize: '0.8rem', color: 'var(--fg-primary)' }}>{desc}</Typography>
              <Box sx={{ border: '1px solid var(--border)', px: 1, py: 0.25, fontSize: '0.65rem', color: 'var(--accent)', borderRadius: '6px', fontWeight: 600 }}>{key}</Box>
            </Box>
          ))}
        </DialogContent>
      </Dialog>

      {/* Onboarding — shown once to new users with no sessions */}
      <OnboardingModal
        open={onboardingOpen && (!chatSessions || chatSessions.length === 0)}
        onClose={() => setOnboardingOpen(false)}
      />
    </Box>
  );
}
