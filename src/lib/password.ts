// A password an admin can read aloud or paste into a LINE message without it
// being misread: no 0/o/O, 1/l/I, and grouped in fours.
//
// 12 characters from a 56-symbol alphabet is about 69 bits — more than enough
// for a password the member is told to change.

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePassword(random: (n: number) => Uint32Array = n => crypto.getRandomValues(new Uint32Array(n))): string {
  const values = random(12)
  const chars = Array.from(values, v => ALPHABET[v % ALPHABET.length])
  return [0, 4, 8].map(i => chars.slice(i, i + 4).join('')).join('-')
}
