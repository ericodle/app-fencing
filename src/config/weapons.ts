// The weapon vocabulary, and the questions the code asks about it.
//
// Deliberately import-free: the Deno edge functions and the push worker both
// need this vocabulary and neither can load a module that reaches into the
// app's config or i18n. Anything needing a translated label lives in
// weapon-labels.ts instead.
//
// The three weapons differ in ways the app has to know about, and the
// differences are not cosmetic:
//   - épée  — whole body is target, no right of way, double touches count
//   - foil  — torso only, right of way, one touch per exchange
//   - saber — waist up including arms and head, right of way, cuts as well as
//             thrusts, and the only weapon whose glove is part of the circuit
// Branch through the helpers below, never on `=== 'epee'`: a club that adds
// foil should get a compile error at every place that needs an answer, not
// silently inherit saber's behavior from an else-branch.

export const WEAPONS = ['epee', 'foil', 'saber'] as const
export type Weapon = typeof WEAPONS[number]

/**
 * True when the weapon is refereed with right of way, so a bout can be scored
 * with an exchange that lights both boxes and awards one touch. Épée is the
 * only weapon where both fencers can score on the same action.
 */
export function usesRightOfWay(weapon: Weapon): boolean {
  return weapon !== 'epee'
}

/** True when a double hit awards a touch to BOTH fencers. Épée alone. */
export function scoresDoubleTouches(weapon: Weapon): boolean {
  return weapon === 'epee'
}

/** True when the weapon needs a lamé (an electrically conductive target). */
export function needsLame(weapon: Weapon): boolean {
  return weapon !== 'epee'
}

/** True when the weapon scores with the edge as well as the point. */
export function scoresWithEdge(weapon: Weapon): boolean {
  return weapon === 'saber'
}

/**
 * True when the fencer's glove carries current and so must be the conductive
 * kind. Saber's cuff is inside the target area, which no other weapon's is.
 */
export function needsConductiveGlove(weapon: Weapon): boolean {
  return weapon === 'saber'
}

/** The weapons where a lamé is part of the required kit list. */
export const LAME_WEAPONS: readonly Weapon[] = WEAPONS.filter(needsLame)

/** Narrowing guard for values arriving from the database or a URL. */
export function isWeapon(value: unknown): value is Weapon {
  return typeof value === 'string' && (WEAPONS as readonly string[]).includes(value)
}
