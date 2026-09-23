/** Vista PDF y descarga compartidas; el propietario debe liberar la URL blob. */
import type { ReactNode } from "react";

type Props = {
  url: string;
  filename: string;
  title: string;
  children?: ReactNode;
};

export function PdfPreview({ url, filename, title, children }: Props) {
  return <>
    <iframe className="pdf-preview" src={url} title={title} />
    <div className="modal-actions label-preview-actions">
      <a className="button secondary" href={url} download={filename}>Descargar PDF</a>
      {children}
    </div>
  </>;
}
