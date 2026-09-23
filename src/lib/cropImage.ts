// Client-side square cropping for the post composer. react-easy-crop hands us
// the cropped rectangle in the image's natural pixels; we draw that rectangle
// into a fixed square canvas and export a JPEG File ready to upload.

export interface CropPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the image."));
    img.src = src;
  });
}

/** A centered square crop, used when a photo was never manually adjusted. */
export async function centerSquare(src: string): Promise<CropPixels> {
  const img = await loadImage(src);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  return {
    x: (img.naturalWidth - side) / 2,
    y: (img.naturalHeight - side) / 2,
    width: side,
    height: side,
  };
}

/** Crop `src` to the given natural-pixel rectangle, output a square JPEG File. */
export async function getCroppedFile(
  src: string,
  crop: CropPixels,
  name: string,
  outSize = 1080,
): Promise<File> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, outSize, outSize);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't crop the image."))), "image/jpeg", 0.9),
  );
  return new File([blob], name, { type: "image/jpeg" });
}
