# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `Egge21M/stateless-reader`.
Use the `gh` CLI from this repo; outside it, pass
`--repo Egge21M/stateless-reader`.

## Operations

- Create: `gh issue create --title "..." --body-file <file>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`.
  Use label and state filters as needed.
- Update body: `gh issue edit <number> --body-file <file>`.
- Comment: `gh issue comment <number> --body-file <file>`.
- Apply or remove labels: `gh issue edit <number> --add-label "..." --remove-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

For multiline bodies, write the exact text to a temporary file and use
`--body-file`.

When a skill says “publish to the issue tracker”, create a GitHub issue.
When it says “fetch the relevant ticket”, read the issue and its comments.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares issue and PR numbers. For an ambiguous reference, try
`gh pr view <number>` and fall back to `gh issue view <number>`.

## Wayfinding

A map is one issue labelled `wayfinder:map`, with Notes, Decisions-so-far,
and Fog sections. Child tickets use `wayfinder:<type>` labels:
`research`, `prototype`, `grilling`, or `task`. Create missing labels when needed.

Link children using GitHub sub-issues:
`gh api --method POST repos/Egge21M/stateless-reader/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`.
Retrieve database IDs with
`gh api repos/Egge21M/stateless-reader/issues/<number> --jq .id`.

If sub-issues are unavailable, put `Part of #<parent>` at the top of each
child body and maintain a task list in the map.

Record blockers using native issue dependencies:
`gh api --method POST repos/Egge21M/stateless-reader/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
If unavailable, use a `Blocked by: #<number>` line in the child body.

Select the first open, unassigned child in map order with no open blockers.
Claim it with `gh issue edit <number> --add-assignee @me`.
To resolve it, comment with the result, close the ticket, and add a short
result and link to the map's Decisions-so-far section.
