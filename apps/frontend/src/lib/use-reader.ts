import { useEffect, useRef, useState } from "react"
import {
  generateReaderPhrase,
  restoreReader,
  type ReaderIdentity,
} from "@stateless-reader/core"

export function useReader() {
  const active = useRef<ReaderIdentity | null>(null)
  const generation = useRef(0)
  const [state, setState] = useState<{
    identity: ReaderIdentity | null
    revision: number
    pending: boolean
    error: string
    backup: boolean
  }>({ identity: null, revision: 0, pending: false, error: "", backup: false })

  useEffect(
    () => () => {
      generation.current++
      active.current?.seed.fill(0)
      active.current = null
    },
    []
  )

  function clear() {
    const revision = ++generation.current
    active.current?.seed.fill(0)
    active.current = null
    setState({
      identity: null,
      revision,
      pending: false,
      error: "",
      backup: false,
    })
    return revision
  }

  async function unlock(phrase?: string) {
    const revision = clear()
    setState({
      identity: null,
      revision,
      pending: true,
      error: "",
      backup: false,
    })
    try {
      const identity = await restoreReader(phrase ?? generateReaderPhrase())
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
        backup: phrase === undefined,
      })
    } catch {
      if (revision === generation.current) {
        setState({
          identity: null,
          revision,
          pending: false,
          error:
            "Invalid reader recovery phrase. Enter twelve English BIP39 words with a valid checksum.",
          backup: false,
        })
      }
    }
  }

  return {
    ...state,
    unlock,
    lock: clear,
    toggleBackup: () =>
      setState((current) => ({ ...current, backup: !current.backup })),
  }
}
