// Vercel Speed Insights initialization
// This script loads and initializes Vercel Speed Insights for performance tracking
(async () => {
  try {
    // Import the Speed Insights module
    const { injectSpeedInsights } = await import('./speed-insights.mjs');
    
    // Initialize Speed Insights
    if (injectSpeedInsights) {
      injectSpeedInsights({
        debug: false, // Set to true in development if needed
        framework: 'vanilla-js'
      });
    }
  } catch (error) {
    // Silently fail if module loading fails
    console.warn('Speed Insights could not be loaded:', error.message);
  }
})();
