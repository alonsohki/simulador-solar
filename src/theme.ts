import { createTheme } from '@mui/material/styles';

export function buildTheme(mode: 'light' | 'dark') {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#f57c00' },
      secondary: { main: '#1565c0' },
      ...(mode === 'light' ? { background: { default: '#f5f5f5' } } : {}),
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h6: { fontWeight: 600 },
    },
    components: {
      MuiCard: {
        defaultProps: { variant: 'outlined' },
      },
    },
  });
}
