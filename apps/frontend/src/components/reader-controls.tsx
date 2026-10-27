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
      <p aria-live="polite">
        {reader.pending
          ? "Unlocking reader…"
          : reader.identity
            ? "Reader unlocked"
            : "Reader locked"}
      </p>
      {!reader.identity && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Use your passkey to return to your reading. Your device may offer a
            passkey from another device or password manager.
          </p>
          <Button
            disabled={reader.pending}
            onClick={() => {
              setDraft("")
              void reader.passkey()
            }}
          >
            Continue with passkey
          </Button>
        </div>
      )}
      {reader.error && (
        <FieldError id="reader-error">{reader.error}</FieldError>
      )}
      {reader.passkeyFailed && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            New here? Create a passkey for a new reader. A new passkey starts
            fresh; it does not recover purchases made with another passkey or
            phrase.
          </p>
          <Button
            disabled={reader.pending}
            variant="outline"
            onClick={() => {
              setDraft("")
              void reader.passkey(true)
            }}
          >
            Create a new reader
          </Button>
        </div>
      )}
      {reader.identity && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Back up your twelve words somewhere private. Losing both your
            passkey and backup loses access. Sharing either shares access.
            Reloading or locking clears your active reader.
          </p>
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
                  Write down the words in this order. They recover this same
                  reader without a passkey. This phrase is kept only in this
                  tab's memory.
                </FieldDescription>
              </Field>
            </FieldGroup>
          )}
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm">
          Use a recovery phrase
        </summary>
        <div className="flex flex-col gap-4 pt-4">
          <p className="text-sm text-muted-foreground">
            Never enter your Cashu wallet recovery phrase here. For a reader
            using only a phrase: Losing it loses access. Sharing it shares
            access.
          </p>
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
              <Field data-invalid={!!reader.error && !reader.passkeyFailed}>
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
                  aria-invalid={!!reader.error && !reader.passkeyFailed}
                  aria-describedby={
                    reader.error && !reader.passkeyFailed
                      ? "reader-restore-help reader-error"
                      : "reader-restore-help"
                  }
                />
                <FieldDescription id="reader-restore-help">
                  Restoring replaces the active reader, even if the phrase is
                  invalid. There is no extra password.
                </FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <Button type="submit" variant="outline">
                  Restore reader
                </Button>
              </Field>
            </FieldGroup>
          </form>
          <p className="text-sm text-muted-foreground">
            No compatible passkey? Create a separate reader and keep its phrase
            to return after reloading.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setDraft("")
              void reader.unlock()
            }}
          >
            Create reader phrase
          </Button>
        </div>
      </details>
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
  )
}
