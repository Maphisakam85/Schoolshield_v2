/* Vercel Web Analytics for the static HTML site. */
(() => {
  // Explicit production hosts prevent localhost and preview visits being counted.
  // Add a custom production domain here when one is configured.
  if (location.protocol !== 'https:' || location.hostname !== 'schoolshieldv2.vercel.app') return;
  if (document.querySelector('script[data-schoolshield-analytics]')) return;

  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
  // Record page paths only: query strings can contain learner IDs or auth codes.
  window.va('beforeSend', (event) => {
    const url = new URL(event.url, location.origin);
    url.search = '';
    url.hash = '';
    return { ...event, url: url.href };
  });

  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  script.dataset.schoolshieldAnalytics = 'true';
  document.head.appendChild(script);
})();
