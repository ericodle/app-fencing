// The config-contract version. Kept in its own dependency-free module so build
// tooling (vite.config.ts, the zod schema) can read it without pulling in
// `club.ts` and the whole config object along with it.
//
// Bump when the ClubConfig contract changes in a way that requires a fork to
// migrate its piste.config.ts. The build compares this against
// clubConfig.configVersion and fails loudly on a mismatch.
export const CONFIG_CONTRACT_VERSION = 1
