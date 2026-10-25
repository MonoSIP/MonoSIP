import { authenticator } from "otplib";
import QRCode from "qrcode";

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpUri(email: string, secret: string): string {
  return authenticator.keyuri(email, "MonoSIP", secret);
}

export async function totpQrDataUrl(email: string, secret: string): Promise<string> {
  return QRCode.toDataURL(totpUri(email, secret));
}

export function verifyTotp(token: string, secret: string): boolean {
  return authenticator.check(token, secret);
}
