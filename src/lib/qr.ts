import QRCode from "qrcode";

export const QR_QUIET = 4;

export type QrGrid = {
  size: number;
  modules: boolean[];
};

export function qrGrid(value: string): QrGrid {
  const code = QRCode.create(value, { errorCorrectionLevel: "H" });
  const size = code.modules.size;
  const modules: boolean[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      modules.push(code.modules.get(row, col) === 1);
    }
  }
  return { size, modules };
}

export function qrDrawSize(card: number, moduleCount: number) {
  const total = moduleCount + QR_QUIET * 2;
  const moduleSize = Math.max(1, Math.floor(Math.max(1, card) / total));
  return { moduleSize, pixelSize: moduleSize * total };
}
