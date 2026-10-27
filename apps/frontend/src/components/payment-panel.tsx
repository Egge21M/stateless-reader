import { useEffect, useRef, useState } from "react"
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
}: {
  identity: ReaderIdentity
  article: { id: string; offer: Offer }
}) {
  const [state, setState] = useState<PaymentState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState(true)
  const [copyStatus, setCopyStatus] = useState("")
  const mounted = useRef(false)

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
        if (response.status === 200 && payment && typeof payment === 'object') {
          const content = payment as Partial<ArticleContentResponse>
          if (content.articleId !== article.id || content.publicKey !== publicKey ||
              content.protocolVersion !== 1 || typeof content.body !== 'string' || typeof content.title !== 'string') {
            throw new Error('Invalid article content')
          }
          setState({ status: 'content', article: content as ArticleContentResponse })
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
        timer = setTimeout(() => { void requestPayment() }, 1500)
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
  }, [identity, article, attempt, open])

  if (!open) return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-muted-foreground">Payment panel closed. A payment already sent by your wallet can still complete.</p>
      <Button variant="outline" onClick={() => { setState({ status: 'loading' }); setOpen(true) }}>Check article access</Button>
    </div>
  )
  if (state.status === 'content') return (
    <article aria-label={state.article.title} className="flex max-w-prose flex-col gap-5 leading-relaxed">
      {state.article.body.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </article>
  )

  if (state.status === "loading")
    return <p role="status">Checking article access…</p>
  if (state.status === "error")
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive">
          <AlertTitle>Could not open article</AlertTitle>
          <AlertDescription>
            Check your connection and device clock, then try again.
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          onClick={() => {
            setState({ status: "loading" })
            setAttempt((value) => value + 1)
          }}
        >
          Retry article
        </Button>
      </div>
    )
  return (
    <section aria-label="Payment panel" className="flex min-w-0 flex-col gap-5">
      <Alert role="status">
        <AlertTitle>Full article locked</AlertTitle>
        <AlertDescription>
          Use a compatible external Cashu wallet with ecash from the mint below.
        </AlertDescription>
      </Alert>
      <p className="text-sm break-words text-muted-foreground">
        {state.payment.offer.amount} {state.payment.offer.unit} · Mint:{" "}
        {state.payment.offer.mint}
      </p>
      <p className="text-sm text-muted-foreground">
        Pay at least the article price. Excess payment is retained. No change or
        refunds. Closing this panel does not cancel a payment already sent by
        your wallet.
      </p>
      <p className="text-sm text-muted-foreground">
        Waiting for payment. This panel checks for access automatically.
      </p>
      <Button variant="outline" className="self-start" onClick={() => setOpen(false)}>Close payment panel</Button>
      <QRCodeSVG
        value={state.payment.paymentRequest}
        size={280}
        marginSize={4}
        role="img"
        title="Payment request QR code"
        aria-label="Payment request QR code"
        className="h-auto max-w-full self-start"
      />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="payment-request">Payment request</FieldLabel>
          <Textarea
            id="payment-request"
            readOnly
            value={state.payment.paymentRequest}
            rows={4}
            spellCheck={false}
          />
        </Field>
      </FieldGroup>
      <Button
        className="self-start"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(state.payment.paymentRequest)
            if (mounted.current) setCopyStatus("Payment request copied.")
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
      <p role="status" className="text-sm text-muted-foreground">
        {copyStatus}
      </p>
    </section>
  )
}
