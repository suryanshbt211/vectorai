(function () {
  var t = 'dark';
  try { t = localStorage.getItem('vector-theme') || 'light'; } catch (e) { /* storage unavailable */ }
  document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
})();
