// The app's club-facing text, resolved once for the language the deployment
// picked in `piste.config.ts` (`locale.language`). Because the language is a
// build-time constant, selection needs no React context and no provider: `t` is
// a plain module-level object.
//
//   import { t } from '../i18n'
//   <h1>{t.dashboard.title}</h1>
//   <span>{t.poll.yesCount(n)}</span>
//
// Add a language by extending SUPPORTED_LANGUAGES (src/config/languages.ts) and
// adding a catalog here. See docs/i18n.md.
import { clubConfig } from '../config/club'
import type { SupportedLanguage } from '../config/languages'
import { en, type Messages } from './messages/en'
import { zhTW } from './messages/zh-TW'

export type { Messages }

const catalogs: Record<SupportedLanguage, Messages> = { en, 'zh-TW': zhTW }

export const t: Messages = catalogs[clubConfig.locale.language]
