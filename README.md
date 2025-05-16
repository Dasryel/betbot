# BetBot - Discord Betting Bot

A Discord bot that lets users create, vote on, and resolve using slash commands and reactions.

## Follow these steps to set up and run the bot locally:



# 1. Open CMD and clone the project
```
git clone https://github.com/Dasryel/betbot
```

# 2. Install required dependencies
```
npm install
```

# 3. Create a .env file and add your credentials
```
TOKEN=TOKENID
CLIENT=CLIENT_ID
```

# 4. Register the latest commands
```
node commands.js
```

# 5. Start the bot
```
node bot.js
```

# COMMANDS:

/bet <title> <time> <label1 1️⃣ | label2 2️⃣>
→ Creates a new bet with custom options

/winner <title>
→ Declares the winner of a bet

/balance
→ Shows your current betting balance

/top
→ Displays the top 10 bettors

/assign <role>
→ Grants a role permission to use /bet and /winner commands
