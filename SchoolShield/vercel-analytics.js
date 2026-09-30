/**
 * Vercel Web Analytics initialization
 * This script initializes the Vercel Analytics queue and loads the analytics script.
 * Documentation: https://vercel.com/docs/analytics/quickstart
 */

(function() {
  'use strict';
  
  // Initialize the analytics queue
  window.va = window.va || function () { 
    (window.vaq = window.vaq || []).push(arguments); 
  };
  
  // Load the analytics script asynchronously
  var script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  
  // Append the script to the document
  var firstScript = document.getElementsByTagName('script')[0];
  if (firstScript && firstScript.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }
})();
