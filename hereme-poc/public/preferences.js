'use strict';
// Browser-only display preferences; post/filter state remains in the shared app.
(() => {
  const root=document.documentElement;
  root.dataset.layout=localStorage.getItem('hereme_layout')==='advanced'?'advanced':'simple';
  root.dataset.theme=localStorage.getItem('hereme_theme')==='light'?'light':'dark';
  document.querySelector('meta[name="theme-color"]').content=root.dataset.theme==='light'?'#fafaf6':'#0f1012';
})();
