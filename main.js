const Eris = require("eris");
const settings = require("data-store")({path: "settings.json"});
const mysql = require("mysql2");
const reload = require('require-reload')(require);
const fs = require('fs');
let ready = false;
let pool;
let promisePool;
let modules = {};
let memberships = {};
let guildMemberships = {};
let guildSettings = {};

let initialTime = new Date().getTime();

if (Object.keys(settings.get()).length === 0) {
    settings.set("token", "Paste token here");
    settings.set("managers", ["Paste manager ID here"]);
    settings.set("prefix", "w!");
    settings.set("mentionAsPrefix", true);
    settings.set("database", {
        host: "",
        user: "",
        password: "",
        database: "",
        waitForConnections: true,
        connectionLimit: 10
    });
    console.log("[!] 'settings.json' has been generated. Please insert your details accordingly and restart Warden.");
    process.exit(1);
}

if (!settings.get("token") || typeof settings.get("token") !== "string" || settings.get("token") === "Paste token here") {
    settings.set("token", "Paste token here");
    console.log("[!] Unable to start Warden: No bot token provided");
    process.exit(1);
}

if (!settings.get("managers") || typeof settings.get("managers") !== "object" || settings.get("managers").length < 1 || settings.get("managers") === ["Paste manager ID here"]) {
    settings.set("managers", ["Paste manager ID here"]);
    console.log("[!] Unable to start Warden: No manager ID provided");
    process.exit(1);
}

if (!settings.get("database")) {
    settings.set("database", {
        host: "",
        user: "",
        password: "",
        database: "",
        waitForConnections: true,
        connectionLimit: 10
    });
    console.log("[!] Unable to start Warden: No database provided");
    process.exit(1);
}
else {
    pool = mysql.createPool(settings.get("database"));
    promisePool = pool.promise();
    promisePool.query("SELECT 1")
        .then(() => {
            console.log("[✓] Successfully established connection to database");
        })
        .catch(err => {
            console.log("[!] Unable to start Warden: Invalid database provided (detailed error below)");
            console.log(err);
            process.exit(1);
        });
    (async () => {
        let m = await promisePool.query("SELECT * FROM `memberships`");
        let g = await promisePool.query("SELECT * FROM `guilds`");
        let s = await promisePool.query("SELECT * FROM `guilds_warden`");
        m[0].forEach(me => {
            memberships[me["userid"]] = me;
        });
        g[0].forEach(gm => {
            guildMemberships[gm["guildid"]] = gm;
        });
        s[0].forEach(gs => {
            guildSettings[gs["guildid"]] = gs;
        });
        m = null;
        g = null;
        s = null;
        settings.get("managers").forEach(managerId => {
            if (!(managerId in memberships) || (managerId in memberships && memberships[managerId]["manager"] === 0)) {
                console.log(`[!] Manager ID '${managerId}' is present in the settings file but not a manager in the database`);
            }
        });
        Object.keys(memberships).filter(memberId => memberships[memberId]["manager"] === 1).forEach(memberId => {
            if (!settings.get("managers").includes(memberships[memberId]["userid"])) {
                console.log(`[!] Manager ID '${memberId}' is present in the database but not a manager in the settings file`);
            }
        });
    })();
}

if (!settings.get("prefix")) {
    settings.set("prefix", "w!");
    console.log("[!] Defaulted Warden's prefix to 'w!'");
}

if (!settings.get("mentionAsPrefix") || typeof settings.get("mentionAsPrefix") !== "boolean") {
    settings.set("mentionAsPrefix", true);
    console.log("[!] Enabled Mention As Prefix by default");
}

console.log("[^] Loading modules...");
fs.readdir("modules", {withFileTypes: true}, (err, files) => {
    if (err) {
        console.log("[!] Unable to start Warden: Could not read modules folder (detailed error below)");
        console.log(err);
        process.exit(1);
    }
    files.forEach((f, i) => {
        if (!f.isDirectory()) {
            console.log(`[!] Unable to start Warden: Non-folder (${f.name}) in modules folder`);
            process.exit(1);
        }
        if (f.name.includes(" ")) {
            console.log(`[!] Unable to start Warden: Module name contains space (${f.name})`);
            process.exit(1);
        }
        console.log(`[^] Loading module '${f.name}' (${i+1}/${files.length})`);
        modules[f.name] = {};
        try {
            let subfiles = fs.readdirSync(`modules/${f.name}`, {withFileTypes: true});
            if (subfiles.length === 0) {
                console.log(`[!] No actions found in '${f.name}'`);
            }
            else {
                subfiles.forEach((sf, idx) => {
                    if (!sf.isFile()) {
                        console.log(`[!] Unable to start Warden: Non-file (${sf.name}) in '${f.name}' folder`);
                        process.exit(1);
                    }
                    let split = sf.name.split(".");
                    if (split[split.length - 1] !== "js") {
                        console.log(`[!] Unable to start Warden: Non-JS file (${sf.name}) in '${f.name}' folder`);
                        process.exit(1);
                    }
                    if (sf.name.includes(" ")) {
                        console.log(`[!] Unable to start Warden: Action name contains space (${sf.name.slice(0, -3)})`);
                        process.exit(1);
                    }
                    console.log(`[^] Loading action '${sf.name.slice(0, -3)}' (${idx+1}/${subfiles.length})`);
                    modules[f.name][sf.name.slice(0, -3)] = reload(`./modules/${f.name}/${sf.name}`);
                    console.log(`[✓] Loaded action '${sf.name.slice(0, -3)}'`);
                });
            }
            subfiles = null;
        }
        catch (err) {
            console.log(`[!] Unable to read module '${f.name}'`);
        }
        console.log(`[✓] Loaded module '${f.name}'`);
    });
});

