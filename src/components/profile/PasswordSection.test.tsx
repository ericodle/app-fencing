import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PasswordSection } from './PasswordSection'

const updateUser = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { updateUser } } }))

describe('PasswordSection', () => {
  it('changes the signed-in member\'s password and clears the box', async () => {
    updateUser.mockResolvedValue({ data: {}, error: null })
    render(<PasswordSection />)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'my-own-one' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText(/Password changed/)).toHaveAttribute('role', 'status')
    expect(updateUser).toHaveBeenCalledWith({ password: 'my-own-one' })
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })

  it('shows why Auth refused', async () => {
    updateUser.mockResolvedValue({ data: {}, error: { message: 'New password should be different from the old password.' } })
    render(<PasswordSection />)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'the-same-one' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('different from the old password')
  })
})
