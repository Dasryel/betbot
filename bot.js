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
  ).getTime();
}

function createDiscordTimestamp(timestamp, format = 't') {
  // Discord timestamp formats:
  // t: Short time (e.g., 9:30 PM)
  // T: Long time (e.g., 9:30:00 PM)
  // d: Short date (e.g., 07/10/2021)
  // D: Long date (e.g., July 10, 2021)
  // f: Short date/time (e.g., July 10, 2021 9:30 PM)
  // F: Long date/time (e.g., Saturday, July 10, 2021 9:30 PM)
  // R: Relative time (e.g., 2 months ago, in an hour)
  
  return `<t:${Math.floor(timestamp / 1000)}:${format}>`;
}

function formatTime(time) {
  return createDiscordTimestamp(time);
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

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Calculate suggested point values based on odds and bet type
function calculatePointSuggestions(match) {
  const options = match.options;
  
  // Handle empty options array
  if (!options || options.length === 0) {
    return { winnerPoints: 555, loserPoints: 555 };
  }
  
  // Find the winning option
  const winningOption = options.find(option => option.isWinner === true);
  
  // If no winning option is marked, we can't calculate points
  if (!winningOption) {
    return { winnerPoints: 555, loserPoints: 555 };
  }
  
  // Get total votes directly from match data
  const totalVotes = match.totalBetsPlaced || 0;
  
  // Get winning option's votes
  const winningVotes = winningOption.votes || 0;
  
  // Calculate multiplier: (all votes / amount of bets option had)
  // Handle division by zero or very low bet counts
  const multiplier = winningVotes <= 0 ? 3 : totalVotes / winningVotes;
  
  // Calculate winning points: multiplier * 6, rounded
  const winnerPoints = Math.round(multiplier * 6);
  
  // Calculate losing points: winning points / 3, rounded
  const loserPoints = Math.round(winnerPoints / 3);
  
  return { winnerPoints, loserPoints };
}



// In the displayBettingOdds function:
function displayBettingOdds(options) {
  // First, check if we're getting valid options
  console.log("Options received:", JSON.stringify(options, null, 2));
  
  if (!options || options.length === 0) {
    return { error: "No betting options available.", options: [] };
  }
  
  // Get total votes across all options
  const totalVotes = options.reduce((sum, option) => sum + (option.votes || 0), 0);
  console.log("Total votes calculated:", totalVotes);
  
  // If no votes yet, return early with empty array but with error message
  if (totalVotes === 0) {
    console.log("No votes detected despite having options");
    return { error: "No bets placed yet.", options: [] };
  }
  
  // Create a copy of options to avoid modifying the original
  const optionsWithOdds = [...options];
  
  // Calculate the odds for each option
  optionsWithOdds.forEach(option => {
    option.odds = (option.votes || 0) / totalVotes;
    
    // Calculate payout multiplier (inverse of odds with adjustment)
    // Lower odds = higher payout
    option.payoutMultiplier = option.odds > 0 ? (1 / option.odds).toFixed(2) : "1.00";
    
    console.log(`Option "${option.name}": votes=${option.votes}, odds=${option.odds}, payout=${option.payoutMultiplier}`);
  });
  
  return { options: optionsWithOdds };
}


async function validateBetReactions(messageId, lockTime) {
  const activeBets = loadActiveBets();
  const match = activeBets[messageId];
  if (!match) return;

  console.log(`Validating bets for message ${messageId}`);
  
  const guild = client.guilds.cache.get(match.guildId);
  if (!guild) return;
  
  const channel = await guild.channels.fetch(match.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;
  
  // Clear existing vote counts
  match.options.forEach(option => {
    option.votes = 0;
  });
  
  // Process reaction counts
  match.totalBetsPlaced = 0;
  const betsByUser = new Map();
  
  // Get valid emojis for this bet
  const validEmojis = match.options.map(option => option.emoji);
  
  // Collect all reactions
  const reactions = message.reactions.cache;
  console.log(`Found ${reactions.size} reactions`);
  
  // CRITICAL: Remove invalid reactions that were added while bot was offline
  for (const [emoji, reaction] of reactions.entries()) {
    // Check if this reaction is one of our valid bet options
    if (!validEmojis.includes(emoji)) {
      console.log(`Removing invalid reaction: ${emoji}`);
      // Remove this invalid reaction
      await reaction.remove().catch(console.error);
      continue;
    }
    
    // For valid reactions, get users who reacted
    const users = await reaction.users.fetch();
    
    // Remove duplicate reactions from users who reacted to multiple options
    for (const user of users.values()) {
      // Skip bot reactions
      if (user.bot) continue;
      
      const userId = user.id;
      const previousBet = betsByUser.get(userId);
      
      if (previousBet && previousBet !== emoji) {
        // User already bet on a different option, remove this reaction
        console.log(`Removing duplicate reaction from user ${userId}: ${emoji}`);
        await reaction.users.remove(userId).catch(console.error);
      } else {
        // Record this as the user's bet
        betsByUser.set(userId, emoji);
      }
    }
  }
  
  // Now count the valid votes after cleaning up reactions
  for (const option of match.options) {
    const emoji = option.emoji;
    const reaction = reactions.find(r => r.emoji.name === emoji);
    
    if (reaction) {
      // Fetch users who reacted (should be clean now)
      const users = await reaction.users.fetch();
      
      // Filter out bot reactions
      const validUsers = users.filter(user => !user.bot);
      
      // Count votes for this option
      option.votes = validUsers.size;
      match.totalBetsPlaced += validUsers.size;
      
      console.log(`Option ${emoji}: ${option.votes} valid votes`);
    }
  }
  
  // Save the updated bet information
  activeBets[messageId] = match;
  saveActiveBets(activeBets);
  
  console.log(`Total valid bets for message ${messageId}: ${match.totalBetsPlaced}`);
  console.log("Updated options:", JSON.stringify(match.options, null, 2));
  
  return match;
}

// Replace your existing client.once("ready") event with this updated version
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Clear the active matches map and rebuild it from file
  activeMatches.clear();
  
  const activeBets = loadActiveBets();
  const now = Date.now();
  let saveNeeded = false;

  console.log(`Found ${Object.keys(activeBets).length} bets in the database`);

  for (const [messageId, match] of Object.entries(activeBets)) {
    if (!match.active) {
      console.log(`Skipping inactive bet: ${match.question}`);
      continue;
    }

    console.log(`Processing active bet: ${match.question} (Lock time: ${new Date(match.lockTime).toLocaleTimeString()})`);
    
    // Add to active matches map
    activeMatches.set(messageId, match.lockTime);
    
    // Check if this bet should be marked as locked
    if (now > match.lockTime && !match.lockMessageSent) {
      console.log(`Bet should be locked: ${match.question}`);
      // This bet should be locked but isn't marked as such yet
      // We'll let the interval function handle the actual locking
    }

    // Validate reactions on this bet
    console.log(`Validating bet ${messageId}: ${match.question}`);
    await validateBetReactions(messageId, match.lockTime);
  }

  if (saveNeeded) {
    saveActiveBets(activeBets);
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
        flags: MessageFlags.Ephemeral,
      });
    }

    const role = interaction.options.getRole("role");
    if (!role) {
      return interaction.reply({
        content: "❌ Please select a valid role.",
        flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
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
      flags: MessageFlags.Ephemeral,
    });
  }
  // --- Slash Command: /balance ---
  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "balance"
  ) {
    try {
      // Check if user has permission for modifying balance
      const canModify = hasPermission(interaction.member);

      // Get the target user
      const targetUser = interaction.options.getUser("user");
      const newBalance = interaction.options.getInteger("set");

      if (!targetUser) {
        return interaction.reply({
          content: "❌ Please select a valid user.",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Read user data
      const userData = fs.existsSync(userDataFile)
        ? JSON.parse(fs.readFileSync(userDataFile))
        : {};

      const currentBalance = userData[targetUser.id]
        ? userData[targetUser.id].points || 0 // <-- Accessing the points property correctly
        : 0;

      // If the user wants to set a new balance immediately using the "set" option
      if (newBalance !== null) {
        // Check if the user has permission
        if (!canModify) {
          return interaction.reply({
            content: "❌ You don't have permission to modify user balances.",
            flags: MessageFlags.Ephemeral,
          });
        }

        // Create the confirmation buttons
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm-balance-${targetUser.id}-${newBalance}`)
            .setLabel("Confirm")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`cancel-balance-${targetUser.id}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger)
        );

        // Show confirmation dialog
        return interaction.reply({
          content: `⚠️ Are you sure you want to change **${targetUser.username}**'s balance from **${currentBalance}** to **${newBalance}**?`,
          components: [confirmRow],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Create the balance embed
      const balanceEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`Balance: ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields({
          name: "Current Points",
          value: `${currentBalance}`,
          inline: true,
        })
        .setFooter({
          text: "Betting System",
        });

      // Create a modify button if the user has permission
      let components = [];
      if (canModify) {
        const modifyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`modify-balance-${targetUser.id}`)
            .setLabel("Modify Balance")
            .setStyle(ButtonStyle.Primary)
        );
        components.push(modifyRow);
      }

      return interaction.reply({
        embeds: [balanceEmbed],
        components: components,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Error in balance command:", error);
      return interaction.reply({
        content: "❌ An error occurred while checking the balance.",
        flags: MessageFlags.Ephemeral,
      });
    }
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
        ephemeral: true,
      });
    }

    const wEmoji = selectedOption.emoji;
    
    // Mark the winning option for our calculations
    match.options.forEach((opt, idx) => {
      opt.isWinner = (idx === parseInt(index));
    });
    
    // Calculate suggested point values based on odds
    const { winnerPoints, loserPoints } = calculatePointSuggestions(match);
    console.log(`Winner Points: ${winnerPoints}, Loser Points: ${loserPoints}`);

    const modal = new ModalBuilder()
      .setCustomId(`award-points-${messageId}-${encodeURIComponent(wEmoji)}`)
      .setTitle("Award Points");

    const winnerInput = new TextInputBuilder()
      .setCustomId("winner-points")
      .setLabel("Points for Winners")
      .setPlaceholder(`Suggested: ${winnerPoints} points`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)

    const looserInput = new TextInputBuilder()
      .setCustomId("looser-points")
      .setLabel("Points to Subtract from Losers")
      .setPlaceholder(`Suggested: ${loserPoints} points`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)

    const row1 = new ActionRowBuilder().addComponents(winnerInput);
    const row2 = new ActionRowBuilder().addComponents(looserInput);

    modal.addComponents(row1, row2);
    await interaction.showModal(modal);
  }
  // --- Balance Button Handlers ---
  if (
    interaction.isButton() &&
    interaction.customId.startsWith("confirm-balance-")
  ) {
    try {
      // Check if user has permission
      if (!hasPermission(interaction.member)) {
        return interaction.reply({
          content: "❌ You don't have permission to modify user balances.",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Parse the customId
      const parts = interaction.customId.split("-");
      const userId = parts[2];
      const newBalance = parseInt(parts[3]);

      // Read user data
      const userData = fs.existsSync(userDataFile)
        ? JSON.parse(fs.readFileSync(userDataFile))
        : {};

      // Get current balance
      const oldBalance = userData[userId] ? userData[userId].points || 0 : 0;

      // Update the balance
      if (!userData[userId]) userData[userId] = {};
      userData[userId].points = newBalance;

      // Save the updated data
      fs.writeFileSync(userDataFile, JSON.stringify(userData, null, 2));

      try {
        // Try to fetch the user for a better message
        const user = await client.users.fetch(userId);

        // Send a DM to the user about their balance change
        try {
          const userEmbed = new EmbedBuilder()
            .setColor(0xf39c12) // Orange color
            .setTitle(`Your Points Balance Has Changed`)
            .addFields(
              {
                name: "Previous Balance",
                value: `${oldBalance}`,
                inline: true,
              },
              { name: "New Balance", value: `${newBalance}`, inline: true },
              {
                name: "Changed By",
                value: `${interaction.user.username}`,
                inline: false,
              }
            )
            .setFooter({
              text: `Betting System`,
            });

          await user.send({ embeds: [userEmbed] });
        } catch (err) {
          console.error(`Failed to DM user ${user.username}:`, err);
        }

        // Reply with success message
        await interaction.update({
          content: `✅ Successfully updated ${user.username}'s balance from ${oldBalance} to ${newBalance}.`,
          components: [],
        });
      } catch (error) {
        // If we can't fetch the user, use the ID
        await interaction.update({
          content: `✅ Successfully updated user ID ${userId}'s balance from ${oldBalance} to ${newBalance}.`,
          components: [],
        });
      }
    } catch (error) {
      console.error("Error processing balance confirmation:", error);
      await interaction.update({
        content: `❌ An error occurred while updating the balance: ${error.message}`,
        components: [],
      });
    }
  }
  // --- Modify Balance Button Handler ---
  if (
    interaction.isButton() &&
    interaction.customId.startsWith("modify-balance-")
  ) {
    try {
      // Check if user has permission
      if (!hasPermission(interaction.member)) {
        return interaction.reply({
          content: "❌ You don't have permission to modify user balances.",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Parse the user ID from the custom ID
      const userId = interaction.customId.split("-")[2];

      // Read user data
      const userData = fs.existsSync(userDataFile)
        ? JSON.parse(fs.readFileSync(userDataFile))
        : {};

      // Get current balance
      const currentBalance = userData[userId]
        ? userData[userId].points || 0
        : 0;

      try {
        // Try to fetch the user to display their name in the modal
        const user = await client.users.fetch(userId);

        // Create and show the balance update modal
        const modal = new ModalBuilder()
          .setCustomId(`balance-modal-${userId}`)
          .setTitle(`Update Balance for ${user.username}`);

        const balanceInput = new TextInputBuilder()
          .setCustomId("new-balance")
          .setLabel(`Current Balance: ${currentBalance}`)
          .setPlaceholder("Enter new balance")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(currentBalance.toString());

        const reasonInput = new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Reason for change")
          .setPlaceholder("Enter reason (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const balanceRow = new ActionRowBuilder().addComponents(balanceInput);
        const reasonRow = new ActionRowBuilder().addComponents(reasonInput);

        modal.addComponents(balanceRow, reasonRow);
        await interaction.showModal(modal);
      } catch (error) {
        console.error("Error fetching user:", error);

        // If we can't fetch the user, use a generic modal title
        const modal = new ModalBuilder()
          .setCustomId(`balance-modal-${userId}`)
          .setTitle(`Update Balance for User ID: ${userId}`);

        const balanceInput = new TextInputBuilder()
          .setCustomId("new-balance")
          .setLabel(`Current Balance: ${currentBalance}`)
          .setPlaceholder("Enter new balance")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(currentBalance.toString());

        const reasonInput = new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Reason for change")
          .setPlaceholder("Enter reason (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const balanceRow = new ActionRowBuilder().addComponents(balanceInput);
        const reasonRow = new ActionRowBuilder().addComponents(reasonInput);

        modal.addComponents(balanceRow, reasonRow);
        await interaction.showModal(modal);
      }
    } catch (error) {
      console.error("Error showing balance update modal:", error);
      return interaction.reply({
        content: `❌ An error occurred while opening the balance update modal: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  if (
    interaction.isButton() &&
    interaction.customId.startsWith("cancel-balance-")
  ) {
    return interaction.update({
      content: "❌ Balance update cancelled.",
      components: [],
    });
  }
  // --- Balance Modal Submit Handler ---
  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith("balance-modal-")
  ) {
    // Get the user ID from the custom ID
    const userId = interaction.customId.split("-")[2];

    try {
      // Check if user has permission
      if (!hasPermission(interaction.member)) {
        return interaction.reply({
          content: "❌ You don't have permission to modify user balances.",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Get the new balance value from the modal
      const newBalanceStr = interaction.fields.getTextInputValue("new-balance");
      const newBalance = parseInt(newBalanceStr);

      // Get optional reason
      let reason;
      try {
        reason = interaction.fields.getTextInputValue("reason");
      } catch (e) {
        reason = "No reason provided";
      }

      // Validate input is a number
      if (isNaN(newBalance)) {
        return interaction.reply({
          content: "❌ Please enter a valid number for the balance.",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Read user data
      const userData = fs.existsSync(userDataFile)
        ? JSON.parse(fs.readFileSync(userDataFile))
        : {};

      // Get current balance
      const oldBalance = userData[userId] ? userData[userId].points || 0 : 0;

      // Update the balance
      if (!userData[userId]) userData[userId] = {};
      userData[userId].points = newBalance;

      // Save the updated data
      fs.writeFileSync(userDataFile, JSON.stringify(userData, null, 2));

      try {
        // Try to fetch the user for a better message
        const user = await client.users.fetch(userId);

        // Send a DM to the user about their balance change
        try {
          const userEmbed = new EmbedBuilder()
            .setColor(0xf39c12) // Orange color
            .setTitle(`Your Points Balance Has Changed`)
            .addFields(
              {
                name: "Previous Balance",
                value: `${oldBalance}`,
                inline: true,
              },
              { name: "New Balance", value: `${newBalance}`, inline: true },
              {
                name: "Changed By",
                value: `${interaction.user.username}`,
                inline: false,
              },
              {
                name: "Reason",
                value: reason || "No reason provided",
                inline: false,
              }
            )
            .setFooter({
              text: `Betting System`,
            });

          await user.send({ embeds: [userEmbed] });
        } catch (err) {
          console.error(`Failed to DM user ${user.username}:`, err);
        }

        // Create a success embed
        const successEmbed = new EmbedBuilder()
          .setColor(0x2ecc71) // Green color
          .setTitle(`Balance Updated Successfully`)
          .setDescription(`${user.username}'s balance has been updated.`)
          .addFields(
            { name: "Previous Balance", value: `${oldBalance}`, inline: true },
            { name: "New Balance", value: `${newBalance}`, inline: true },
            {
              name: "Reason",
              value: reason || "No reason provided",
              inline: false,
            }
          )
          .setFooter({
            text: `Betting System`,
          });

        // Reply with the success message
        await interaction.reply({
          embeds: [successEmbed],
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        // If we can't fetch the user, use the ID
        const successEmbed = new EmbedBuilder()
          .setColor(0x2ecc71) // Green color
          .setTitle(`Balance Updated Successfully`)
          .setDescription(`User ID: ${userId}'s balance has been updated.`)
          .addFields(
            { name: "Previous Balance", value: `${oldBalance}`, inline: true },
            { name: "New Balance", value: `${newBalance}`, inline: true },
            {
              name: "Reason",
              value: reason || "No reason provided",
              inline: false,
            }
          )
          .setFooter({
            text: `Betting System`,
          });

        await interaction.reply({
          embeds: [successEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      console.error("Error processing balance update:", error);
      return interaction.reply({
        content: `❌ An error occurred while updating the balance: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
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
        .setColor(0xff0000) // RED for closed bets
        .setTitle(`🏁 ${match.question}`)
        .setDescription(`Match has ended! Winning option: **${winLabel}**\n Distribution of votes:`)
        .addFields(
          { name: "\u200B", value: "**Betting Options**", inline: false },
          ...match.options.map((opt) => {
            const totalVotes = match.options.reduce(
              (sum, option) => sum + option.votes,
              0
            );
            const percentage =
              totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
            const isWinner = doEmojisMatch(opt.emoji, wEmoji);

            return {
              name: `${opt.label} ${isWinner ? "✅" : ""}`,
              value: `${percentage}%`,
              inline: true,
            };
          }),
          // Add one more field to show winner/loser points
          {
            name: "\u200B",
            value: `Winners: +${winnerValue}\nLosers: -${looserValue}`,
            inline: false,
          }
        )
        .setFooter({
          text: "Betting System",
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
      flags: MessageFlags.Ephemeral,
    });
  }

  const question = interaction.options.getString("text");
  const timeStr = interaction.options.getString("time");
  const optionStr = interaction.options.getString("options");

  const lockTimestamp = parseTimeString(timeStr);
  if (isNaN(lockTimestamp) || lockTimestamp < Date.now()) {
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
    // Generate Discord timestamp for the lock time
    const discordTimestamp = createDiscordTimestamp(lockTimestamp);

    // Create a nice embed for the bet
    const betEmbed = new EmbedBuilder()
      .setColor(0x3498db) // Nice blue color
      .setTitle(`${question}`)
      .setDescription(
        `🔒 Betting locks at ${discordTimestamp}\nReact with one of the options below to place your bet!`
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
        text: `Betting System`,
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
      lockTime: lockTimestamp,
      active: true,
      createdAt: Date.now(),
      createdBy: interaction.user.id,
      channelId: interaction.channel.id,
      guildId: interaction.guild.id,
    };

    saveActiveBets(activeBets);
    activeMatches.set(sentMessage.id, lockTimestamp);

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
      flags: MessageFlags.Ephemeral,
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

  // Create buttons for each option, but distribute across multiple action rows if needed
  const rows = [];
  let currentRow = new ActionRowBuilder();
  let currentRowComponents = 0;
  const maxComponentsPerRow = 5;

  match.options.forEach((option, index) => {
    // If the current row has reached the maximum number of components, create a new row
    if (currentRowComponents >= maxComponentsPerRow) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
      currentRowComponents = 0;
    }

    // Add the button to the current row
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`winner-${selectedMatchId}-${index}`)
        .setLabel(option.label)
        .setEmoji(option.emoji)
        .setStyle(ButtonStyle.Primary)
    );
    
    currentRowComponents++;
  });

  // Add the last row if it has any components
  if (currentRowComponents > 0) {
    rows.push(currentRow);
  }

  return interaction.reply({
    content: `🏆 Select the winner for:\n**${match.question}**`,
    components: rows,  
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
          flags: MessageFlags.Ephemeral,
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
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      console.error("Error reading user data for leaderboard:", error);
      return interaction.reply({
        content: "An error occurred while generating the leaderboard.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // --- Slash Command: /balance ---
  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "balance"
  ) {
    try {
      // Check if user has permission for modifying balance
      const canModify = hasPermission(interaction.member);

      // Get the target user
      const targetUser = interaction.options.getUser("user");
      const newBalance = interaction.options.getInteger("set");

      if (!targetUser) {
        return interaction.reply({
          content: "❌ Please select a valid user.",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Read user data
      const userData = fs.existsSync(userDataFile)
        ? JSON.parse(fs.readFileSync(userDataFile))
        : {};

      // Get current balance
      const currentBalance = userData[targetUser.id]
        ? userData[targetUser.id].points
        : 0;

      // If the user wants to set a new balance
      if (newBalance !== null) {
        // Check if the user has permission
        if (!canModify) {
          return interaction.reply({
            content: "❌ You don't have permission to modify user balances.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    } catch (error) {
      console.error("Error in balance command:", error);
      return interaction.reply({
        content: "❌ An error occurred while checking the balance.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

// Modify the messageReactionAdd event handler to check if the bet is locked properly
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
  const activeBets = loadActiveBets();
  const match = activeBets[messageId];
  
  // Check for locktime directly from the match data, not just activeMatches map
  if (!match || !match.active) return;
  
  // Very important: Check if the bet is locked! If current time is past lockTime, remove the reaction
  const now = Date.now();
  if (now > match.lockTime) {
    console.log(`Removing reaction from ${user.username} because the bet is locked`);
    await reaction.users.remove(user.id);
    return;
  }

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

  // Ensure user only has one reaction (remove other reactions)
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

setInterval(async () => {
  if (activeMatches.size === 0) return;
  const now = Date.now();
  const activeBets = loadActiveBets();
  let saveNeeded = false;
  
  for (const [messageId, lockTime] of activeMatches.entries()) {
    if (now > lockTime) {
      const match = activeBets[messageId];
      if (match && match.active && !match.lockMessageSent) {
        try {
          const guild = client.guilds.cache.get(match.guildId);
          if (!guild) continue;
          const channel = await guild.channels.fetch(match.channelId).catch(() => null);
          if (!channel || !channel.isTextBased()) continue;
          const targetMessage = await channel.messages.fetch(messageId).catch(() => null);
          if (!targetMessage) continue;
          const discordTimestamp = createDiscordTimestamp(now);
          
          // Wait for validation to complete and use its updated results
          const updatedMatch = await validateBetReactions(messageId, lockTime);
          if (!updatedMatch) continue;
          
          // Use the updated match data with fresh vote counts
          const bettingOddsResult = displayBettingOdds(updatedMatch.options);
          
          const lockedEmbed = EmbedBuilder.from(targetMessage.embeds[0])
            .setColor(0xff9800)
            .setTitle(`🔒 ${match.question}`)
            .setDescription(`Bet locked at ${discordTimestamp}, awaiting results...${bettingOddsResult.error ? `\n\n${bettingOddsResult.error}` : ''}`)
            .setFooter({ text: `${updatedMatch.totalBetsPlaced || 0} bets placed • Betting System` });
          
          // Clear existing fields to prevent duplicates
          lockedEmbed.setFields([]);
          
          // Add fields for each option with their odds if available
          if (bettingOddsResult.options && bettingOddsResult.options.length > 0) {
            bettingOddsResult.options.forEach(option => {
              lockedEmbed.addFields({
                name: `${option.emoji} ${option.label}`, 
                value: `${option.payoutMultiplier}x`, 
                inline: true
              });
            });
          }
          
          await targetMessage.edit({ embeds: [lockedEmbed] });
          match.lockMessageSent = true;
          match.lockedAt = now;
          activeBets[messageId] = match;
          saveNeeded = true;
        } catch (error) {
          console.error(`Error processing locked bet for message ${messageId}:`, error);
          const guild = client.guilds.cache.get(match.guildId);
          if (!guild) continue;
          const channel = await guild.channels.fetch(match.channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            await channel.send(`❌ Failed to update locked bet message \`${messageId}\`:\n\`\`\`${error.message || error}\`\`\``);
          }
        }
      }
    }
  }
  
  if (saveNeeded) {
    saveActiveBets(activeBets);
  }
}, 5000);

client.login(process.env.TOKEN);
