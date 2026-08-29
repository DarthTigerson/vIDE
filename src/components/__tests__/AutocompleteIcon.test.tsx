import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AutocompleteIcon } from '@/components/ActivityBar/ActivityBar'

describe('AutocompleteIcon', () => {
  it('renders the "Abc" label as real text', () => {
    render(<AutocompleteIcon crossedOut={false} />)
    expect(screen.getByText('Abc')).toBeInTheDocument()
  })

  it('overlays a diagonal slash when crossedOut is true', () => {
    const { container } = render(<AutocompleteIcon crossedOut={true} />)
    expect(container.querySelector('svg line')).toBeTruthy()
  })

  it('omits the slash when crossedOut is false', () => {
    const { container } = render(<AutocompleteIcon crossedOut={false} />)
    expect(container.querySelector('svg line')).toBeFalsy()
  })

  it('applies the spin animation class to the underline when busy', () => {
    const { container } = render(<AutocompleteIcon crossedOut={false} busy={true} />)
    expect(container.querySelector('.autocomplete-busy-arc')).toBeTruthy()
  })

  it('omits the spin animation class when not busy', () => {
    const { container } = render(<AutocompleteIcon crossedOut={false} busy={false} />)
    expect(container.querySelector('.autocomplete-busy-arc')).toBeFalsy()
  })
})
