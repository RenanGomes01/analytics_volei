import type { AnchorHTMLAttributes } from "react";

/**
 * Link com navegação completa, em vez do <Link> do Next. Offline, o service worker serve a página
 * do pré-cache (com ou sem `?id=`); uma navegação suave precisaria do payload RSC, que pode não estar em cache.
 */
export function HardLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} />;
}
