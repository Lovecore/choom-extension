import { TWITCH_LOGIN } from '@choom/stream';

/**
 * Which Twitch channel a twitch.tv page is the live page of, or null. Only a
 * channel's own page (`/<login>`) shows the deck: never a VOD, a clip, the
 * directory, settings or a pop-out, where a live tracker would be wrong.
 * Pure, so the tests read it.
 */
const RESERVED = new Set([
  'directory', 'videos', 'settings', 'subscriptions', 'inventory', 'wallet', 'drops', 'friends', 'messages',
  'search', 'downloads', 'jobs', 'p', 'privacy', 'legal', 'turbo', 'prime', 'store', 'broadcast', 'u', 'moderator',
  'popout', 'embed', 'clips', 'collections', 'following', 'login', 'signup', 'logout', 'team', 'event', 'creatorcamp',
]);

export function liveChannelOf(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  // `/<login>` exactly; `/<login>/videos`, `/<login>/clip/...`, `/<login>/about` are not the live player.
  if (parts.length !== 1) return null;
  const login = parts[0].toLowerCase();
  if (RESERVED.has(login) || !TWITCH_LOGIN.test(login)) return null;
  return login;
}
