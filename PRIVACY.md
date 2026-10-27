# Privacy Policy — AniHub

_Last updated: 2026-10-26_

AniHub is a browser extension that lets you view and update your **MyAnimeList**
and **AniList** anime/manga lists from one place. This policy explains what data
the extension handles.

## What AniHub accesses

When you connect an account, AniHub uses the official **OAuth** sign-in of each
service to obtain an access token for:

- MyAnimeList (`myanimelist.net`)
- AniList (`anilist.co`)

With your authorization it reads and updates **your own** list data
(currently-watching / reading titles, progress, scores, statuses, start/finish
dates) and fetches public media details (titles, synopsis, characters,
streaming/external links, airing information).

## Where your data is stored

- Access/refresh tokens and your preferences are stored **locally on your
  device** using the browser's `chrome.storage.local`. They are **not** sent to
  us or to any analytics service.
- AniHub has **no user accounts** and keeps **no database** of users or their
  data.

## Network requests

AniHub communicates only with:

- `myanimelist.net` and `api.myanimelist.net` — your MyAnimeList list and media
  data.
- `anilist.co` and `graphql.anilist.co` — your AniList list and media data, and
  notifications.
- `api.jikan.moe` — public MyAnimeList media details (characters,
  streaming/external links) that MyAnimeList's official API does not expose.
- An **AniHub OAuth proxy** (a Cloudflare Worker) — used **only** to perform the
  MyAnimeList OAuth token exchange and refresh. It processes the authorization
  code / refresh token transiently to complete sign-in and **does not store**
  your tokens.

Each third-party service is governed by its own privacy policy.

## What we do NOT do

- No analytics, tracking, or advertising.
- No selling, renting, or sharing of your data.
- No collection of data beyond what is needed to show and update your lists.

## Removing your data

- Open the extension's **Options** and click **Disconnect** to delete the stored
  tokens for a service.
- Uninstalling the extension removes all locally stored data.
- You can also revoke AniHub's access from your MyAnimeList (Account Settings →
  API) and AniList (Settings → Apps) accounts.

## Not affiliated

AniHub is an independent, unofficial tool. It is not affiliated with, endorsed
by, or sponsored by MyAnimeList or AniList. All trademarks belong to their
respective owners.

## Contact

Questions: <your-contact-email>

## Changes

We may update this policy; the "Last updated" date above will change
accordingly.
