import Image from "next/image";
import Link from "next/link";

/**
 * The Mission Giving logo, linking home. Source: public/images/mg-logo.png (a trimmed, web-sized copy of "MG Logo.png"; the
 * original is untouched). The logo has dark text, so use it on LIGHT backgrounds only; dark areas (footer, admin bar) use text.
 */
export function Logo({ priority = false, className = "h-10 sm:h-14" }: { priority?: boolean; className?: string }) {
  return (
    <Link href="/" className="inline-flex items-center" aria-label="Mission Giving home">
      <Image src="/images/mg-logo.png" alt="Mission Giving" width={760} height={199} priority={priority} className={`${className} w-auto`} />
    </Link>
  );
}
