import { PaymentPanel } from "@/components/payment-panel"
import { useReader } from "@/lib/use-reader"
import { ReaderControls } from "@/components/reader-controls"
import { useEffect, useRef, useState } from "react"
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  LockKeyholeIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface ArticleMetadata {
  id: string
  title: string
  preview: string
  offer: { amount: number; unit: string; mint: string }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isArticleMetadata(value: unknown): value is ArticleMetadata {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    typeof value.preview === "string" &&
    value.preview.length > 0 &&
    isRecord(value.offer) &&
    typeof value.offer.amount === "number" &&
    Number.isSafeInteger(value.offer.amount) &&
    value.offer.amount > 0 &&
    typeof value.offer.unit === "string" &&
    value.offer.unit.length > 0 &&
    typeof value.offer.mint === "string" &&
    value.offer.mint.length > 0
  )
}

export function App() {
  const reader = useReader()
  const [articles, setArticles] = useState<ArticleMetadata[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [attempt, setAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectionHeading = useRef<HTMLHeadingElement>(null)
  const selectionTrigger = useRef<HTMLButtonElement | null>(null)
  const selectedArticle = articles.find((article) => article.id === selectedId)

  useEffect(() => {
    if (selectedId) selectionHeading.current?.focus()
  }, [selectedId])

  useEffect(() => {
    const controller = new AbortController()
    fetch("/articles", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Catalogue request failed")
        return response.json()
      })
      .then((catalogue: unknown) => {
        if (
          !isRecord(catalogue) ||
          !Array.isArray(catalogue.articles) ||
          !catalogue.articles.every(isArticleMetadata)
        ) {
          throw new Error("Invalid catalogue response")
        }
        if (!controller.signal.aborted) {
          setArticles(catalogue.articles)
          setStatus("ready")
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error")
      })
    return () => controller.abort()
  }, [attempt])

  function retryCatalogue() {
    setStatus("loading")
    setAttempt((previous) => previous + 1)
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-6xl flex-col gap-12 px-6 py-8 sm:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <a
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <BookOpenIcon aria-hidden="true" className="size-5" />
          Stateless Reader
        </a>
        <p className="text-sm text-muted-foreground">
          Independent reading. No account.
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-10">
        <div className="flex max-w-2xl flex-col gap-4 py-6 sm:py-10">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            The catalogue
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Find your next good read.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            Ideas worth slowing down for. Browse the previews and choose an
            article, with a clear price for each piece.
          </p>
        </div>

        <ReaderControls reader={reader} />

        {selectedArticle && (
          <section
            aria-label="Selected article"
            className="flex flex-col gap-4 rounded-xl border p-6"
          >
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Selected article
            </p>
            <h2
              ref={selectionHeading}
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight"
            >
              {selectedArticle.title}
            </h2>
            <p className="max-w-2xl leading-relaxed text-muted-foreground">
              {selectedArticle.preview}
            </p>
            <p className="font-medium">
              {selectedArticle.offer.amount} {selectedArticle.offer.unit}
            </p>
            {reader.identity ? (
              <PaymentPanel
                key={`${reader.revision}:${selectedArticle.id}`}
                identity={reader.identity}
                article={selectedArticle}
              />
            ) : (
              <Alert role="status">
                <LockKeyholeIcon aria-hidden="true" />
                <AlertTitle>Full article locked</AlertTitle>
                <AlertDescription>
                  Create or restore a reader phrase to check access. Purchasing
                  is not available yet.
                </AlertDescription>
              </Alert>
            )}
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                setSelectedId(null)
                selectionTrigger.current?.focus()
              }}
            >
              Clear selection
            </Button>
          </section>
        )}

        <section
          aria-labelledby="catalogue-heading"
          className="flex flex-col gap-6"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="catalogue-heading" className="text-xl font-medium">
              Browse articles
            </h2>
            {status === "ready" && (
              <p className="text-sm text-muted-foreground">
                {articles.length} articles
              </p>
            )}
          </div>
          {status === "loading" && (
            <div role="status" className="flex flex-col gap-5">
              <p className="text-sm text-muted-foreground">Loading articles…</p>
              <div
                aria-hidden="true"
                className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
              >
                {[0, 1, 2].map((placeholder) => (
                  <Skeleton key={placeholder} className="h-48 w-full" />
                ))}
              </div>
            </div>
          )}
          {status === "ready" && articles.length === 0 && (
            <Empty role="status">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BookOpenIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No articles available yet</EmptyTitle>
                <EmptyDescription>
                  The publisher has not listed any articles. Check back soon.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={retryCatalogue}>
                  Check again
                </Button>
              </EmptyContent>
            </Empty>
          )}
          {status === "error" && (
            <div className="flex flex-col items-start gap-4">
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertTitle>Could not load articles</AlertTitle>
                <AlertDescription>
                  The catalogue is unavailable. Check your connection and try
                  again.
                </AlertDescription>
              </Alert>
              <Button variant="outline" onClick={retryCatalogue}>
                Try again
              </Button>
            </div>
          )}
          {status === "ready" && articles.length > 0 && (
            <ul
              aria-label="Articles"
              className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {articles.map((article) => (
                <li key={article.id} className="min-w-0">
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle>
                        <h3>{article.title}</h3>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="leading-relaxed text-muted-foreground">
                        {article.preview}
                      </p>
                    </CardContent>
                    <CardFooter className="flex-wrap justify-between gap-3">
                      <p className="font-medium tabular-nums">
                        {article.offer.amount} {article.offer.unit}
                      </p>
                      <Button
                        variant={
                          selectedId === article.id ? "secondary" : "outline"
                        }
                        aria-label={`Select ${article.title}`}
                        aria-pressed={selectedId === article.id}
                        onClick={(event) => {
                          selectionTrigger.current = event.currentTarget
                          setSelectedId(article.id)
                          if (selectedId === article.id)
                            selectionHeading.current?.focus()
                        }}
                      >
                        {selectedId === article.id
                          ? "Selected"
                          : "Select article"}
                        <ArrowUpRightIcon
                          aria-hidden="true"
                          data-icon="inline-end"
                        />
                      </Button>
                    </CardFooter>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="flex flex-wrap justify-between gap-3 py-4 text-xs text-muted-foreground">
        <p>Stateless Reader · A small collection for curious readers.</p>
        <p>Prices in satoshis (sat).</p>
      </footer>
    </div>
  )
}

export default App
