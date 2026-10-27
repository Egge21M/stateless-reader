import { useEffect, useRef, useState } from "react"
import { PasskeyError, unlockPasskey } from "./passkey"
import type { ReaderIdentity } from "@stateless-reader/core"

export function useReader() {
  const active = useRef<ReaderIdentity | null>(null)
  const generation = useRef(0)
  const ceremony = useRef<AbortController | null>(null)
  const [state, setState] = useState<{
    identity: ReaderIdentity | null
    revision: number
    pending: boolean
    error: string
  }>({ identity: null, revision: 0, pending: false, error: "" })

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
    setState({ identity: null, revision, pending: false, error: "" })
    return revision
  }

  async function passkey(create = false) {
    const revision = clear()
    const controller = new AbortController()
    ceremony.current = controller
    setState({ identity: null, revision, pending: true, error: "" })
    try {
      const identity = await unlockPasskey(create, controller.signal)
      if (revision !== generation.current) {
        identity.seed.fill(0)
        return
      }
      active.current = identity
      setState({ identity, revision, pending: false, error: "" })
    } catch (error) {
      if (revision === generation.current) {
        setState({
          identity: null,
          revision,
          pending: false,
          error:
            error instanceof PasskeyError
              ? error.message
              : create
                ? "Passkey setup did not finish. If a passkey was saved, try Login with passkey again."
                : "Could not unlock with a passkey. Try again or use another device from the passkey prompt. New readers can choose First time? Create a reader.",
        })
      }
    } finally {
      if (revision === generation.current) ceremony.current = null
    }
  }

  return {
    ...state,
    passkey,
    lock: clear,
    dismissProfile: () => {
      // Invalidate pending work even before React commits its state.
      if (!active.current) clear()
      else setState((current) => ({ ...current, error: "" }))
    },
  }
}
