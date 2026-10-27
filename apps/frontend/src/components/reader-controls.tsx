import type { useReader } from "@/lib/use-reader"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"

export function ReaderControls({
  reader,
}: {
  reader: ReturnType<typeof useReader>
}) {
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
            onClick={() => void reader.passkey()}
          >
            Login with passkey
          </Button>
          <Button
            variant="link"
            size="sm"
            className="self-start"
            disabled={reader.pending}
            onClick={() => void reader.passkey(true)}
          >
            First time? Create a reader
          </Button>
        </div>
      )}
      {reader.error && <FieldError>{reader.error}</FieldError>}
      <p className="text-sm text-muted-foreground">
        Your passkey is your only way back to your purchases. Keep it available
        in your passkey provider. There is no recovery phrase or publisher
        reset.
      </p>
      {(reader.identity || reader.pending) && (
        <Button variant="outline" onClick={reader.lock}>
          {reader.pending ? "Cancel" : "Lock reader"}
        </Button>
      )}
    </div>
  )
}
