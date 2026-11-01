import { publicPages } from "@/lib/site";
import { socialImage, socialImageSize } from "@/lib/social-image";

export const alt = publicPages.sage.imageAlt;
export const size = socialImageSize;
export const contentType = "image/png";

export default function Image() {
  return socialImage("sage");
}
