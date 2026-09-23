import { describe, expect, it } from 'vitest'
import { generatePassword } from './password'

describe('generatePassword', () => {
  it('is three groups of four', () => {
    expect(generatePassword()).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/)
  })

  it('never uses a character that reads as another', () => {
    const everything = Array.from({ length: 200 }, () => generatePassword()).join('')
    expect(everything).not.toMatch(/[0oO1lI]/)
  })

  it('maps random values onto the alphabet in order', () => {
    // 0 → 'a', 1 → 'b', 56 wraps back to 'a'.
    const fixed = () => Uint32Array.from([0, 1, 56, 57, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(generatePassword(fixed)).toBe('abab-aaaa-aaaa')
  })

  it('does not repeat', () => {
    expect(generatePassword()).not.toBe(generatePassword())
  })
})
