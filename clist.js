const { REST, Routes } = require("discord.js");
require("dotenv").config();

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  const appId = process.env.CLIENT_ID; // Your bot's application ID
  const guildId = process.env.GUILD_ID; // Optional if checking guild commands

  try {
    // Global commands
    const global = await rest.get(Routes.applicationCommands(appId));
    console.log("🌍 Global commands:");
    console.log(global.map((c) => `${c.name} (${c.id})`).join("\n"));

    // Guild commands (optional)
    const guild = await rest.get(
      Routes.applicationGuildCommands(appId, guildId)
    );
    console.log("\n🏠 Guild commands:");
    console.log(guild.map((c) => `${c.name} (${c.id})`).join("\n"));
  } catch (err) {
    console.error("❌ Failed to fetch commands:", err);
  }
})();
