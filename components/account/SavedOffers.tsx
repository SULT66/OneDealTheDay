"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * What the shopper has put aside, shared by whatever wants to show a heart.
 *
 * Delia is the first consumer and will not be the last: a deal card is the
 * obvious second. Keeping the list in one place means the heart is filled in
 * everywhere the moment it is tapped anywhere, instead of each surface holding
 * its own idea of what is saved and disagreeing after a save.
 *
 * Saving needs an account, which was the deliberate choice: a saved list that
 * lives in one browser is a saved list that disappears when somebody switches
 * to their phone, and they will blame the site rather than the browser. So an
 * unsigned tap raises a prompt instead of silently doing nothing.
 */

export type SavedOffer = {
  id: number;
  url: string;
  title: string;
  retailer: string;
  price_value: number | null;
  currency: string;
  image_url: string;
  catalog_product_id: number;
  market: string;
  saved_at: string;
};

export type OfferToSave = {
  url: string;
  title: string;
  retailer?: string;
  price_value?: number | null;
  currency?: string;
  image_url?: string;
  catalog_product_id?: number;
};

type SavedContextValue = {
  /** null until the first answer: neither "signed in" nor "signed out" yet. */
  signedIn: boolean | null;
  offers: SavedOffer[];
  isSaved: (url: string) => boolean;
  toggle: (offer: OfferToSave) => Promise<void>;
  /** Set when an unsigned shopper tried to save, cleared when they dismiss it. */
  promptToSignIn: boolean;
  dismissPrompt: () => void;
  market: string;
};

const SavedContext = createContext<SavedContextValue | null>(null);

export function useSavedOffers() {
  return useContext(SavedContext);
}

export function SavedOffersProvider({
  market,
  children,
}: {
  market: string;
  children: React.ReactNode;
}) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [offers, setOffers] = useState<SavedOffer[]>([]);
  const [promptToSignIn, setPromptToSignIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/saved")
      .then(async (response) => {
        if (cancelled) return;
        /* 401 is the ordinary answer for a visitor who has not signed in, not
           a failure worth reporting anywhere. */
        if (response.status === 401) {
          setSignedIn(false);
          return;
        }
        const body = await response.json().catch(() => ({}));
        setSignedIn(true);
        setOffers(Array.isArray(body?.offers) ? body.offers : []);
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const savedByUrl = useMemo(
    () => new Map(offers.map((offer) => [offer.url, offer])),
    [offers],
  );

  const isSaved = useCallback((url: string) => savedByUrl.has(url), [savedByUrl]);

  const toggle = useCallback(
    async (offer: OfferToSave) => {
      if (signedIn !== true) {
        setPromptToSignIn(true);
        return;
      }
      const existing = savedByUrl.get(offer.url);
      if (existing) {
        /* Removed from the list first, so the heart empties under the finger
           rather than a moment later. Put back if the server disagrees. */
        setOffers((current) => current.filter((item) => item.id !== existing.id));
        const response = await fetch(`/api/saved/${existing.id}`, { method: "DELETE" }).catch(() => null);
        if (!response || !response.ok) setOffers((current) => [existing, ...current]);
        return;
      }
      const response = await fetch("/api/saved", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...offer, market }),
      }).catch(() => null);
      if (!response) return;
      if (response.status === 401) {
        setSignedIn(false);
        setPromptToSignIn(true);
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (body?.offer) setOffers((current) => [body.offer, ...current]);
    },
    [market, savedByUrl, signedIn],
  );

  const value = useMemo(
    () => ({
      signedIn,
      offers,
      isSaved,
      toggle,
      promptToSignIn,
      dismissPrompt: () => setPromptToSignIn(false),
      market,
    }),
    [signedIn, offers, isSaved, toggle, promptToSignIn, market],
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}
