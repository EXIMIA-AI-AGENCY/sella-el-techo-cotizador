/**
 * Code.gs
 * Backend logic for Sella El Techo Wizard
 */

// Serves the HTML file when the web app URL is visited
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Cotizador Sella El Techo')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Optional: Helper to include other HTML files if you decide to split CSS/JS later
// Usage in HTML: <?!= include('Stylesheet'); ?>
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename)
      .getContent();
}
