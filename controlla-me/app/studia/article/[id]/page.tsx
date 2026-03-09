/**
 * /studia/article/[id] — Dettaglio voce medica studia.me
 *
 * Server component wrapper per force-dynamic.
 */

export const dynamic = "force-dynamic";

import StudiaArticleClient from "./StudiaArticleClient";

export default function StudiaArticlePage() {
  return <StudiaArticleClient />;
}
