"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Sign in, or sign out.
 *
 * A client component because the answer depends on a session cookie and the
 * header is otherwise static: rendering it on the server would mean no page in
 * the site could be cached, which is a heavy price for one word.
 *
 * Nothing is rendered until the answer arrives. Guessing "Sign in" and
 * correcting it a moment later tells a signed-in shopper they have been logged
 * out, which is alarming and wrong, and guessing the other way is worse.
 *
 * Labels come in as props because translations live on the server side of the
 * i18n helper, and this is the only piece of the header that has to be a
 * client component.
 */
export function AccountButton({
  market,
  signInLabel,
  signOutLabel,
  className,
}: {
  market: string;
  signInLabel: string;
  signOutLabel: string;
  className: string;
}) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled) setSignedIn(Boolean(body?.user));
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (signedIn === null) return null;

  if (!signedIn) {
    return (
      <Link href={`/${market}/account`} className={className}>
        {signInLabel}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        /* A full reload rather than a state flip: everything else on the page
           that depends on being signed in, the saved hearts among them, has to
           forget too. */
        window.location.href = `/${market}`;
      }}
      className={className}
    >
      {signOutLabel}
    </button>
  );
}
