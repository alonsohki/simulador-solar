import { useState, useMemo } from 'react';
import { Box, Drawer, Toolbar, AppBar, Typography, IconButton } from '@mui/material';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { WbSunny, DarkMode, LightMode } from '@mui/icons-material';
import { buildTheme } from './theme.ts';
import ConsumptionPanel from './components/sidebar/ConsumptionPanel.tsx';
import SolarPanel from './components/sidebar/SolarPanel.tsx';
import TariffSchedulePanel from './components/sidebar/TariffSchedulePanel.tsx';
import OffersPanel from './components/sidebar/OffersPanel.tsx';
import BatteriesPanel from './components/sidebar/BatteriesPanel.tsx';
import DataManagementPanel from './components/sidebar/DataManagementPanel.tsx';
import AnalysisPage from './pages/AnalysisPage.tsx';

const DRAWER_WIDTH = 380;

function getInitialMode(): 'light' | 'dark' {
  const stored = localStorage.getItem('theme-mode');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [mode, setMode] = useState<'light' | 'dark'>(getInitialMode);
  const theme = useMemo(() => buildTheme(mode), [mode]);

  const toggleMode = () => {
    const next = mode === 'light' ? 'dark' : 'light';
    setMode(next);
    localStorage.setItem('theme-mode', next);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex' }}>
        <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
          <Toolbar variant="dense">
            <WbSunny sx={{ mr: 1 }} />
            <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
              Comparador Solar
            </Typography>
            <IconButton color="inherit" onClick={toggleMode}>
              {mode === 'light' ? <DarkMode /> : <LightMode />}
            </IconButton>
          </Toolbar>
        </AppBar>

        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          <Toolbar variant="dense" />
          <Box sx={{ overflow: 'auto', p: 1 }}>
            <ConsumptionPanel />
            <SolarPanel />
            <TariffSchedulePanel />
            <OffersPanel />
            <BatteriesPanel />
            <DataManagementPanel />
          </Box>
        </Drawer>

        <Box component="main" sx={{ flexGrow: 1, overflow: 'auto' }}>
          <Toolbar variant="dense" />
          <AnalysisPage />
        </Box>
      </Box>
    </ThemeProvider>
  );
}
