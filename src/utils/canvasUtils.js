/**
 * Redimensiona una imagen a un data URL JPEG comprimido, para no mandar fotos de
 * varios MB a una Edge Function / API con límite de tamaño o de tokens.
 * Acepta tanto objetos File/Blob como cadenas Data URL.
 */
export const resizeImageToBase64 = async (fileOrDataUrl, maxDimension = 900, quality = 0.8) => {
  let dataUrl = fileOrDataUrl;
  if (typeof fileOrDataUrl !== 'string') {
    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(fileOrDataUrl);
    });
  }

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });

  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  if (scale >= 1 && typeof fileOrDataUrl === 'string' && dataUrl.length < 400000) {
    return dataUrl;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);

  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', quality);
};

export const getCroppedImg = async (imageSrc, pixelCrop, rotation = 0) => {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(error);
  });

  if (!pixelCrop || pixelCrop.width === 0 || pixelCrop.height === 0) {
    // Si no hay recorte, devolvemos la imagen original (potencialmente rotada)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Configurar el canvas para rotación
    if (rotation === 90 || rotation === 270) {
      canvas.width = image.height;
      canvas.height = image.width;
    } else {
      canvas.width = image.width;
      canvas.height = image.height;
    }

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
    });
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  // Calculate bounding box of the rotated image
  const safeArea = Math.max(image.width, image.height) * 2;

  // Set canvas size to the safe area to avoid clipping when rotating
  canvas.width = safeArea;
  canvas.height = safeArea;

  // Translate canvas context to a central location to allow rotating around the center
  ctx.translate(safeArea / 2, safeArea / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-safeArea / 2, -safeArea / 2);

  // Draw the original image onto the canvas
  ctx.drawImage(
    image,
    safeArea / 2 - image.width / 2,
    safeArea / 2 - image.height / 2
  );

  // Extract the cropped image data from the safe area canvas
  const data = ctx.getImageData(
    safeArea / 2 - image.width / 2 + pixelCrop.x,
    safeArea / 2 - image.height / 2 + pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height
  );

  // Set canvas width to final desired crop size
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Paste generated image data into the final canvas
  ctx.putImageData(data, 0, 0);

  // Return as a Blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg', 0.95);
  });
};
