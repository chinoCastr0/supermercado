/**
 * Lectura de códigos con ZXing y cámara del navegador.
 * La sesión y el bloqueo de lectura evitan resultados repetidos durante consultas.
 * El desmontaje detiene los controles y las pistas de video para liberar la cámara.
 */
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";

export type ScannerLookupOutcome = "found" | "not-found" | "error";

type ScannerPhase =
  | "starting"
  | "scanning"
  | "searching"
  | "error";

type Props = {
  onClose: () => void;
  onDetected: (barcode: string) => Promise<ScannerLookupOutcome>;
};

const SUPPORTED_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
];

/** Traduce fallos de permisos, contexto seguro y disponibilidad de cámara. */
function cameraErrorMessage(error: unknown): string {
  if (!window.isSecureContext) {
    return "La cámara requiere HTTPS. En esta dirección HTTP el navegador no permite abrirla.";
  }
  if (!(error instanceof DOMException)) {
    return "No se pudo iniciar la cámara. Cerrá otras aplicaciones que puedan estar utilizándola.";
  }
  if (error.name === "NotAllowedError") {
    return "No se concedió permiso para usar la cámara. Habilitalo desde la configuración del navegador.";
  }
  if (error.name === "NotFoundError") {
    return "No se encontró una cámara disponible en este dispositivo.";
  }
  if (error.name === "NotReadableError") {
    return "La cámara está siendo utilizada por otra aplicación o no puede iniciarse.";
  }
  return `No se pudo iniciar la cámara: ${error.message}`;
}

/** Controla sesión de captura, consulta de código y opción de alta. */
export function BarcodeScanner({
  onClose,
  onDetected,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const sessionRef = useRef(0);
  const readingLockedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [phase, setPhase] = useState<ScannerPhase>("starting");
  const [detectedBarcode, setDetectedBarcode] = useState("");
  const [message, setMessage] = useState("Preparando la cámara…");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  // Invalidar la sesión también vuelve irrelevantes las respuestas tardías de captura.
  const stopScanner = useCallback(() => {
    sessionRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    readingLockedRef.current = true;
    const video = videoRef.current;
    if (video?.srcObject instanceof MediaStream) {
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    stopScanner();
    const sessionId = sessionRef.current;
    readingLockedRef.current = false;
    setDetectedBarcode("");
    setPhase("starting");
    setMessage("Solicitando permiso para usar la cámara…");

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setMessage(
        window.isSecureContext
          ? "Este navegador no ofrece acceso a la cámara. Probá con una versión actualizada de Chrome o Safari."
          : "La cámara requiere HTTPS. En esta dirección HTTP el navegador no permite abrirla.",
      );
      return;
    }

    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 180,
      delayBetweenScanSuccess: 1_000,
    });
    reader.possibleFormats = SUPPORTED_FORMATS;

    try {
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current ?? undefined,
        (result, error, callbackControls) => {
          void error;
          if (!result || readingLockedRef.current) return;

          const barcode = result.getText().trim();
          if (!barcode) return;
          readingLockedRef.current = true;
          callbackControls.stop();
          setDetectedBarcode(barcode);
          setPhase("searching");
          setMessage("Buscando el producto…");
          if ("vibrate" in navigator) navigator.vibrate(80);

          void onDetectedRef
            .current(barcode)
            .then((outcome) => {
              if (sessionId !== sessionRef.current) return;
              if (outcome === "error") {
                setPhase("error");
                setMessage("No se pudo consultar el producto. Revisá la conexión e intentá nuevamente.");
              }
            })
            .catch(() => {
              if (sessionId !== sessionRef.current) return;
              setPhase("error");
              setMessage("No se pudo consultar el producto. Revisá la conexión e intentá nuevamente.");
            });
        },
      );
      if (sessionId !== sessionRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      if (readingLockedRef.current) {
        controls.stop();
        return;
      }
      setPhase("scanning");
      setMessage("Apuntá la cámara al código de barras");
    } catch (error) {
      if (sessionId !== sessionRef.current) return;
      setPhase("error");
      setMessage(cameraErrorMessage(error));
    }
  }, [stopScanner]);

  useEffect(() => {
    const startTimer = window.setTimeout(() => void startScanner(), 0);
    return () => {
      window.clearTimeout(startTimer);
      stopScanner();
    };
  }, [startScanner, stopScanner]);

  return (
    <Modal
      titleId="barcode-scanner-title"
      isBusy={false}
      onClose={onClose}
      className="barcode-scanner-modal"
    >
      <div className="modal-header scanner-header">
        <div>
          <span className="modal-kicker">CÁMARA EN VIVO</span>
          <h2 id="barcode-scanner-title">Escanear código</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar scanner">
          ×
        </button>
      </div>

      <div className={`scanner-view ${phase}`}>
        <video ref={videoRef} autoPlay muted playsInline />
        <div className="scanner-frame" aria-hidden="true">
          <span />
        </div>
        {(phase === "starting" || phase === "searching") && (
          <span className="scanner-loader" aria-hidden="true" />
        )}
      </div>

      <div className="scanner-feedback" aria-live="polite">
        <strong>{message}</strong>
        {detectedBarcode && <code>{detectedBarcode}</code>}
      </div>

      {phase === "error" && (
        <div className="scanner-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Cerrar
          </button>
          <button
            className="button primary"
            type="button"
            onClick={() => void startScanner()}
          >
            Intentar nuevamente
          </button>
        </div>
      )}
    </Modal>
  );
}
