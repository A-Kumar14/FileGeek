import React, { useState, useEffect } from 'react';
import { Box, Tab, Tabs, Dialog, DialogContent, Typography, useMediaQuery, useTheme, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChatPanel from '../components/ChatPanel';
import FileViewer from '../components/FileViewer';
import CommandPalette from '../components/CommandPalette';
import SettingsContent from './SettingsContent';
import ArtifactPanel from '../components/ArtifactPanel';
import GlobalCommandBar from '../components/GlobalCommandBar';
import LeftDrawer from '../components/LeftDrawer';
import { useFile } from '../contexts/FileContext';
import { useChatContext } from '../contexts/ChatContext';


export default function MainLayout() {
  const { file, fileType, removeFile, targetPage, reportPageChange } = useFile();
  const { clearMessages, artifacts, messages } = useChatContext();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [mobileTab, setMobileTab] = useState(0);
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

  const handleRemoveFile = () => {
    removeFile();
    clearMessages();
  };

  const hasArtifacts = artifacts && artifacts.length > 0;
  const hasMessages = messages && messages.length > 0;
  // Show chat column only when there are messages (or when no file is loaded)
  const showChatColumn = !file || hasMessages;

  // File viewer panel header + content
  const fileViewerContent = (
    <>
      {/* File header bar — filename + Remove button */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.5,
        px: 1.5, py: 0.65,
        borderBottom: '1px solid var(--border)',
        bgcolor: 'var(--bg-secondary)',
        flexShrink: 0, minWidth: 0,
      }}>
        <Typography noWrap sx={{ flex: 1, fontSize: '0.8rem', fontWeight: 500, color: 'var(--fg-secondary)', fontFamily: 'var(--font-family)' }}>
          {file?.name || 'Document'}
        </Typography>
        <Box
          onClick={handleRemoveFile}
          sx={{
            cursor: 'pointer', flexShrink: 0,
            border: '1px solid var(--border)',
            px: 1.25, py: 0.35, borderRadius: '8px',
            fontSize: '0.7rem', fontWeight: 600,
            color: 'var(--fg-secondary)', whiteSpace: 'nowrap',
            '&:hover': { borderColor: 'var(--error)', color: 'var(--error)' },
          }}
        >
          Remove file
        </Box>
      </Box>
      <FileViewer file={file} fileType={fileType} targetPage={targetPage} onPageChange={reportPageChange} />
    </>
  );

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
            {file && (
              <Typography noWrap sx={{ fontSize: '0.75rem', color: 'var(--fg-dim)', ml: 0.5, flex: 1 }}>
                {file.name}
              </Typography>
            )}
          </Box>

          {file && (
            <Tabs
              value={mobileTab}
              onChange={(_, v) => setMobileTab(v)}
              centered
              sx={{
                minHeight: 36, borderBottom: '1px solid var(--border)',
                '& .MuiTab-root': {
                  minHeight: 36, py: 0.5, fontSize: '0.82rem',
                  fontFamily: 'var(--font-family)', textTransform: 'none',
                  color: 'var(--fg-secondary)', '&.Mui-selected': { color: 'var(--accent)' },
                },
                '& .MuiTabs-indicator': { backgroundColor: 'var(--accent)' },
              }}
            >
              <Tab label="Document" />
              <Tab label="Chat" />
            </Tabs>
          )}

          <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {file && (
              <Box sx={{
                display: mobileTab !== 0 ? 'none' : 'flex',
                flexDirection: 'column', position: 'relative',
                flex: 1, minHeight: 0, bgcolor: 'var(--bg-primary)',
              }}>
                {fileViewerContent}
              </Box>
            )}
            <Box sx={{
              display: file && mobileTab !== 1 ? 'none' : 'flex',
              flexDirection: 'column', flex: 1, minHeight: 0, bgcolor: 'var(--bg-primary)',
            }}>
              <ChatPanel />
            </Box>
          </Box>

          <LeftDrawer
            open={mobileDrawerOpen}
            onClose={() => setMobileDrawerOpen(false)}
            onOpenSettings={() => { setMobileDrawerOpen(false); setSettingsOpen(true); }}
          />
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
            <LeftDrawer
              embedded
              collapsed={sidebarCollapsed}
              onCollapse={() => setSidebarCollapsed(v => !v)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </Box>

          {/* Right — Main content */}
          <Box sx={{
            display: 'flex',
            flexDirection: 'row',
            height: '100%',
            overflow: 'hidden',
          }}>
            {/* File viewer — full width until first message, then fixed 460px right column appears */}
            {file && (
              <Box
                role="region"
                aria-label="Document viewer"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  overflow: 'hidden',
                  borderRight: showChatColumn ? '1px solid var(--border)' : 'none',
                  bgcolor: 'var(--bg-primary)',
                  transition: 'border 0.2s ease',
                }}
              >
                {fileViewerContent}
              </Box>
            )}

            {/* Chat panel + artifacts — only visible after first message (or no file) */}
            {showChatColumn && (
              <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
                overflow: 'hidden',
                bgcolor: 'var(--bg-primary)',
                width: file ? 460 : '100%',
                flex: file ? '0 0 460px' : 1,
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
                  <ChatPanel />
                </Box>
                {hasArtifacts && (
                  <Box
                    role="complementary"
                    aria-label="Artifacts panel"
                    sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                  >
                    <ArtifactPanel />
                  </Box>
                )}
              </Box>
            )}
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
    </Box>
  );
}
