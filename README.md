# House Money

A private poker bankroll tracker for a home game. House Money records buy-ins,
cash-outs, session times, and each player's lifetime results. All game data stays
in this laptop's browser storage.

## Run locally

1. Open a terminal in this folder.
2. Run `npm install` the first time only.
3. Run `npm run dev`.
4. Open `http://localhost:3000`.

Keep the terminal window open while using the app. The app saves changes
automatically in the browser on this laptop.

## First use

Add at least two players, then use **Start a game**. First select who is playing,
then enter the stakes and opening buy-ins. During the game, use the buy-in and
cash-out buttons beside each player. All past results are available by expanding
a player in the Players tab.

## Safety check

A live session cannot be closed until every player has cashed out and the total
cash-outs exactly match the total buy-ins. This prevents an unbalanced night
from being committed to player history.
