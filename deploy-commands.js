// deploy-commands.js
const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName("bet")
    .setDescription("Start a new prediction bet")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription(
          "Bet question or title (e.g. Vice Underdogs vs. Miami Killers)"
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("Lock time (HH:MM, 24-hour)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("options")
        .setDescription(
          'Options separated by "|", each as "label emoji" (e.g. VU 🦈|MK 🐍)'
        )
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("winner")
    .setDescription("Select a bet to declare the winner")
    .addStringOption((option) =>
      option
        .setName("match")
        .setDescription("Start typing to select an active bet")
        .setAutocomplete(true) // 💡 enables dynamic dropdown
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("assign")
    .setDescription("Set which roles can use betting commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("The role to give betting permissions to")
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("top")
    .setDescription("Check the top 10 users"),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("View or modify a user's point balance")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user whose balance you want to check or modify")
        .setRequired(true)
    ),
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log("✅ Slash command registered.");
  } catch (error) {
    console.error("❌ Error registering command:", error);
  }
})();
