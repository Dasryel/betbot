require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  PermissionsBitField,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require("discord.js");
const { MessageFlags } = require("discord-api-types/v10");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

TOKEN = process.env.TOKEN;

const activeBetsFile = "./activebets.json";
const archivedBetsFile = "./archivedbets.json";
const userDataFile = "./userdata.json";
const permissionsFile = "./permissions.json";
const activeMatches = new Map();

// Load points
let points = {};
if (fs.existsSync(userDataFile)) {
  points = JSON.parse(fs.readFileSync(userDataFile));
}

// Save points
function savePoints() {
  fs.writeFileSync(userDataFile, JSON.stringify(points, null, 2));
}

// Load permissions
function loadPermissions() {
  if (fs.existsSync(permissionsFile)) {
    return JSON.parse(fs.readFileSync(permissionsFile));
  }
  return { allowedRoles: [] };
}

// Save permissions
function savePermissions(data) {
  fs.writeFileSync(permissionsFile, JSON.stringify(data, null, 2));
}

// Check if a user has permission to use betting commands
function hasPermission(member) {
  // Administrators always have permission
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  // Check if user has any of the allowed roles
  const permissions = loadPermissions();
  if (!permissions.allowedRoles || permissions.allowedRoles.length === 0) {
    // If no roles are defined, only administrators can use commands
    return false;
  }

  return member.roles.cache.some((role) =>
    permissions.allowedRoles.includes(role.id)
  );
}

// Helper: Parse HH:MM string to Date object
function parseTimeString(timeStr) {
  const now = new Date();
  const [hour, minute] = timeStr.split(":").map(Number);
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute
  );
}

// Format time nicely
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// Load bets data
function loadActiveBets() {
  if (fs.existsSync(activeBetsFile)) {
    return JSON.parse(fs.readFileSync(activeBetsFile));
  }
  return {};
}

function loadArchivedBets() {
  if (fs.existsSync(archivedBetsFile)) {
    return JSON.parse(fs.readFileSync(archivedBetsFile));
  }
  return {};
}

// Save bets data
function saveActiveBets(data) {
  fs.writeFileSync(activeBetsFile, JSON.stringify(data, null, 2));
}

function saveArchivedBets(data) {
  fs.writeFileSync(archivedBetsFile, JSON.stringify(data, null, 2));
}

// Move a bet from active to archived
function archiveBet(messageId, betData) {
  // Get current data
  const activeBets = loadActiveBets();
  const archivedBets = loadArchivedBets();

  // Remove from active bets
  delete activeBets[messageId];

  // Add to archived bets
  archivedBets[messageId] = betData;

  // Save both files
  saveActiveBets(activeBets);
  saveArchivedBets(archivedBets);
}

// Helper function to normalize emoji for comparison
function normalizeEmoji(emoji) {
  if (typeof emoji === "string") {
    // For custom emoji strings like <:name:id> or <a:name:id>
    const match = emoji.match(/<a?:(\w+):(\d+)>/);
    if (match) {
      return match[2]; // Return the ID
    }
    return emoji; // Return the string as is (unicode emoji)
  }

  // For reaction emoji objects
  return emoji.id || emoji.name;
}

// Helper function to check if two emojis match
function doEmojisMatch(emoji1, emoji2) {
  const norm1 = normalizeEmoji(emoji1);
  const norm2 = normalizeEmoji(emoji2);
  return norm1 === norm2;
}

