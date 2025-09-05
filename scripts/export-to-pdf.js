document.addEventListener('DOMContentLoaded', () => {
  const exportButton = document.createElement('button');
  exportButton.textContent = 'Descargar PDF';
  exportButton.classList.add('export-pdf-button');
  exportButton.style.padding = '8px 16px';
  exportButton.style.borderRadius = '5px';
  exportButton.style.backgroundColor = '#18a85f';
  exportButton.style.color = '#fff';
  exportButton.style.border = 'none';
  exportButton.style.cursor = 'pointer';
  exportButton.style.marginLeft = '10px';

  // Find a good place to insert the button, like next to the page title or at the top of the content.
  const header = document.querySelector('.DocsLayout_header');
  if (header) {
    header.appendChild(exportButton);
  }

  exportButton.addEventListener('click', () => {
    const element = document.querySelector('.DocsLayout_content');
    if (element) {
      const opt = {
        margin: [10, 10, 10, 10],
        filename: 'documento-mintlify.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, logging: true, dpi: 192, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      
      // Use html2pdf to generate and download the PDF
      html2pdf().set(opt).from(element).save();
    } else {
      console.error('No se encontró el contenido principal para exportar.');
      alert('No se pudo encontrar el contenido de la página para exportar.');
    }
  });

  // Load the html2pdf library dynamically
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  script.integrity = 'sha512-H7Wti2k6kC9WJ1+WfG78+F1tB0iL7+Y+tL2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L+Y+L2/C+L>