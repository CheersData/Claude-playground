#!/bin/bash
set -e
cd /home/deploy/Claude-playground/controlla-me
echo "Resetting staging area..."
git reset HEAD
echo "Adding files (excluding .venv and logs)..."
git add -A -- . ':!music/.venv' ':!music/logs'
echo "Committing..."
git commit -m "feat: 8 articoli blog SEO, sitemap /affitti, status.json refresh, music phase update

- 8 articoli blog convertiti da markdown a TypeScript ArticleSection[]
- Sitemap aggiornata con /affitti
- status.json aggiornati: trading (paper active), music (fondamenta complete), QA, operations
- Fix isWaitingForBoss auto-continuation (opt-out pattern)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
echo "COMMIT DONE"
