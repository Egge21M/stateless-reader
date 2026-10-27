import { PASSKEY_PRF_INPUT, readerFromPasskey } from "@stateless-reader/core"

export class PasskeyError extends Error {}

const unsupported = () =>
  new PasskeyError(
    "This passkey or browser cannot unlock a reader. Try a compatible browser or passkey provider."
  )

function extensions() {
  return {
    prf: { eval: { first: new TextEncoder().encode(PASSKEY_PRF_INPUT) } },
  }
}

function checkCredential(value: Credential | null): PublicKeyCredential {
  if (!value || value.type !== "public-key") throw unsupported()
  return value as PublicKeyCredential
}

function get(signal: AbortSignal, id?: ArrayBuffer) {
  signal.throwIfAborted()
  return navigator.credentials.get({
    signal,
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      // No stored credential IDs: let the user's provider discover their passkey.
      rpId: location.hostname,
      allowCredentials: id ? [{ type: "public-key", id }] : [],
      userVerification: "required",
      timeout: 60_000,
      extensions: extensions(),
    },
  })
}

/** Local secret recovery, not a server authentication ceremony. */
export async function unlockPasskey(create: boolean, signal: AbortSignal) {
  if (
    !globalThis.isSecureContext ||
    !globalThis.PublicKeyCredential ||
    !navigator.credentials
  )
    throw unsupported()
  signal.throwIfAborted()
  let credential: PublicKeyCredential
  if (create) {
    credential = checkCredential(
      await navigator.credentials.create({
        signal,
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { id: location.hostname, name: "Stateless Reader" },
          user: {
            id: crypto.getRandomValues(new Uint8Array(32)),
            name: "My reader",
            displayName: "My reader",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            residentKey: "required",
            userVerification: "required",
          },
          attestation: "none",
          timeout: 60_000,
          extensions: extensions(),
        },
      })
    )
    const prf = credential.getClientExtensionResults().prf
    if (!prf?.results?.first) {
      if (!prf?.enabled) throw unsupported()
      // Some providers enable PRF at creation but evaluate it only on assertion.
      credential = checkCredential(await get(signal, credential.rawId))
    }
  } else {
    credential = checkCredential(await get(signal))
  }
  const output = credential.getClientExtensionResults().prf?.results?.first
  if (!output || output.byteLength !== 32) throw unsupported()
  const secret = ArrayBuffer.isView(output)
    ? new Uint8Array(output.buffer, output.byteOffset, output.byteLength)
    : new Uint8Array(output)
  try {
    signal.throwIfAborted()
    return await readerFromPasskey(secret)
  } finally {
    secret.fill(0)
  }
}
