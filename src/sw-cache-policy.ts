// Shared between the service worker and the app, which is why it is its own
// module: the worker cannot import from the app bundle, and duplicating a cache
// name is how a cache gets orphaned and never cleared.

export const SUPABASE_CACHE = 'supabase-api'

/** Posted to the worker on sign-out. Reads made under one member's RLS scope
 *  must not be served to the next person on the device. */
export const CLEAR_SUPABASE_CACHE_MSG = 'piste:clear-supabase-cache'
