/** Builds the public URL for an image stored in the `post-images` bucket. */
export function publicImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path; // already a full URL
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/post-images/${path}`;
}

export const POST_IMAGES_BUCKET = "post-images";
