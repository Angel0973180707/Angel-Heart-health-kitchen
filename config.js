// config.js — Phase 1-B 通路測試探針
// 尚未被任何頁面引用（leader.html / shop.html / index.html 等皆未載入此檔案）
// 目的：獨立驗證 getSystemConfig() 前後端通路，不驚動任何既有穩定功能
(function() {
  'use strict';
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbz4-pJ5jWtu9nevKDl98LxRqfwyVdGApEqEzcKKR9LDxanUM5BCneCZttkH3rkxLlUtYA/exec';

  window.HappinessSystemConfig = { loaded: false, data: null, error: null };

  fetch(GAS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body:    JSON.stringify({ action: 'getSystemConfig' })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      window.HappinessSystemConfig.loaded = true;
      window.HappinessSystemConfig.data   = d.data;
    } else {
      window.HappinessSystemConfig.error = d.error || 'unknown';
    }
  })
  .catch(function(e) {
    window.HappinessSystemConfig.error = 'fetch_failed: ' + e.message;
  });
})();
