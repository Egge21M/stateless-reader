import { useState } from "react"
import type { useReader } from "@/lib/use-reader"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

export function ReaderControls({
  reader,
}: {
  reader: ReturnType<typeof useReader>
}) {
  const [draft, setDraft] = useState("")
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        A separate phrase for reading. Never enter your Cashu wallet recovery
        phrase here.
      </p>
      <p aria-live="polite">
        {reader.pending
          ? "Restoring reader…"
          : reader.identity
            ? "Reader unlocked"
            : "Reader locked"}
      </p>
      <p className="text-sm text-muted-foreground">
        Back up your twelve words somewhere private. Losing it loses access.
        Sharing it shares access. Only these words are needed; there is no extra
        password or BIP39 passphrase. Reloading requires restoration. Lock
        clears active app state; JavaScript memory erasure is not guaranteed.
      </p>
      {reader.identity && (
        <div className="flex flex-col items-start gap-3">
          <Button variant="outline" onClick={reader.toggleBackup}>
            {reader.backup ? "Hide backup" : "Show backup"}
          </Button>
          {reader.backup && (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="reader-backup">
                  Your reader recovery phrase
                </FieldLabel>
                <Textarea
                  id="reader-backup"
                  readOnly
                  value={reader.identity.phrase}
                  autoComplete="off"
                  spellCheck={false}
                />
                <FieldDescription>
                  Write down the words in this order. This phrase is kept only
                  in this tab's memory.
                </FieldDescription>
              </Field>
            </FieldGroup>
          )}
        </div>
      )}
      <form
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          const phrase = draft
          setDraft("")
          void reader.unlock(phrase)
        }}
      >
        <FieldGroup>
          <Field data-invalid={!!reader.error}>
            <FieldLabel htmlFor="reader-restore">
              Restore reader recovery phrase
            </FieldLabel>
            <Textarea
              id="reader-restore"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!reader.error}
              aria-describedby="reader-restore-help"
            />
            <FieldDescription id="reader-restore-help">
              Restoring replaces the active reader, even if the phrase is
              invalid.
            </FieldDescription>
            {reader.error && <FieldError>{reader.error}</FieldError>}
          </Field>
          <Field orientation="horizontal">
            <Button type="submit">Restore reader</Button>
          </Field>
        </FieldGroup>
      </form>
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => {
            setDraft("")
            void reader.unlock()
          }}
        >
          Create reader phrase
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setDraft("")
            reader.lock()
          }}
        >
          Lock reader
        </Button>
      </div>
    </div>
  )
}