// Get the display version of emoji (for consistent display)
function getEmojiDisplay(emoji) {
  if (typeof emoji === "string") {
    // Return as-is if it's already a string
    return emoji;
  }
  // For reaction emoji objects
  return emoji.id ? `<:${emoji.name}:${emoji.id}>` : emoji.name;
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const activeBets = loadActiveBets();

  for (const [messageId, match] of Object.entries(activeBets)) {
    if (match.active) {
      activeMatches.set(messageId, match.lockTime);
    }
  }

  console.log(`📌 Restored ${activeMatches.size} active bet(s)`);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    const focusedValue = interaction.options.getFocused();
    const activeBets = loadActiveBets();

    const choices = Object.entries(activeBets)
      .filter(([_, match]) => match.active)
      .map(([msgId, match]) => ({
        name: match.question.slice(0, 100),
        value: msgId,
      }));

    const filtered = choices
      .filter((choice) =>
        choice.name.toLowerCase().includes(focusedValue.toLowerCase())
      )
      .slice(0, 25);

    return interaction.respond(filtered);
  }

  // Role permission commands
  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "assign"
  ) {
    // Only administrators can assign roles
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return interaction.reply({
        content: "❌ You need Administrator permission to use this command.",
        ephemeral: true,
      });
    }

    const role = interaction.options.getRole("role");
    if (!role) {
      return interaction.reply({
        content: "❌ Please select a valid role.",
        ephemeral: true,
      });
    }

    const permissions = loadPermissions();

    // Check if the role is already assigned
    if (
      permissions.allowedRoles &&
      permissions.allowedRoles.includes(role.id)
    ) {
      return interaction.reply({
        content: `⚠️ Role ${role.name} already has permission to use betting commands.`,
        ephemeral: true,
      });
    }

    // Add the role to allowed roles
    if (!permissions.allowedRoles) {
      permissions.allowedRoles = [];
    }
    permissions.allowedRoles.push(role.id);
    savePermissions(permissions);

    return interaction.reply({
      content: `✅ Role ${role.name} can now use betting commands.`,
      ephemeral: true,
    });
  }

  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "unassign"
  ) {
    // Only administrators can unassign roles
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return interaction.reply({
        content: "❌ You need Administrator permission to use this command.",
        ephemeral: true,
      });
    }

    const role = interaction.options.getRole("role");
    if (!role) {
      return interaction.reply({
        content: "❌ Please select a valid role.",
        ephemeral: true,
      });
    }

    const permissions = loadPermissions();

    // Check if the role is not assigned
    if (
      !permissions.allowedRoles ||
      !permissions.allowedRoles.includes(role.id)
    ) {
      return interaction.reply({
        content: `⚠️ Role ${role.name} doesn't have permission to use betting commands.`,
        ephemeral: true,
      });
    }

    // Remove the role from allowed roles
    permissions.allowedRoles = permissions.allowedRoles.filter(
      (id) => id !== role.id
    );
    savePermissions(permissions);

    return interaction.reply({
      content: `✅ Role ${role.name} can no longer use betting commands.`,
      ephemeral: true,
    });
  }

  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "list_roles"
  ) {
    // Only administrators can list roles
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return interaction.reply({
        content: "❌ You need Administrator permission to use this command.",
        ephemeral: true,
      });
    }

    const permissions = loadPermissions();

    if (!permissions.allowedRoles || permissions.allowedRoles.length === 0) {
      return interaction.reply({
        content:
          "ℹ️ No roles are currently assigned to use betting commands. Only administrators can use them.",
        ephemeral: true,
      });
    }

    // Get role names
    const guild = interaction.guild;
    const roleNames = [];

    for (const roleId of permissions.allowedRoles) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        roleNames.push(`- ${role.name}`);
      } else {
        roleNames.push(`- Unknown role (ID: ${roleId})`);
      }
    }

    return interaction.reply({
      content: `**Roles with betting permissions:**\n${roleNames.join("\n")}`,
      ephemeral: true,
    });
  }

  // --- Winner Dropdown Handling ---
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "select-winner-bet"
  ) {
    const messageId = interaction.values[0];
    const activeBets = loadActiveBets();
    const match = activeBets[messageId];

    if (!match || !match.active) {
      return interaction.reply({
        content: "❗ That bet is no longer active.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const buttons = match.options.map((opt, index) =>
      new ButtonBuilder()
        .setCustomId(`winner-${messageId}-${index}`)
        .setLabel(`${opt.label}`)
        .setEmoji(opt.emoji)
        .setStyle(ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder().addComponents(buttons);

    return interaction.reply({
      content: `🏆 Select the winner for:\n**${match.question}**`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (interaction.isButton() && interaction.customId.startsWith("winner-")) {
    const [, messageId, index] = interaction.customId.split("-");
    const activeBets = loadActiveBets();
    const match = activeBets[messageId];
    const selectedOption = match.options[parseInt(index)];

    if (!match || !selectedOption) {
      return interaction.reply({
        content: "❌ Could not find the selected bet or option.",
        flags: 64,
      });
    }

    const wEmoji = selectedOption.emoji;
    const betId = messageId;

    const modal = new ModalBuilder()
      .setCustomId(`award-points-${messageId}-${encodeURIComponent(wEmoji)}`)
      .setTitle("Award Points");

    const winnerInput = new TextInputBuilder()
      .setCustomId("winner-points")
      .setLabel("Points for Winners")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const looserInput = new TextInputBuilder()
      .setCustomId("looser-points")
      .setLabel("Points to Subtract from Losers")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row1 = new ActionRowBuilder().addComponents(winnerInput);
    const row2 = new ActionRowBuilder().addComponents(looserInput);

    modal.addComponents(row1, row2);
    await interaction.showModal(modal);
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith("award-points-")
  ) {
    // First, acknowledge the interaction immediately to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Parse the customId correctly
    const parts = interaction.customId.split("-");
    const messageId = parts[2];
    const wEmoji = decodeURIComponent(parts[3]);

    const winnerValue = parseInt(
      interaction.fields.getTextInputValue("winner-points")
    );
    const looserValue = parseInt(
      interaction.fields.getTextInputValue("looser-points")
    );

    // Validate input is a number
    if (isNaN(winnerValue) || isNaN(looserValue)) {
      return interaction.editReply({
        content: "❌ Please enter valid numbers for points.",
      });
    }

    const activeBets = loadActiveBets();
    const userData = fs.existsSync(userDataFile)
      ? JSON.parse(fs.readFileSync(userDataFile))
      : {};

    const match = activeBets[messageId];
    if (!match) {
      return interaction.editReply({
        content: "❌ Could not find the selected bet.",
      });
    }

    try {
      const channel = interaction.channel;
      const message = await channel.messages.fetch(messageId);

      // Find the winning option label
      const winOption = match.options.find((opt) =>
        doEmojisMatch(opt.emoji, wEmoji)
      );
      if (!winOption) {
        return interaction.editReply({
          content: "❌ Could not find the winning option.",
        });
      }
      const winLabel = winOption.label;

      // For collecting summarized results to show the admin
      const results = [];
      const winners = [];
      const losers = [];

      // Get vote counts for each option first
      for (const option of match.options) {
        option.votes = 0; // Initialize vote count
      }

      // Count votes from reactions
      for (const [emojiKey, reaction] of message.reactions.cache) {
        // Find the corresponding option by comparing normalized emojis
        const option = match.options.find((opt) =>
          doEmojisMatch(opt.emoji, reaction.emoji)
        );

        if (option) {
          // Count non-bot users who reacted
          const users = await reaction.users.fetch();
          option.votes = Array.from(users.values()).filter(
            (user) => !user.bot
          ).length;
        }
      }

      // Process all the reactions and update user points
      for (const [emojiKey, reaction] of message.reactions.cache) {
        // Determine if this reaction matches the winning emoji
        const isWinner = doEmojisMatch(reaction.emoji, wEmoji);

        // Get the option label for this reaction
        const optionForReaction = match.options.find((opt) =>
          doEmojisMatch(opt.emoji, reaction.emoji)
        );

        const votedLabel = optionForReaction
          ? optionForReaction.label
          : "Unknown";

        const users = await reaction.users.fetch();
        for (const [userId, user] of users) {
          // Skip bots
          if (user.bot) continue;

          // Update user points
          const uid = userId;
          if (!userData[uid]) userData[uid] = { points: 0 };

          const change = isWinner
            ? parseInt(winnerValue)
            : -parseInt(looserValue);
          userData[uid].points = Math.max(
            0,
            userData[uid].points + parseInt(change)
          );

          // Add to summary for admin
          results.push(
            `${user.username}: ${
              isWinner ? `✅ **+${winnerValue}**` : `❌ **-${looserValue}**`
            }`
          );

          // Track winners and losers
          if (isWinner) {
            winners.push(`${user.username} (+${winnerValue})`);
          } else {
            losers.push(`${user.username} (-${looserValue})`);
          }

          // Create a personalized embed for this specific user
          const userEmbed = {
            color: isWinner ? 0x00ff00 : 0xff0000, // Green for winners, red for losers
            title: `${match.question} - Results`,
            fields: [
              {
                name: "Status",
                value: isWinner ? "✅ You Won" : "❌ You Lost",
                inline: true,
              },
              {
                name: "Points",
                value: isWinner
                  ? `+${winnerValue} points`
                  : `-${looserValue} points`,
                inline: true,
              },
              {
                name: "\u200B",
                value: "\u200B",
                inline: false,
              },
              {
                name: "Your Vote",
                value: votedLabel,
                inline: true,
              },
              {
                name: "Winner",
                value: winLabel,
                inline: true,
              },
              {
                name: "Current Points",
                value: `${userData[uid].points}`,
                inline: false,
              },
            ],
            footer: {
              text: `Betting System`,
            },
          };

          // Send the personalized embed to this user through a DM
          try {
            await user.send({ embeds: [userEmbed] });
          } catch (err) {
            console.error(`Failed to DM user ${user.username}:`, err);
          }
        }
      }

      // Create the archived bet record with detailed information
      const archivedBet = {
        ...match,
        active: false,
        winnerEmoji: wEmoji,
        winnerLabel: winLabel,
        closedAt: Date.now(),
        winnerPoints: winnerValue,
        loserPoints: looserValue,
        winners: winners,
        losers: losers,
      };

      // Archive the bet (this removes it from active bets and adds to archived bets)
      archiveBet(messageId, archivedBet);

      // Remove from active matches
      activeMatches.delete(messageId);

      // Save user data
      fs.writeFileSync(userDataFile, JSON.stringify(userData, null, 2));

      // Send a summary reply to the admin (interaction initiator)
      const adminEmbed = {
        color: 0x3498db, // Blue color for admin summary
        title: `Bet Results: ${match.question}`,
        description: `**Winner: ${winLabel}**\n\nPoint distribution:`,
        fields: results.map((result) => {
          return {
            name: "\u200B",
            value: result,
            inline: false,
          };
        }),
        footer: {
          text: `Betting System`,
        },
      };

      // Create and update the bet message with results - without displaying all participant results
      const resultEmbed = new EmbedBuilder()
        .setColor(0xf1c40f) // Gold color for closed bets
        .setTitle(`${match.question}`)
        .setDescription(` **CLOSED** - Winning option: **${winLabel}**`)
        .addFields(
          { name: "\u200B", value: " **Betting Options**", inline: false },
          ...match.options.map((opt) => {
            // Calculate percentage of people who reacted to this option
            const totalVotes = match.options.reduce(
              (sum, option) => sum + option.votes,
              0
            );
            const percentage =
              totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
            const isWinner = doEmojisMatch(opt.emoji, wEmoji);

            return {
              name: `${opt.emoji} ${opt.label}`,
              value: `${percentage}% ${isWinner ? "🏆" : ""}`,
              inline: true,
            };
          })
        )
        .setFooter({
          text: `Bet closed • Winners: +${winnerValue}  • Losers: -${looserValue} `,
        });

      // Update the original message with the results embed
      await message.edit({ content: "", embeds: [resultEmbed] });

      // Use editReply instead of reply since we deferred above
      await interaction.editReply({
        content: `✅ **${winLabel}** selected as winner for **${match.question}**`,
        embeds: [adminEmbed],
      });
    } catch (error) {
      console.error("❌ Error in winner selection:", error);
      return interaction.editReply({
        content: `❌ An error occurred while processing the winner selection: ${error.message}`,
      });
    }
  }
  // --- Slash Command: /bet ---
  if (interaction.isChatInputCommand() && interaction.commandName === "bet") {
    // Check if user has permission
    if (!hasPermission(interaction.member)) {
      return interaction.reply({
        content: "❌ You don't have permission to use this command.",
        ephemeral: true,
      });
    }

    const question = interaction.options.getString("text");
    const timeStr = interaction.options.getString("time");
    const optionStr = interaction.options.getString("options");

    const lockTime = new Date(parseTimeString(timeStr).getTime());
    if (isNaN(lockTime) || lockTime < Date.now()) {
      return interaction.reply({
        content: "❗ Invalid or past lock time.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const parsedOptions = optionStr.split("|").map((entry) => {
      const trimmed = entry.trim();

      // Handle custom emojis in format <:name:id> or <a:name:id>
      const customEmojiMatch = trimmed.match(/(.*?)(<a?:.+:\d+>)$/);
      if (customEmojiMatch) {
        const label = customEmojiMatch[1].trim();
        const emoji = customEmojiMatch[2].trim();
        return label && emoji ? { label, emoji } : null;
      }

      // Original logic for standard emojis
      const lastSpace = trimmed.lastIndexOf(" ");
      if (lastSpace === -1) return null;
      const label = trimmed.substring(0, lastSpace).trim();
      const emoji = trimmed.substring(lastSpace + 1).trim();
      return label && emoji ? { label, emoji } : null;
    });

    if (parsedOptions.some((opt) => opt === null)) {
      return interaction.reply({
        content: "❗ Invalid format for options. Use: `Label Emoji|...`",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Create a nice embed for the bet
      const betEmbed = new EmbedBuilder()
        .setColor(0x3498db) // Nice blue color
        .setTitle(`${question}`)
        .setDescription(
          `React with one of the options below to place your bet!`
        )
        .addFields(
          { name: "\u200B", value: "**Options**", inline: false },
          ...parsedOptions.map((opt) => {
            return {
              name: `${opt.emoji} ${opt.label}`,
              value: "\u200B",
              inline: true,
            };
          })
        )
        .setFooter({
          text: `Voting locks at ${timeStr} • React to place your bet!`,
        });

      const sentMessage = await interaction.channel.send({
        embeds: [betEmbed],
      });

      // Add reactions for voting
      for (const opt of parsedOptions) {
        // Check if this is a custom emoji (in <:name:id> format)
        const customEmojiMatch =
          opt.emoji.match(/<:(.+):(\d+)>/) || opt.emoji.match(/<a:(.+):(\d+)>/);

        if (customEmojiMatch) {
          // For custom emojis, we need the ID
          const emojiId = customEmojiMatch[2];
          await sentMessage.react(emojiId);
        } else {
          // Regular unicode emoji
          await sentMessage.react(opt.emoji);
        }
      }

      // Only store minimal needed data in active bets
      const activeBets = loadActiveBets();
      activeBets[sentMessage.id] = {
        question,
        options: parsedOptions,
        lockTime: lockTime.getTime(),
        active: true,
        createdAt: Date.now(),
        createdBy: interaction.user.id,
      };

      saveActiveBets(activeBets);
      activeMatches.set(sentMessage.id, lockTime.getTime());

      return interaction.editReply({ content: "✅ Bet created!" });
    } catch (error) {
      console.error("❌ Failed to create bet:", error);
      return interaction.editReply({
        content: "❌ Something went wrong while creating the bet.",
      });
    }
  }

  // --- Slash Command: /winner ---
  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "winner"
  ) {
    // Check if user has permission
    if (!hasPermission(interaction.member)) {
      return interaction.reply({
        content: "❌ You don't have permission to use this command.",
        ephemeral: true,
      });
    }

    const selectedMatchId = interaction.options.getString("match");
    const activeBets = loadActiveBets();
    const match = activeBets[selectedMatchId];

    if (!match || !match.active) {
      return interaction.reply({
        content: "❌ Invalid or inactive match selected.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const buttons = match.options.map((opt, index) =>
      new ButtonBuilder()
        .setCustomId(`winner-${selectedMatchId}-${index}`)
        .setLabel(opt.label)
        .setEmoji(opt.emoji)
        .setStyle(ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder().addComponents(buttons);

    return interaction.reply({
      content: `🏆 Select the winner for:\n**${match.question}**`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }
  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "mybalance"
  ) {
    const userId = interaction.user.id;

    const userData = fs.existsSync(userDataFile)
      ? JSON.parse(fs.readFileSync(userDataFile))
      : {};

    const userPoints = userData[userId] ? userData[userId].points : 0;

    interaction.reply({
      content: "Your current balance: " + userPoints,
      flags: MessageFlags.Ephemeral,
    });
  }

  // --- Slash Command: /top ---
  if (interaction.isChatInputCommand() && interaction.commandName === "top") {
    try {
      // Read the latest data from the file
      const userData = fs.existsSync(userDataFile)
        ? JSON.parse(fs.readFileSync(userDataFile))
        : {};

      // Convert user data to array and sort by points (highest to lowest)
      const sortedUsers = Object.entries(userData)
        .map(([userId, data]) => ({
          id: userId,
          points: data.points || 0,
        }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 10); // Get top 10

      if (sortedUsers.length === 0) {
        return interaction.reply({
          content: "No users have earned points yet.",
          ephemeral: true,
        });
      }

      // Create an embed for the leaderboard
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f) // Gold color
        .setTitle("🏆 Points Leaderboard")
        .setDescription("Top 10 users with the highest points");

      // Fetch users and add them to the embed
      try {
        let leaderboardText = "";
        let rank = 1;

        for (const userData of sortedUsers) {
          try {
            // Try to fetch the user
            const user = await client.users.fetch(userData.id);

            // Create medal emojis for top 3
            let medal = "";
            if (rank === 1) medal = "🥇 ";
            else if (rank === 2) medal = "🥈 ";
            else if (rank === 3) medal = "🥉 ";
            else medal = `${rank}. `;

            leaderboardText += `${medal}**${user.username}**: ${userData.points} points\n`;
            rank++;
          } catch (error) {
            // If we can't fetch the user, display their ID
            leaderboardText += `${rank}. Unknown User: ${userData.points} points\n`;
            rank++;
          }
        }

        embed.addFields({ name: "Rankings", value: leaderboardText });

        return interaction.reply({
          embeds: [embed],
        });
      } catch (error) {
        console.error("Error fetching users for leaderboard:", error);
        return interaction.reply({
          content: "An error occurred while creating the leaderboard.",
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error("Error reading user data for leaderboard:", error);
      return interaction.reply({
        content: "An error occurred while generating the leaderboard.",
        ephemeral: true,
      });
    }
  }
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  // Fetch partials if necessary
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (err) {
      console.error("❌ Failed to fetch partial reaction:", err);
      return;
    }
  }

  if (reaction.message.partial) {
    try {
      await reaction.message.fetch();
    } catch (err) {
      console.error("❌ Failed to fetch partial message:", err);
      return;
    }
  }

  const messageId = reaction.message.id;
  const lockTime = activeMatches.get(messageId);
  if (!lockTime) return;

  // Load match data from file
  const activeBets = loadActiveBets();
  const match = activeBets[messageId];
  if (!match || !match.options) return;

  // Get list of valid emojis using our helper functions
  const allowedEmojis = match.options.map((opt) => normalizeEmoji(opt.emoji));

  // Normalize the current emoji for comparison
  const currentEmojiId = normalizeEmoji(reaction.emoji);

  // Check if the reaction's emoji is allowed
  const isAllowed = allowedEmojis.includes(currentEmojiId);

  // ❌ Not allowed emoji
  if (!isAllowed) {
    console.log(
      `Removing reaction: ${
        reaction.emoji.name || reaction.emoji.id
      } is not in allowed list:`,
      allowedEmojis
    );
    return reaction.users.remove(user.id);
  }

  // ⏱️ Locked
  if (Date.now() > lockTime) {
    // Update the embed to show it's locked if it hasn't been updated yet
    if (match.active && !match.lockMessageSent) {
      try {
        const lockedEmbed = EmbedBuilder.from(reaction.message.embeds[0])
          .setColor(0xff9800) // Orange for locked bets
          .setTitle(`🔒 LOCKED: ${match.question}`)
          .setFooter({
            text: `Voting locked • Awaiting results...`,
          });

        await reaction.message.edit({ embeds: [lockedEmbed] });

        // Mark that we've sent the lock message
        match.lockMessageSent = true;
        match.lockedAt = Date.now();
        activeBets[messageId] = match;
        saveActiveBets(activeBets);
      } catch (error) {
        console.error("❌ Failed to update locked bet message:", error);
      }
    }
    return reaction.users.remove(user.id);
  }

  const allReactions = reaction.message.reactions.cache;

  for (const [, r] of allReactions) {
    // Skip the current reaction using our helper function
    if (doEmojisMatch(r.emoji, reaction.emoji)) {
      continue;
    }

    try {
      // 🔄 Fetch full list of users for this reaction
      const users = await r.users.fetch();
      if (users.has(user.id)) {
        await r.users.remove(user.id);
      }
    } catch (err) {
      console.error("❌ Failed to fetch reaction users:", err);
    }
  }
});

// Timer to check for locked bets that need status updates
setInterval(async () => {
  if (activeMatches.size === 0) return;

  const now = Date.now();
  const activeBets = loadActiveBets();

  for (const [messageId, lockTime] of activeMatches.entries()) {
    if (now > lockTime) {
      const match = activeBets[messageId];
      if (match && match.active && !match.lockMessageSent) {
        try {
          // Find the channel and message
          const guild = client.guilds.cache.first();
          if (!guild) continue;

          const channels = await guild.channels.fetch();
          let targetMessage = null;

          for (const [_, channel] of channels) {
            if (!channel.isTextBased()) continue;

            try {
              const message = await channel.messages
                .fetch(messageId)
                .catch(() => null);
              if (message) {
                targetMessage = message;
                break;
              }
            } catch (err) {
              // Skip if can't access channel or message not found
            }
          }

          if (targetMessage) {
            const lockedEmbed = EmbedBuilder.from(targetMessage.embeds[0])
              .setColor(0xff9800) // Orange for locked bets
              .setTitle(`🔒 LOCKED: ${match.question}`)
              .setFooter({
                text: `Voting locked • Awaiting results...`,
              });

            await targetMessage.edit({ embeds: [lockedEmbed] });

            // Mark that we've sent the lock message
            match.lockMessageSent = true;
            match.lockedAt = now;
            activeBets[messageId] = match;
            saveActiveBets(activeBets);
          }
        } catch (error) {
          console.error(
            `❌ Failed to update locked bet message ${messageId}:`,
            error
          );
        }
      }
    }
  }
}, 60000); // Check every minute

client.login(process.env.TOKEN);
