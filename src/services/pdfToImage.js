import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * Obtiene el total de páginas de un archivo PDF (File o ArrayBuffer/Uint8Array)
 * @param {File|ArrayBuffer|Uint8Array} fileOrBuffer 
 * @returns {Promise<number>}
 */
export async function getPdfPageCount(fileOrBuffer) {
  try {
    let arrayBuffer = fileOrBuffer;
    if (fileOrBuffer instanceof File || fileOrBuffer instanceof Blob) {
      arrayBuffer = await fileOrBuffer.arrayBuffer();
    }
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
    });
    const pdf = await loadingTask.promise;
    return pdf.numPages;
  } catch (error) {
    console.error('[pdfToImage] Error getting PDF page count:', error);
    return 1;
  }
}

/**
 * Convierte una página específica de un archivo PDF a una imagen en Base64 (JPEG/PNG)
 * @param {File|ArrayBuffer|Uint8Array} fileOrBuffer 
 * @param {number} pageNumber - Número de página (1-indexed)
 * @param {number} scale - Escala de renderizado (por defecto 2.5)
 * @returns {Promise<{ base64: string, totalPages: number }>}
 */
export async function convertPdfPageToImageBase64(fileOrBuffer, pageNumber = 1, scale = 2.5) {
  try {
    let arrayBuffer = fileOrBuffer;
    if (fileOrBuffer instanceof File || fileOrBuffer instanceof Blob) {
      arrayBuffer = await fileOrBuffer.arrayBuffer();
    }

    const loadingTask = pdfjsLib.getDocument({ 
      data: new Uint8Array(arrayBuffer),
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
    });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    
    // Asegurar que el número de página esté dentro de rango
    const targetPageNum = Math.min(Math.max(1, pageNumber), totalPages);
    const page = await pdf.getPage(targetPageNum);
    
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    await page.render(renderContext).promise;
    
    return {
      base64: canvas.toDataURL('image/jpeg', 0.85),
      totalPages
    };
  } catch (error) {
    console.error('[pdfToImage] Error converting PDF to image:', error);
    throw error;
  }
}

/**
 * Extrae todo el texto de un archivo PDF.
 * @param {File|ArrayBuffer|Uint8Array} fileOrBuffer 
 * @returns {Promise<string>}
 */
export async function extractPdfText(fileOrBuffer) {
  try {
    let arrayBuffer = fileOrBuffer;
    if (fileOrBuffer instanceof File || fileOrBuffer instanceof Blob) {
      arrayBuffer = await fileOrBuffer.arrayBuffer();
    }
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
    });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText.trim();
  } catch (error) {
    console.error('[pdfToImage] Error extracting text from PDF:', error);
    throw error;
  }
}
