require("dotenv").config();
const token = process.env.TOKEN;

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
} = require("discord.js");
const fs = require("fs");

// Initialize the client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Path to the file where you want to save points data
const pointsFilePath = "./points.json";

// Load points from the file
let userPoints = {};
try {
  userPoints = JSON.parse(fs.readFileSync(pointsFilePath, "utf8"));
} catch (error) {
  console.log("No previous points data found, starting fresh.");
}

// Save points to the file
function savePoints() {
  fs.writeFileSync(pointsFilePath, JSON.stringify(userPoints, null, 2));
}

// Update points
function updatePoints(userId, pointsToAdd) {
  if (!userPoints[userId]) {
    userPoints[userId] = 0;
  }
  userPoints[userId] += pointsToAdd;
  savePoints();
}

// Store active matches and lock times
const activeMatches = new Map(); // messageId -> lockTimestamp

client.login(token);

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Command to create a match and allow predictions
  if (message.content.startsWith("!match")) {
    // Check if the user has admin permissions
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply("❗ Only admins can create a match.");
    }

    const args = message.content.slice(6).trim().split("|");
    if (args.length < 2) {
      return message.reply(
        "❗ Usage: `!match Team1 vs Team2 | HH:MM` (24h clock)"
      );
    }

    const matchInfo = args[0].trim();
    const matchTime = args[1].trim();

    // Extract team names
    const [team1, team2] = matchInfo.split("vs").map((t) => t.trim());

    const now = new Date();
    const [hour, minute] = matchTime.split(":").map(Number);
    const matchStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute
    );
    const lockTime = new Date(matchStart.getTime() - 5 * 60000);

    if (lockTime < now) {
      return message.reply("❗ Match must be scheduled in the future!");
    }

    // Format lock time
    const lockHours = lockTime.getHours().toString().padStart(2, "0");
    const lockMinutes = lockTime.getMinutes().toString().padStart(2, "0");
    const formattedLockTime = `${lockHours}:${lockMinutes}`;

    const sentMessage = await message.channel.send(
      `**----------- ${team1.toUpperCase()} VS ${team2.toUpperCase()} PREDICTION -----------**\n\n` +
        `React with 🔵 for **${team1}** or 🔴 for **${team2}**\n` +
        `🔒 **Voting locks at ${formattedLockTime}**`
    );
    await sentMessage.react("🔵");
    await sentMessage.react("🔴");

    // Save match lock time in memory
    activeMatches.set(sentMessage.id, lockTime.getTime());

    // Save match info to match.json
    const matchFile = "match.json";
    const matchData = fs.existsSync(matchFile)
      ? JSON.parse(fs.readFileSync(matchFile))
      : {};

    matchData[sentMessage.id] = {
      team1: team1,
      team2: team2,
    };

    fs.writeFileSync(matchFile, JSON.stringify(matchData, null, 2));
  }

  // Command: Declare winner
  if (message.content.startsWith("!winner")) {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply("❗ Only admins can use this command.");
    }

    const args = message.content.split(" ");
    if (args.length < 3) {
      return message.reply("❗ Usage: `!winner <messageID> <team1|team2>`");
    }

    const messageId = args[1];
    const winningTeamKey = args[2].toLowerCase(); // "team1" or "team2"

    try {
      const matchData = JSON.parse(fs.readFileSync("match.json"));
      const matchInfo = matchData[messageId];

      if (!matchInfo || !matchInfo.team1 || !matchInfo.team2) {
        return message.reply("❗ Could not find team names for this match.");
      }

      const team1Name = matchInfo.team1;
      const team2Name = matchInfo.team2;
      const winnerName = winningTeamKey === "team1" ? team1Name : team2Name;

      const channelMessages = await message.channel.messages.fetch({
        around: messageId,
        limit: 1,
      });
      const matchMessage = channelMessages.get(messageId);

      if (!matchMessage)
        return message.reply("❗ Could not find the match message.");

      const blueVotes = await matchMessage.reactions.cache
        .get("🔵")
        ?.users.fetch();
      const redVotes = await matchMessage.reactions.cache
        .get("🔴")
        ?.users.fetch();

      const pointsData = fs.existsSync("points.json")
        ? JSON.parse(fs.readFileSync("points.json"))
        : {};

      const updatePlayer = async (user, votedTeamKey) => {
        if (user.bot) return;

        const votedTeamName = votedTeamKey === "team1" ? team1Name : team2Name;
        const isCorrect = votedTeamKey === winningTeamKey;
        const pointsChange = isCorrect ? 3 : -1;

        const currentPoints = pointsData[user.id] || 0;
        const newPoints = isCorrect
          ? currentPoints + pointsChange
          : Math.max(0, currentPoints + pointsChange); // Prevent negative

        pointsData[user.id] = newPoints;

        try {
          await user.send(
            `**----------- ${team1Name.toUpperCase()} VS ${team2Name.toUpperCase()} RESULT -----------**\n\n` +
              (pointsChange >= 0
                ? `✅ **You Won**: **+${pointsChange}** points\n`
                : `❌ **You Lost**: **${pointsChange}** point${
                    pointsChange === -1 ? "" : "s"
                  }\n`) +
              `\n**Your Vote**: ${votedTeamName}` +
              `\n**Winner**: ${winnerName}` +
              `\n\n**Your Current Points**: ${newPoints}`
          );
        } catch (err) {
          console.error(`Failed to DM ${user.username}:`, err.message);
        }
      };

      if (blueVotes) {
        for (const [, user] of blueVotes) {
          await updatePlayer(user, "team1");
        }
      }

      if (redVotes) {
        for (const [, user] of redVotes) {
          await updatePlayer(user, "team2");
        }
      }

      fs.writeFileSync("points.json", JSON.stringify(pointsData, null, 2));
      message.reply(`✅ Winner set to **${winnerName}** and points updated.`);
    } catch (error) {
      console.error(error);
      message.reply("❌ An error occurred while processing the match.");
    }
  }

  // Command: Check points
  if (message.content === "!points") {
    try {
      const pointsData = fs.existsSync("points.json")
        ? JSON.parse(fs.readFileSync("points.json", "utf8"))
        : {};

      const points = pointsData[message.author.id] || 0;
      message.reply(`🏆 You have **${points}** points!`);
    } catch (err) {
      console.error("Failed to read points.json:", err.message);
      message.reply("⚠️ Could not retrieve your points right now.");
    }
  }

  if (message.content === "!top") {
    let pointsData;

    try {
      const fileContent = fs.readFileSync("points.json", "utf8");
      pointsData = JSON.parse(fileContent);

      if (!pointsData || Object.keys(pointsData).length === 0) {
        return message.reply("The leaderboard is currently empty.");
      }
    } catch (error) {
      console.error("Failed to read or parse points.json:", error);
      return message.reply("The leaderboard is not available right now.");
    }

    // Sort and display top 10 users
    const top = Object.entries(pointsData)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(
        ([userId, points], index) =>
          `${index + 1}. <@${userId}> - ${points} points`
      )
      .join("\n");

    message.channel.send(`🏆 **Top 10 Players**:\n${top}`);
  }
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  // Handle partials
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error("❌ Failed to fetch reaction:", error);
      return;
    }
  }

  const messageId = reaction.message.id;
  const emojiName = reaction.emoji.name;
  const lockTime = activeMatches.get(messageId);

  // If it's not 🔵 or 🔴, remove it immediately
  if (emojiName !== "🔵" && emojiName !== "🔴") {
    return reaction.users.remove(user.id);
  }

  // If match isn't active, ignore
  if (!lockTime) return;

  // Match is locked – remove the reaction if it's too late
  if (Date.now() > lockTime) {
    return reaction.users.remove(user.id);
  }

  // Prevent double voting
  const otherEmoji = emojiName === "🔵" ? "🔴" : "🔵";

  const otherReaction = reaction.message.reactions.cache.get(otherEmoji);
  if (otherReaction?.users.cache.has(user.id)) {
    await otherReaction.users.remove(user.id);
  }
});

client.on("messageReactionRemove", async (reaction, user) => {
  if (user.bot) return;

  // Handle partials
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error("❌ Failed to fetch removed reaction:", error);
      return;
    }
  }

  const messageId = reaction.message.id;
  const lockTime = activeMatches.get(messageId);

  if (!lockTime) return;

  // Match is locked, notify the user that reaction removal is not allowed
  if (Date.now() > lockTime) {
    try {
      await user.send(
        "🔒 Voting for that match is locked. You cannot change your reaction."
      );
    } catch (err) {
      console.error(`❌ Failed to DM ${user.username}:`, err.message);
    }
  }
});

client.on("ready", () => {
  console.log(`Bot is ready and logged in as ${client.user.tag}`);
});
