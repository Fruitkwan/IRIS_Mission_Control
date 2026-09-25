// Apply saved theme before first paint to avoid a flash of the wrong theme.
// A separate file (not inline) so the Content-Security-Policy can forbid inline scripts.
try {
  var t = localStorage.getItem('irisops-theme');
  if (t !== 'dark' && t !== 'light') {
    t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t;
} catch (e) {}
