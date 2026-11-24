'use strict';

customElements.define('hereme-wordmark', class extends HTMLElement {
  connectedCallback() {
    // The gateway serves communities and the operator panel on separate hostnames.
    const suffix = '.hereme.no';
    if (!location.hostname.endsWith(suffix) || this.querySelector('small')) return;
    const instanceName = location.hostname.slice(0, -suffix.length);
    const label = document.createElement('small');
    label.textContent = instanceName;
    label.title = instanceName;
    this.append(label);
    this.closest('a[aria-label], button[aria-label]')?.setAttribute('aria-description', instanceName);
  }
});
