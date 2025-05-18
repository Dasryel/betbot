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
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("Bet question or title (e.g. Vice Underdogs vs. Miami Killers)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("Lock time (HH:MM, 24-hour) Time MUST BE in Netherland's timezone (GMT +2:00)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("options")
        .setDescription('Options separated by "|" each as "label emoji" (e.g. VU 🦈|MK 🐍)')
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("winner")
    .setDescription("Select a bet to declare the winner")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("match")
        .setDescription("Start typing to select an active bet")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("assign")
    .setDescription("Set which roles can use betting commands")
    .setDMPermission(false)
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
    .setDescription("Check the top 10 users")
    .setDMPermission(false)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("View a user's point balance")
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user whose balance you want to check")
        .setRequired(true)
    )
    .toJSON(),
];


const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Started refreshing global application (/) commands...');
    
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    
    console.log('✅ Successfully registered global application commands.');
  } catch (error) {
    console.error('❌ Error registering global commands:', error);
  }
})();

