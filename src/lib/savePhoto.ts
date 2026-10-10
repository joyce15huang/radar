/**
 * Save a photo without leaving the app: the share sheet on phones (→ "Save
 * Image"), a file download on desktop. Never opens the raw storage URL.
 */
export async function savePhoto(url: string, name = "photo.jpg"): Promise<boolean> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], name, { type: blob.type || "image/jpeg" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] }) && window.matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ files: [file] });
      return true;
    }
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
    return true;
  } catch {
    return false;
  }
}
