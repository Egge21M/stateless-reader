import { useEffect, useRef, useState } from "react"
import { PasskeyError, unlockPasskey } from "./passkey"
import {
  generateReaderPhrase,
  restoreReader,
  type ReaderIdentity,
} from "@stateless-reader/core"

export function useReader() {
  const active = useRef<ReaderIdentity | null>(null)
  const generation = useRef(0)
  const ceremony = useRef<AbortController | null>(null)
  const [state, setState] = useState<{
    identity: ReaderIdentity | null
    revision: number
    pending: boolean
    error: string
    backup: boolean
    passkeyFailed: boolean
  }>({
    identity: null,
    revision: 0,
    pending: false,
    error: "",
    backup: false,
    passkeyFailed: false,
  })

  useEffect(
    () => () => {
      generation.current++
      ceremony.current?.abort()
      active.current?.seed.fill(0)
      active.current = null
    },
    []
  )

  function clear() {
    const revision = ++generation.current
    ceremony.current?.abort()
    ceremony.current = null
    active.current?.seed.fill(0)
    active.current = null
    setState({
      identity: null,
      revision,
      pending: false,
      error: "",
      backup: false,
      passkeyFailed: false,
    })
    return revision
  }

  async function run(
    load: (signal: AbortSignal) => Promise<ReaderIdentity>,
    backup: boolean,
    passkey: boolean
  ) {
    const revision = clear()
    const controller = new AbortController()
    ceremony.current = controller
    setState({
      identity: null,
      revision,
      pending: true,
      error: "",
      backup: false,
      passkeyFailed: false,
    })
    try {
      const identity = await load(controller.signal)
      if (revision !== generation.current) {
        identity.seed.fill(0)
        return
      }
      active.current = identity
      setState({
        identity,
        revision,
        pending: false,
        error: "",
        backup,
        passkeyFailed: false,
      })
    } catch (error) {
      if (revision === generation.current) {
        setState({
          identity: null,
          revision,
          pending: false,
          error: passkey
            ? error instanceof PasskeyError
              ? error.message
              : "Could not unlock with a passkey. Try again or use another device from the passkey prompt. If you are new here, create a new reader below."
            : "Invalid reader recovery phrase. Enter twelve English BIP39 words with a valid checksum.",
          backup: false,
          passkeyFailed: passkey,
        })
      }
    } finally {
      if (revision === generation.current) ceremony.current = null
    }
  }

  return {
    ...state,
    unlock: (phrase?: string) =>
      run(
        () => restoreReader(phrase ?? generateReaderPhrase()),
        phrase === undefined,
        false
      ),
    passkey: (create = false) =>
      run((signal) => unlockPasskey(create, signal), create, true),
    lock: clear,
    dismissProfile: () => {
      // Use the synchronous identity ref: creation and dismissal can happen before
      // React commits the pending state. Invalidate that work even in the same turn.
      if (!active.current) clear()
      else setState((current) => ({ ...current, backup: false, error: "" }))
    },
    toggleBackup: () =>
      setState((current) => ({ ...current, backup: !current.backup })),
  }
}
