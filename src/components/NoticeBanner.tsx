import type { Notice } from '../types/product'

export function NoticeBanner({ notice, onClose }: { notice: NonNullable<Notice>; onClose: () => void }) {
  return <div className={`notice ${notice.kind}`} role="status">
    <span>{notice.kind === 'success' ? '✓' : '!'}</span>
    <p>{notice.message}</p>
    <button type="button" aria-label="Cerrar mensaje" onClick={onClose}>×</button>
  </div>
}
