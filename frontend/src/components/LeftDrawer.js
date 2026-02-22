import React, { useState, useMemo } from 'react';
import {
  Box, Drawer, Typography, IconButton, Tooltip,
  List, ListItemButton, ListItemIcon, ListItemText, Divider, InputBase,
} from '@mui/material';
import ExploreIcon from '@mui/icons-material/Explore';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import FolderIcon from '@mui/icons-material/Folder';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';

import { useAuth } from '../contexts/AuthContext';
import { useFile } from '../contexts/FileContext';
import { useChatContext } from '../contexts/ChatContext';
import { useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { key: 'explore', label: 'Explore', icon: ExploreIcon },
  { key: 'library', label: 'Library', icon: LibraryBooksIcon },
  { key: 'files', label: 'Files', icon: FolderIcon },
  { key: 'history', label: 'History', icon: HistoryIcon },
];

function groupByDate(sessions) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000);

  const groups = { Today: [], Yesterday: [], 'Past 7 days': [], Older: [] };
  (sessions || []).forEach((s) => {
    const d = new Date(s.updated_at || s.created_at || 0);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day >= startOfToday) groups['Today'].push(s);
    else if (day >= startOfYesterday) groups['Yesterday'].push(s);
    else if (day >= startOfWeek) groups['Past 7 days'].push(s);
    else groups['Older'].push(s);
  });
  return groups;
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Past 7 days', 'Older'];

