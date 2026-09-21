// Refuse to run when this repo's local Supabase stack is not up.
//
// Its own entry point so an npm script can use the guard without also running a
// Supabase command. The check itself — and why it exists — is in supabase.mjs.
import { requireLocalStack } from './supabase.mjs'

requireLocalStack()
