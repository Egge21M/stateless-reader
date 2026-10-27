import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { PaymentPanel } from "@/components/payment-panel"
import type { ArticleOffer } from "@stateless-reader/core"
import { useReader } from "@/lib/use-reader"
import { ReaderControls } from "@/components/reader-controls"
import { useEffect, useRef, useState } from "react"
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  LockKeyholeIcon,
  TriangleAlertIcon,
  UserRoundIcon,
} from "lucide-react"

import { Separator } from "@/components/ui/separator"
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
  offer: ArticleOffer
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
  const [profileOpen, setProfileOpen] = useState(false)
  const [profilePresent, setProfilePresent] = useState(false)
  const profileTrigger = useRef<HTMLButtonElement>(null)
  const profileReturn = useRef<HTMLButtonElement | null>(null)
  // Keep access checks paused through the profile exit animation so dialogs never overlap.
  function changeProfile(open: boolean) {
    if (open) setProfilePresent(true)
    else reader.dismissProfile()
    setProfileOpen(open)
  }
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
    <div className="mx-auto flex min-h-svh max-w-7xl flex-col gap-10 px-5 py-5 sm:gap-14 sm:px-10 sm:py-7">
      <Dialog
        open={profileOpen}
        onOpenChange={changeProfile}
        onOpenChangeComplete={(open) => {
          if (!open) setProfilePresent(false)
        }}
      >
        <header className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <p className="publication-label">Independent reading</p>
            <DialogTrigger
              ref={profileTrigger}
              onClick={(event) => {
                profileReturn.current = event.currentTarget
              }}
              render={<Button variant="ghost" />}
            >
              <UserRoundIcon aria-hidden="true" data-icon="inline-start" />
              Profile
            </DialogTrigger>
          </div>
          <div className="masthead">
            <h1>
              <a href="/">
                Stateless Reader<span className="text-primary">.</span>
              </a>
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground sm:text-sm">
            <p>A small collection for curious readers.</p>
            <p>Individual articles. No subscription. No account.</p>
          </div>
        </header>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
          finalFocus={() =>
            profileReturn.current?.isConnected
              ? profileReturn.current
              : profileTrigger.current
          }
        >
          <DialogHeader>
            <DialogTitle>Your reader profile</DialogTitle>
            <DialogDescription>
              Your keys, your reading. No registration or publisher account.
            </DialogDescription>
          </DialogHeader>
          {profileOpen && <ReaderControls reader={reader} />}
        </DialogContent>
      </Dialog>

      <main className="flex flex-1 flex-col gap-12">
        {selectedArticle && (
          <section
            aria-label="Selected article"
            className="reading-area flex flex-col gap-5"
          >
            <p className="publication-label">Selected article</p>
            <h2
              ref={selectionHeading}
              tabIndex={-1}
              className="font-heading text-4xl leading-tight tracking-tight sm:text-6xl"
            >
              {selectedArticle.title}
            </h2>
            <p className="max-w-2xl font-heading text-xl leading-relaxed text-muted-foreground">
              {selectedArticle.preview}
            </p>
            <p className="font-medium">
              {selectedArticle.offer.amount} {selectedArticle.offer.unit}
            </p>
            {reader.identity && !profilePresent ? (
              <PaymentPanel
                key={`${reader.revision}:${selectedArticle.id}`}
                identity={reader.identity}
                article={selectedArticle}
                readingHeading={selectionHeading}
              />
            ) : (
              <div className="flex flex-col items-start gap-4">
                <Alert role="status">
                  <LockKeyholeIcon aria-hidden="true" />
                  <AlertTitle>Full article locked</AlertTitle>
                  <AlertDescription>
                    Create or restore a reader phrase to check access or
                    purchase this article.
                  </AlertDescription>
                </Alert>
                <Button
                  onClick={(event) => {
                    profileReturn.current = event.currentTarget
                    changeProfile(true)
                  }}
                >
                  Set up reading access
                </Button>
              </div>
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
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="catalogue-heading" className="publication-label">
                Browse articles
              </h2>
              {status === "ready" && (
                <p className="text-sm text-muted-foreground">
                  {articles.length} articles
                </p>
              )}
            </div>
            <Separator />
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
            <ul aria-label="Articles" className="editorial-grid">
              {articles.map((article, index) => (
                <li
                  key={article.id}
                  className="min-w-0"
                  data-lead={index === 0 || undefined}
                >
                  <Card variant="editorial" className="h-full">
                    <CardHeader>
                      <p className="publication-label">
                        {index === 0
                          ? "The lead story"
                          : `Article ${String(index + 1).padStart(2, "0")}`}
                      </p>
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
                          : "Read article"}
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

      <footer className="flex flex-col gap-5 pt-5 pb-4">
        <Separator />
        <div className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
          <p>Stateless Reader · Ideas worth slowing down for.</p>
          <p>
            Pay for a piece. Keep the perspective. Prices in satoshis (sat).
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