function SidebarContent({ onClose, collapsed, onCollapse, onOpenSettings }) {
  const { logout, user } = useAuth();
  const { removeFile } = useFile();
  const { clearMessages, chatSessions, activeSessionId, loadSession } = useChatContext();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const initials = user?.name
    ? user.name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || '?';

  const handleNewChat = () => {
    clearMessages();
    removeFile();
    if (onClose) onClose();
  };

  const handleLogout = async () => {
    try { await logout(); } catch { }
    navigate('/login');
  };

  const handleSessionClick = (sessionId) => {
    if (loadSession) loadSession(sessionId);
    if (onClose) onClose();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? (chatSessions || []).filter((s) => (s.title || '').toLowerCase().includes(q))
      : chatSessions || [];
    return list.slice(0, 60);
  }, [chatSessions, search]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const NavItem = ({ item }) => {
    const Icon = item.icon;
    const btn = (
      <ListItemButton sx={{
        borderRadius: '10px', mx: 0.75, mb: 0.25, minHeight: 38,
        px: collapsed ? 1.25 : 1.5,
        justifyContent: collapsed ? 'center' : 'flex-start',
        '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
      }}>
        <ListItemIcon sx={{ minWidth: collapsed ? 'unset' : 32, color: 'var(--fg-secondary)' }}>
          <Icon sx={{ fontSize: 18 }} />
        </ListItemIcon>
        {!collapsed && (
          <ListItemText
            primary={item.label}
            primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--fg-primary)' }}
          />
        )}
      </ListItemButton>
    );
    return collapsed ? <Tooltip title={item.label} placement="right">{btn}</Tooltip> : btn;
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'var(--bg-secondary)', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <Box sx={{
        display: 'flex', alignItems: 'center',
        px: collapsed ? 1 : 1.5, py: 1.25,
        justifyContent: collapsed ? 'center' : 'space-between',
        flexShrink: 0,
      }}>
        {!collapsed && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{
              width: 26, height: 26, borderRadius: '7px', flexShrink: 0,
              bgcolor: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--shadow)',
            }}>
              <AddIcon sx={{ fontSize: 15, color: '#FFF' }} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>
              FileGeek
            </Typography>
          </Box>
        )}
        {onCollapse && (
          <Tooltip title={collapsed ? 'Expand' : 'Collapse'} placement="right">
            <IconButton
              size="small"
              onClick={onCollapse}
              sx={{
                color: 'var(--fg-dim)', borderRadius: '7px',
                border: '1px solid var(--border)', width: 26, height: 26,
                '&:hover': { color: 'var(--fg-primary)', bgcolor: 'rgba(0,0,0,0.05)' },
              }}
            >
              <ViewSidebarOutlinedIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* ── New Chat — black button like Cortex ── */}
      <Box sx={{ px: collapsed ? 0.75 : 1.25, pt: 0, pb: 0.75, flexShrink: 0 }}>
        <Tooltip title={collapsed ? 'New chat' : ''} placement="right">
          <Box
            onClick={handleNewChat}
            sx={{
              display: 'flex', alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 0.75,
              background: '#000',
              color: '#FFF',
              borderRadius: '10px',
              px: collapsed ? 1 : 1.5, py: 0.85,
              cursor: 'pointer',
              transition: 'background 0.15s',
              '&:hover': { background: '#222' },
            }}
          >
            <AddIcon sx={{ fontSize: 16 }} />
            {!collapsed && <Typography sx={{ fontSize: '0.83rem', fontWeight: 600 }}>New chat</Typography>}
          </Box>
        </Tooltip>
      </Box>

      {/* ── Search bar ── */}
      {!collapsed && (
        <Box sx={{ px: 1.25, pb: 0.5, flexShrink: 0 }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.75,
            border: '1px solid var(--border)', borderRadius: '10px',
            px: 1.25, py: 0.55, bgcolor: 'var(--bg-primary)',
            '&:focus-within': { borderColor: 'var(--border-focus)' },
            transition: 'border-color 0.15s',
          }}>
            <SearchIcon sx={{ fontSize: 14, color: 'var(--fg-dim)', flexShrink: 0 }} />
            <InputBase
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{
                flex: 1, fontSize: '0.82rem', color: 'var(--fg-primary)',
                '& input::placeholder': { color: 'var(--fg-dim)', opacity: 1 },
              }}
            />
            <Box sx={{
              fontSize: '0.58rem', fontWeight: 700, color: 'var(--fg-dim)',
              border: '1px solid var(--border)', borderRadius: '5px',
              px: 0.5, py: 0.1, flexShrink: 0, lineHeight: 1.4,
            }}>
              ⌘
            </Box>
          </Box>
        </Box>
      )}

      {/* ── Navigation ── */}
      <List dense disablePadding sx={{ flexShrink: 0, mt: 0.25 }}>
        {NAV_ITEMS.map((item) => <NavItem key={item.key} item={item} />)}
      </List>

      <Divider sx={{ mx: 1.5, my: 0.75, borderColor: 'var(--border)' }} />

      {/* ── Date-grouped chat history ── */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
        {GROUP_ORDER.map((label) => {
          const items = grouped[label];
          if (!items || items.length === 0) return null;
          return (
            <Box key={label}>
              {!collapsed && (
                <Typography sx={{
                  px: 2, pt: 1.25, pb: 0.35,
                  fontSize: '0.65rem', fontWeight: 600,
                  color: 'var(--fg-dim)', letterSpacing: '0.01em',
                }}>
                  {label}
                </Typography>
              )}
              {items.slice(0, 25).map((session) => {
                const isActive = session.id === activeSessionId;
                const title = session.title || 'Untitled chat';
                const btn = (
                  <ListItemButton
                    key={session.id}
                    onClick={() => handleSessionClick(session.id)}
                    sx={{
                      borderRadius: '10px', mx: 0.75, mb: 0.1,
                      minHeight: 32,
                      px: collapsed ? 1.25 : 1.5,
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      bgcolor: isActive ? 'rgba(0,0,0,0.06)' : 'transparent',
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
                      transition: 'background 0.12s',
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: collapsed ? 'unset' : 26, color: 'var(--fg-dim)' }}>
                      <ChatBubbleOutlineIcon sx={{ fontSize: 13 }} />
                    </ListItemIcon>
                    {!collapsed && (
                      <ListItemText
                        primary={title}
                        primaryTypographyProps={{
                          fontSize: '0.8rem',
                          fontWeight: isActive ? 500 : 400,
                          color: isActive ? 'var(--fg-primary)' : 'var(--fg-secondary)',
                          noWrap: true,
                        }}
                      />
                    )}
                  </ListItemButton>
                );
                return collapsed
                  ? <Tooltip key={session.id} title={title} placement="right">{btn}</Tooltip>
                  : btn;
              })}
            </Box>
          );
        })}

        {filtered.length === 0 && !collapsed && (
          <Typography sx={{ px: 2, py: 1.5, fontSize: '0.78rem', color: 'var(--fg-dim)' }}>
            {search ? 'No results' : 'No chats yet'}
          </Typography>
        )}
      </Box>

      <Divider sx={{ mx: 1.5, my: 0.5, borderColor: 'var(--border)' }} />

      {/* ── Footer ── */}
      <Box sx={{ flexShrink: 0, pb: 0.75 }}>
        <Tooltip title={collapsed ? 'Settings' : ''} placement="right">
          <ListItemButton
            onClick={onOpenSettings}
            sx={{
              borderRadius: '10px', mx: 0.75, mb: 0.25, minHeight: 36,
              px: collapsed ? 1.25 : 1.5,
              justifyContent: collapsed ? 'center' : 'flex-start',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
            }}
          >
            <ListItemIcon sx={{ minWidth: collapsed ? 'unset' : 32, color: 'var(--fg-secondary)' }}>
              <SettingsIcon sx={{ fontSize: 17 }} />
            </ListItemIcon>
            {!collapsed && (
              <ListItemText
                primary="Settings"
                primaryTypographyProps={{ fontSize: '0.83rem', color: 'var(--fg-primary)', fontWeight: 500 }}
              />
            )}
          </ListItemButton>
        </Tooltip>

        <Divider sx={{ mx: 1.5, my: 0.5, borderColor: 'var(--border)' }} />

        {/* Account row */}
        <Box sx={{
          display: 'flex', alignItems: 'center',
          px: collapsed ? 1 : 1.5, py: 0.75,
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 1,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Box sx={{
              width: 30, height: 30, borderRadius: '50%',
              bgcolor: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#FFF' }}>
                {initials}
              </Typography>
            </Box>
            {!collapsed && (
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg-primary)', lineHeight: 1.2 }}>
                  {user?.name || 'Account'}
                </Typography>
                {user?.email && (
                  <Typography noWrap sx={{ fontSize: '0.68rem', color: 'var(--fg-dim)', lineHeight: 1.2 }}>
                    {user.email}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
          {!collapsed && (
            <Tooltip title="Sign out">
              <IconButton
                size="small"
                onClick={handleLogout}
                sx={{ color: 'var(--fg-dim)', flexShrink: 0, '&:hover': { color: 'var(--error)', bgcolor: 'rgba(220,38,38,0.08)' } }}
              >
                <LogoutIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default function LeftDrawer({ open, onClose, embedded, collapsed, onCollapse, onOpenSettings }) {
  if (embedded) {
    return (
      <SidebarContent
        onClose={onClose}
        collapsed={collapsed}
        onCollapse={onCollapse}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 260,
          bgcolor: 'var(--bg-secondary)',
          color: 'var(--fg-primary)',
          borderRight: '1px solid var(--border)',
        },
      }}
    >
      <SidebarContent onClose={onClose} onOpenSettings={onOpenSettings} />
    </Drawer>
  );
}
