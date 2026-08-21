import { useEffect } from 'react'
import type { ReactNode } from 'react'

type Props = { titleId: string; isBusy: boolean; onClose: () => void; children: ReactNode }

export function Modal({ titleId, isBusy, onClose, children }: Props) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !isBusy) onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isBusy, onClose])
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isBusy) onClose() }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>{children}</section>
  </div>
}
