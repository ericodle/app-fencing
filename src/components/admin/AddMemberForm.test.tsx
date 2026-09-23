import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { AddMemberForm } from './AddMemberForm'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke } } }))

function fill() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Yiling Ku' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'yiling@example.com' } })
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'coach' } })
  fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'en-garde-8' } })
}

describe('AddMemberForm', () => {
  it('sends the account to the create-member function and shows what to pass on', async () => {
    invoke.mockResolvedValue({ data: { id: 'x' }, error: null })
    const onCreated = vi.fn()
    render(<AddMemberForm onCreated={onCreated} />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce())
    expect(invoke).toHaveBeenCalledWith('create-member', {
      body: { name: 'Yiling Ku', email: 'yiling@example.com', role: 'coach', password: 'en-garde-8' },
    })
    expect(screen.getByRole('status')).toHaveTextContent('Account created for Yiling Ku.')
    expect(screen.getByRole('status')).toHaveTextContent('en-garde-8')
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it('shows the function\'s own reason when it refuses', async () => {
    const response = new Response(JSON.stringify({ error: 'An account with that email already exists.' }), { status: 409 })
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) })
    const onCreated = vi.fn()
    render(<AddMemberForm onCreated={onCreated} />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toHaveValue('Yiling Ku')
  })

  it('fills the password box with a generated one', () => {
    render(<AddMemberForm onCreated={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    expect((screen.getByLabelText('Temporary password') as HTMLInputElement).value).toMatch(/^\w{4}-\w{4}-\w{4}$/)
  })
})
