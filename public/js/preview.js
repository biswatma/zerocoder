function updatePreview(htmlContent) {
  const iframe = document.getElementById('preview');
  iframe.srcdoc = htmlContent;
  // console.log("Preview updated.");
}

// console.log("preview.js loaded");
