import { adminIconFiles, defaultIcon, iconFiles } from "./app-icons";
import { appSurface } from "./surface";

/**
 * iPhone and iPad sometimes ask for /apple-touch-icon.png at the site root instead of reading the
 * page's link tag (for example when adding to the home screen). Answer with this site's icon: the
 * coral admin icon on «سِير أدمن», the default app icon on the platform.
 */
export async function touchIcon(request: Request): Promise<Response> {
  const file = appSurface() === "admin" ? adminIconFiles.apple : iconFiles(defaultIcon).apple;
  const upstream = await fetch(new URL(file, request.url), { cache: "force-cache" });
  if (!upstream.ok) return new Response("Not found", { status: 404 });
  return new Response(upstream.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
}