const bot = new Eris(settings.get("token"));

bot.on("ready", () => {
    if (!ready) {
        let timeTaken = (new Date().getTime() - initialTime) / 1000;
        console.log(`[✓] Warden started successfully (took ${timeTaken}s)`);
        console.log(`[>] Running build ${fs.readFileSync(".git/refs/heads/master").toString().replace("\n", "")}`);
        console.log(`[>] Logged in to Discord as ${bot.user.username}#${bot.user.discriminator} (${bot.user.id})`);
        console.log(`[>] Connected to ${bot.guilds.size} guild${bot.guilds.size === 1 ? "" : "s"}`);
        console.log(`[>] Invite link: https://discord.com/oauth2/authorize?client_id=${bot.user.id}&scope=bot&permissions=8`);
        initialTime = null;
        timeTaken = null;
        ready = true;
        bot.options.defaultImageFormat = "png";
        bot.editStatus("dnd", {name: "for suspicious activity", type: 3});
    }
});

bot.on("connect", id => {
    console.log(`[^] Shard ${id} connecting...`);
});

bot.on("error", (err, id) => {
    console.log(`[^] Shard ${id} encountered an error (detailed error below)`);
    console.log(err);
});

bot.on("shardDisconnect", (err, id) => {
    console.log(`[^] Shard ${id} disconnected${err ? " (detailed error below)" : ""}`);
    if (err) {
        console.log(err);
    }
});

bot.on("shardPreReady", id => {
    console.log(`[^] Shard ${id} pre-ready`);
});

bot.on("shardReady", id => {
    console.log(`[✓] Shard ${id} ready`);
});

bot.on("shardResume", id => {
    console.log(`[✓] Shard ${id} resumed`);
});

bot.on("messageCreate", msg => {
    let prefix;
    let mention = false;
    let guild = "guild" in msg.channel;
    if (guild && msg.channel.guild.id in guildSettings) {
        prefix = guildSettings[msg.channel.guild.id].prefix;
    }
    else {
        prefix = settings.get("prefix");
    }
    if (settings.get("mentionAsPrefix") && msg.mentions.length > 0 && msg.mentions[0].id === bot.user.id) {
        let firstContent = msg.content.split(" ")[0];
        if ([`<@${bot.user.id}>`, `<@!${bot.user.id}>`].includes(firstContent)) {
            prefix = `${firstContent} `;
            mention = true;
        }
    }
    if (msg.content.startsWith(prefix)) {
        let content = msg.content.replace(prefix, "");
        if (mention) {
            let count = (content.match(/<@!?(\d+)>/g) || []).length;
            if (count === 0)  {
                msg.mentions.splice(0, 1);
            }
        }
        let cmd = content.split(" ")[0].toLowerCase();
        let body = content.split(" ").slice(1).join(" ");
        Object.keys(modules).forEach(module => {
            Object.keys(modules[module]).forEach(action => {
                if ("commands" in modules[module][action] && modules[module][action]["commands"].includes(cmd) && "action" in modules[module][action] && typeof modules[module][action]["action"] === "function") {
                    let actionFunction = modules[module][action]["action"];
                    let result = actionFunction({prefix: prefix, cmd: cmd, body: body, guild: guild, message: msg});
                    console.log(`[C] ${guild ? `${msg.channel.guild.name} (${msg.channel.guild.id}) | ` : ""}${msg.author.username}#${msg.author.discriminator} (${msg.author.id}): ${msg.content}`);
                    if (!result) {
                        if ("usage" in modules[module][action]) {
                            let usage = modules[module][action]["usage"].replace(/%cmd%/g, cmd);
                            msg.channel.createMessage({
                                messageReferenceID: msg.id,
                                embed: {
                                    description: `Usage: ${prefix}${usage}`,
                                    color: 0x2518a0
                                }
                            });
                        }
                        else {
                            msg.channel.createMessage({
                                messageReferenceID: msg.id,
                                embed: {
                                    description: `Command execution failed with no reason specified.`,
                                    color: 0x2518a0
                                }
                            });
                        }
                    }
                }
            });
        });
    }
});

bot.connect();