export function generateToken(prefix = ''): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return prefix + Buffer.from(bytes).toString('base64url')
}

export function sha256Hex(value: string): string {
  return new Bun.CryptoHasher('sha256').update(value).digest('hex')
}
