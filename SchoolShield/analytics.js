// Vercel Web Analytics - Initialization
// This file injects Vercel Web Analytics tracking into the page
(function() {
  // Initialize the analytics queue
  if (!window.va) {
    window.va = function a() {
      (window.vaq = window.vaq || []).push(arguments);
    };
  }

  // Detect environment (production vs development)
  var mode = 'production';
  try {
    // Check if we're running locally
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '') {
      mode = 'development';
    }
  } catch (e) {
    // Default to production if detection fails
  }
  
  window.vam = mode;

  // Load the Vercel Analytics script
  if (mode === 'production') {
    var script = document.createElement('script');
    script.defer = true;
    script.src = '/_vercel/insights/script.js';
    document.head.appendChild(script);
  } else {
    // In development, log events to console
    console.log('[Vercel Analytics] Running in development mode - events will be logged to console');
  }
})();
