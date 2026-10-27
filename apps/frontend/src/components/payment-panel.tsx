import { useEffect, useRef, useState, type RefObject } from "react"
import {
  signArticleRequest,
  type ReaderIdentity,
  type PaymentRequiredResponse,
  type ArticleContentResponse,
} from "@stateless-reader/core"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Offer = PaymentRequiredResponse["offer"]
type PaymentState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "content"; article: ArticleContentResponse }
  | { status: "ready"; payment: PaymentRequiredResponse }

function isPayment(
  value: unknown,
  articleId: string,
  publicKey: string,
  offer: Offer
): value is PaymentRequiredResponse {
  if (!value || typeof value !== "object") return false
  const body = value as Partial<PaymentRequiredResponse>
  return (
    body.articleId === articleId &&
    body.publicKey === publicKey &&
    body.protocolVersion === 1 &&
    typeof body.paymentRequest === "string" &&
    /^creqA[A-Za-z0-9_=-]+$/.test(body.paymentRequest) &&
    body.offer?.amount === offer.amount &&
    body.offer?.unit === offer.unit &&
    body.offer?.mint === offer.mint
  )
}

/** Remount on identity revision or article change; no previous identity's view is retained. */
export function PaymentPanel({
  identity,
  article,
  readingHeading,
}: {
  identity: ReaderIdentity
  article: { id: string; title: string; offer: Offer }
  readingHeading: RefObject<HTMLHeadingElement | null>
}) {
  const [state, setState] = useState<PaymentState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState(true)
  const [copyStatus, setCopyStatus] = useState("")
  const mounted = useRef(false)
  const accessTrigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    mounted.current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    async function requestPayment() {
      try {
        const path = `/article/${article.id}`
        const authorization = signArticleRequest(identity.seed, {
          articleId: article.id,
          method: "GET",
          path,
          timestamp: Math.floor(Date.now() / 1000),
        })
        const publicKey = authorization.split(" ")[1].split(".")[0]
        const response = await fetch(path, {
          headers: { Authorization: authorization },
          signal: controller.signal,
          cache: "no-store",
        })
        const payment: unknown = await response.json()
        if (controller.signal.aborted) return
        if (response.status === 200 && payment && typeof payment === "object") {
          const content = payment as Partial<ArticleContentResponse>
          if (
            content.articleId !== article.id ||
            content.publicKey !== publicKey ||
            content.protocolVersion !== 1 ||
            typeof content.body !== "string" ||
            typeof content.title !== "string"
          ) {
            throw new Error("Invalid article content")
          }
          // A successful recheck may never open a dialog. Move focus before its
          // focused access button disappears; dialog closure handles polling success.
          if (document.activeElement === accessTrigger.current) {
            readingHeading.current?.focus()
          }
          setState({
            status: "content",
            article: content as ArticleContentResponse,
          })
          setOpen(false)
          return
        }
        if (
          response.status !== 402 ||
          !isPayment(payment, article.id, publicKey, article.offer)
        ) {
          throw new Error("Invalid article response")
        }
        setState({ status: "ready", payment })
        // Schedule after completion: no overlapping reads, and a fresh signature every time.
        timer = setTimeout(() => {
          void requestPayment()
        }, 1500)
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" })
      }
    }
    void requestPayment()
    return () => {
      mounted.current = false
      controller.abort()
      clearTimeout(timer)
    }
  }, [identity, article, attempt, open, readingHeading])

  const payment = state.status === "ready" ? state.payment : null
  return (
    <>
      {state.status === "content" ? (
        <article aria-label={state.article.title} className="reading-body">
          {state.article.body.split("\n\n").map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </article>
      ) : (
        <div className="flex flex-col items-start gap-3">
          {open && state.status === "loading" && (
            <p role="status">Checking article access…</p>
          )}
          {open && state.status === "error" && (
            <Alert variant="destructive">
              <AlertTitle>Could not open article</AlertTitle>
              <AlertDescription>
                Check your connection and device clock, then try again.
              </AlertDescription>
            </Alert>
          )}
          {!open && (
            <p className="text-sm text-muted-foreground">
              Payment dialog closed. A payment already sent by your wallet can
              still complete.
            </p>
          )}
          <Button
            ref={accessTrigger}
            variant="outline"
            onClick={() => {
              setState({ status: "loading" })
              setCopyStatus("")
              setAttempt((value) => value + 1)
              setOpen(true)
            }}
          >
            {open && state.status === "error"
              ? "Retry article"
              : "Check article access"}
          </Button>
        </div>
      )}
      <Dialog
        open={open && !!payment}
        onOpenChange={(next) => {
          if (!next) setOpen(false)
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
          finalFocus={
            state.status === "content" ? readingHeading : accessTrigger
          }
        >
          <DialogHeader>
            <DialogTitle>Read {article.title}</DialogTitle>
            <DialogDescription>
              Pay once for this article. Return with your reader phrase, without
              an account.
            </DialogDescription>
          </DialogHeader>
          {open && payment && (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-heading text-3xl">
                  {payment.offer.amount} {payment.offer.unit}
                </p>
                <p className="text-sm text-muted-foreground">Article access</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Use a compatible external Cashu wallet with ecash from the mint
                below.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Pay at least the article price. Excess payment is retained. No
                change or refunds. Closing this dialog does not cancel a payment
                already sent by your wallet.
              </p>
              <QRCodeSVG
                value={payment.paymentRequest}
                size={280}
                marginSize={4}
                role="img"
                title="Payment request QR code"
                aria-label="Payment request QR code"
                className="h-auto max-w-full self-center"
              />
              <p className="text-xs break-all text-muted-foreground">
                Mint: {payment.offer.mint}
              </p>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="payment-request">
                    Payment request
                  </FieldLabel>
                  <Textarea
                    id="payment-request"
                    readOnly
                    value={payment.paymentRequest}
                    rows={2}
                    className="field-sizing-fixed"
                    spellCheck={false}
                  />
                </Field>
              </FieldGroup>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(payment.paymentRequest)
                    if (mounted.current)
                      setCopyStatus("Payment request copied.")
                  } catch {
                    if (mounted.current)
                      setCopyStatus(
                        "Could not copy. Select and copy the request text above."
                      )
                  }
                }}
              >
                Copy payment request
              </Button>
              {copyStatus && (
                <p role="status" className="text-sm text-muted-foreground">
                  {copyStatus}
                </p>
              )}
              <p role="status" className="text-sm text-muted-foreground">
                Waiting for payment. Access checks automatically while this
                dialog is open.
              </p>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close payment dialog
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
